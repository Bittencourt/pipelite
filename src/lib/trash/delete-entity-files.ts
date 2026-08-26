/**
 * SEC-04 — best-effort deletion of a purged record's blobs.
 *
 * ## Why this NEVER throws, and never rethrows
 *
 * A purge is COMMITTED before this runs. SC-2's requirement is that a storage failure must not
 * undo, block or misreport that commit: the row is gone, and the bytes failing to follow is a
 * fact to be logged, not an error to be raised. So every failure path here is a `continue`, and
 * the only channel out is the returned count. A throw from this module would be the defect, not
 * a diagnostic — the caller's `try/catch` would report a successful purge as a failure, and the
 * user would retry a delete that already happened.
 *
 * ## Why the returned count matters, and why it can be SHORT
 *
 * The caller (plan 49-07) compares `deleted` against `refs.length` and logs a mismatch. That log
 * is only reachable because this function returns what it ACTUALLY deleted rather than what it
 * was asked to delete. A version that returned `refs.length` unconditionally would be a gate
 * that cannot fail, and the phase's whole point is that the blobs stop surviving silently.
 *
 * ## Why an already-absent blob COUNTS as deleted
 *
 * A DECISION, not an oversight. The goal state is "the blob is gone", and an absent blob is in
 * that state. Counting it as a failure would fire the mismatch log on every re-purge and every
 * hand-cleaned record, which trains the reader to ignore the one line that means something. The
 * mismatch is reserved for a REAL failure: a blob that is present and could not be removed.
 *
 * ## Why the env is read at CALL TIME
 *
 * `src/app/api/upload/route.ts:18-19` and the file download route both read `process.env` at
 * MODULE-EVALUATION time (`const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads'`). That is
 * what makes them untestable from a host process: a test that assigns `process.env.UPLOAD_DIR`
 * after importing them has no effect, so a filesystem-level proof has to pre-set the variable
 * before import or run inside the container. This module carries no such constraint and takes the
 * other choice deliberately, and plan 49-07's live-database proof depends on it: pointing
 * `UPLOAD_DIR` at a temp directory in a `beforeEach` is what lets that plan verify the blob is
 * really gone without `vi.hoisted` import gymnastics. The cost is one `process.env` read per
 * purge, which is nothing next to the `unlink` it precedes.
 *
 * NOTE: neither existing route is modified by this module, and neither should be. Both are
 * asserted to contain the literal `process.env.UPLOAD_DIR` by
 * `src/lib/__tests__/compose-uploads-persistence.test.ts:399-404`; that gate's house rule is
 * "on a collision REWORD THE PROSE, never weaken the gate". This module reading the same variable
 * is purely additive.
 *
 * ## Why the empty upload directory tree is left behind
 *
 * After the last blob under `${UPLOAD_DIR}/${entityId}/${fieldName}/` is unlinked, the directory
 * remains. That is deliberately out of scope: `rmdir` racing a concurrent upload into the same
 * directory is a real hazard (an upload that has created the directory but not yet written its
 * bytes loses them, or the `rmdir` fails spuriously and looks like a deletion failure) for a
 * marginal gain in inodes. SC-2 says "the blob is gone", not "the directory is gone".
 *
 * ## What this module deliberately does NOT do
 *
 * It does not log. The mismatch log belongs to the caller, one line per purged record, carrying
 * identifiers and counts only and never a filename (T-37-30, stated at
 * `src/lib/trash/prune.ts:212-213`). Keeping the log out of here keeps the log-scope surface at
 * the four known purge call sites — `src/lib/log-scope-format.test.ts` asserts call-site equality
 * between `log.<level>(` occurrences and extracted scope literals and has gone red twice.
 */
import { existsSync } from "fs"
import { unlink } from "fs/promises"
import path from "path"

import type { BlobRef } from "./collect-file-field-refs"

/**
 * Is `target` a DIRECT child of `parent`?
 *
 * Checked with `path.relative` after both sides are resolved, so a `..` segment anywhere in
 * `entityId`, `fieldName` or `storedName` has already been collapsed by the time it is examined.
 * Every one of those three segments comes out of a database row — `storedName` and `fieldName`
 * out of the JSONB column itself — so all three are untrusted input on the way to `unlink`.
 *
 * Containment is checked against the FIELD directory rather than the upload root, and the extra
 * strictness is load-bearing: `storedName = "../../escape.txt"` resolves back INTO the upload
 * root, so a root-level check would allow it. The reachable attack is not "delete something
 * outside /tmp", it is one record's poisoned value deleting a DIFFERENT record's blob.
 */
function isDirectChild(parent: string, target: string): boolean {
  const relative = path.relative(parent, target)
  if (relative === "") return false // the directory itself
  if (relative.startsWith("..")) return false // climbed out
  if (path.isAbsolute(relative)) return false // a different root entirely
  return !relative.includes(path.sep) // a nested path, not a single segment
}

/**
 * Delete every blob these refs name. Resolves to the number ACTUALLY deleted; never rejects.
 *
 * `deleted < refs.length` means at least one blob is still there and the caller should log it.
 */
export async function deleteEntityFiles(refs: readonly BlobRef[]): Promise<{ deleted: number }> {
  // Before any environment read, so the no-op case cannot be sent at the '/tmp/uploads' default
  // by a deployment that never set UPLOAD_DIR.
  if (refs.length === 0) return { deleted: 0 }

  // CALL TIME, not module scope. See the header.
  const storageType = process.env.FILE_STORAGE || "local"
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || "/tmp/uploads")

  if (storageType === "s3") return deleteFromS3(refs)

  let deleted = 0

  for (const ref of refs) {
    // One try per ref. A single try around the whole loop would let the FIRST undeletable blob
    // abandon every blob after it — the shape of failure this phase exists to remove, arriving
    // one level down.
    try {
      const fieldDir = path.resolve(uploadRoot, ref.entityId, ref.fieldName)
      // The field directory is built from two untrusted segments, so it needs the same check.
      // `isDirectChild` is not usable for the root→field hop (that one is two levels deep), so
      // it is spelled out with the same three tests.
      const fieldRelative = path.relative(uploadRoot, fieldDir)
      if (
        fieldRelative === "" ||
        fieldRelative.startsWith("..") ||
        path.isAbsolute(fieldRelative)
      ) {
        continue
      }

      const target = path.resolve(fieldDir, ref.storedName)
      // Refused WITHOUT counting: a refusal that counted as deleted would hide itself from the
      // caller's mismatch log, which is the only place it can ever be seen.
      if (!isDirectChild(fieldDir, target)) continue

      if (!existsSync(target)) {
        // Already in the goal state. See the header for why this counts.
        deleted += 1
        continue
      }

      await unlink(target)
      deleted += 1
    } catch {
      // Swallowed on purpose, and swallowed WITHOUT logging: the count going short is the
      // signal, and the caller is the one holding the record identifiers worth logging.
      continue
    }
  }

  return { deleted }
}

/**
 * The S3 branch.
 *
 * NOT PROVEN BEHAVIOURALLY. `FILE_STORAGE` is unset in every environment this phase can reach
 * and no bucket is configured, so the sibling test covers this with a mocked
 * `@aws-sdk/client-s3` and says so in its own prose. This is a call-shape mirror of
 * `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`'s `DELETE`, and it is NOT
 * evidence for SC-1 or SC-2 (SEC-49-A owns the real S3 exposure).
 *
 * The SDK is imported lazily so the local branch — the only one any current deployment takes —
 * never pays to load it. The client is built per call rather than cached at module scope: a
 * cached client would freeze the first call's configuration and quietly undo the call-time
 * environment read this module exists to provide. One client construction per purge is free next
 * to the network round trips it is about to make.
 */
async function deleteFromS3(refs: readonly BlobRef[]): Promise<{ deleted: number }> {
  if (!process.env.S3_ENDPOINT) {
    // The file route answers a 500 here. A purge has no response to write, so the honest outcome
    // is a count of zero that the caller's mismatch log will surface.
    return { deleted: 0 }
  }

  let client
  let DeleteObjectCommand
  try {
    const sdk = await import("@aws-sdk/client-s3")
    DeleteObjectCommand = sdk.DeleteObjectCommand
    client = new sdk.S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "auto",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
    })
  } catch {
    return { deleted: 0 }
  }

  let deleted = 0

  for (const ref of refs) {
    try {
      // The key shape the upload route mints (`src/app/api/upload/route.ts:79`). Note this is
      // NOT the local path: the two agree on the suffix and disagree on everything before it.
      const key = `${ref.entityId}/${ref.fieldName}/${ref.storedName}`
      await client.send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: key,
        })
      )
      deleted += 1
    } catch {
      continue
    }
  }

  return { deleted }
}
