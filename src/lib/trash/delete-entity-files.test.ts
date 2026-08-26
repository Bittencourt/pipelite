/**
 * SEC-04 — deleting a purged record's blobs, best-effort, with a count that can go SHORT.
 *
 * These cells run against a REAL filesystem: a `mkdtemp` sandbox, real bytes written and really
 * unlinked. That is deliberate. The contract is not "the right calls were made" — a mock proves
 * that and proves nothing about EISDIR, about `path.resolve` collapsing a `..`, or about a loop
 * that aborts on the first rejection. The one cell that IS a mock says so in its own prose.
 *
 * Three things are being driven rather than described:
 *
 *   1. THE COUNT CAN BE SHORT. `deleteEntityFiles` returns what it actually deleted, so plan
 *      49-07 can compute `expected !== deleted` and log a mismatch. A helper that always returned
 *      `refs.length` would make that log unreachable — a gate that cannot fail — so the injected
 *      failure below asserts a shortfall of a NAMED integer, not merely "less than".
 *   2. IT NEVER THROWS. SC-2 requires the purge to stay COMMITTED when storage deletion fails.
 *      A throw here would be the defect, not a diagnostic, so the failure cells assert
 *      `resolves`, never a bare `await`.
 *   3. A POISONED `storedName` IS REFUSED. `storedName` comes out of a JSONB column, and it is
 *      interpolated into a path that reaches `unlink`. Each refusal cell asserts the escape
 *      target SURVIVES — without that half, a refusal is indistinguishable from a failed unlink.
 *
 * The sandbox layout is `${tmp}/uploads` rather than `${tmp}` itself, so that a traversal cell
 * which really does escape the upload root still lands inside this test's own temp directory and
 * can be asserted on without writing anywhere near the developer's tree (T-49-02, boundary 3).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtempSync } from "fs"
import { existsSync } from "fs"
import { mkdir, writeFile, rm, unlink, readdir } from "fs/promises"
import os from "os"
import path from "path"

import type { BlobRef } from "./collect-file-field-refs"
import { deleteEntityFiles } from "./delete-entity-files"

/**
 * MOCK-LEVEL ONLY, and scoped to the single S3 cell at the bottom of this file.
 *
 * `FILE_STORAGE` is unset in this environment and no bucket is configured, so the S3 branch
 * CANNOT be proven behaviourally here — see 49-CONTEXT.md/SEC-49-A. What the S3 cell proves is
 * the CALL SHAPE (one `DeleteObjectCommand` per ref, with the key the upload route mints) and
 * that the local filesystem is untouched. It is not evidence for SC-1 or SC-2.
 *
 * The mock is harmless to the local cells: the module `await import`s the SDK only inside the
 * S3 branch, so the local cells never load it.
 */
const s3 = vi.hoisted(() => ({ sends: [] as { Bucket?: string; Key?: string }[] }))

vi.mock("@aws-sdk/client-s3", () => {
  class DeleteObjectCommand {
    input: { Bucket?: string; Key?: string }
    constructor(input: { Bucket?: string; Key?: string }) {
      this.input = input
    }
  }
  class S3Client {
    async send(command: DeleteObjectCommand) {
      s3.sends.push(command.input)
      return {}
    }
  }
  return { S3Client, DeleteObjectCommand }
})

/**
 * NAMED-INTEGER FLOORS. Declared once, consumed by BOTH the fixture builder and the assertion,
 * so no count assertion can be satisfied by a fixture that shrank to nothing.
 */
const HAPPY_REF_COUNT = 3
const SABOTAGED_REF_COUNT = 1
const SURVIVING_REF_COUNT = HAPPY_REF_COUNT - SABOTAGED_REF_COUNT

const ENTITY_ID = "22222222-2222-4222-8222-222222222222"
const FIELD_NAME = "anexos"

/** The env keys this module reads, plus the S3 ones, saved and restored around every cell. */
const ENV_KEYS = [
  "UPLOAD_DIR",
  "FILE_STORAGE",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
  "S3_BUCKET",
] as const

let savedEnv: Record<string, string | undefined>
let sandbox: string
let uploadRoot: string

beforeEach(() => {
  savedEnv = {}
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]

  sandbox = mkdtempSync(path.join(os.tmpdir(), "delete-entity-files-"))
  uploadRoot = path.join(sandbox, "uploads")

  // This assignment works ONLY because the module reads `process.env.UPLOAD_DIR` at CALL TIME.
  // The two existing storage routes read theirs at module-evaluation time, which is exactly what
  // makes them untestable from a host process — see the module header.
  process.env.UPLOAD_DIR = uploadRoot
  delete process.env.FILE_STORAGE
  s3.sends.length = 0
})

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  await rm(sandbox, { recursive: true, force: true })
})

function ref(storedName: string, overrides: Partial<BlobRef> = {}): BlobRef {
  return { entityId: ENTITY_ID, fieldName: FIELD_NAME, storedName, ...overrides }
}

/** Where the module must look for a ref's bytes. */
function blobPath(r: BlobRef): string {
  return path.resolve(uploadRoot, r.entityId, r.fieldName, r.storedName)
}

/** Real bytes on a real disk. */
async function writeBlob(r: BlobRef): Promise<string> {
  const target = blobPath(r)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `bytes of ${r.storedName}`)
  return target
}

/** `HAPPY_REF_COUNT` refs built FROM the constant, never as literals. */
function happyRefs(): BlobRef[] {
  return Array.from({ length: HAPPY_REF_COUNT }, (_, i) => ref(`blob-${i}.pdf`))
}

describe("deleteEntityFiles — nothing to delete", () => {
  it("resolves 0 for an empty list without touching the filesystem", async () => {
    await mkdir(uploadRoot, { recursive: true })

    await expect(deleteEntityFiles([])).resolves.toEqual({ deleted: 0 })

    // The observable proof that no filesystem work happened: the upload root is still empty.
    // The module never creates directories, so this is the whole surface it could have touched.
    expect(await readdir(uploadRoot)).toEqual([])
  })

  it("resolves 0 for an empty list even with UPLOAD_DIR unset entirely", async () => {
    // If the empty case fell through to the loop, an unset UPLOAD_DIR would send it at the
    // '/tmp/uploads' default that the two existing routes use. It must not get that far.
    delete process.env.UPLOAD_DIR
    await expect(deleteEntityFiles([])).resolves.toEqual({ deleted: 0 })
  })
})

describe("deleteEntityFiles — the happy path deletes real bytes", () => {
  it("deletes every blob and returns the count it actually deleted", async () => {
    const refs = happyRefs()
    const paths = await Promise.all(refs.map(writeBlob))

    // THE FLOOR, asserted with its own message BEFORE the deletion: "the files are gone" is
    // satisfied by files that were never there, and by a fixture that drifted to zero refs.
    expect(HAPPY_REF_COUNT).toBeGreaterThan(0)
    expect(refs).toHaveLength(HAPPY_REF_COUNT)
    for (const p of paths) {
      expect(existsSync(p), `fixture must exist before the call: ${p}`).toBe(true)
    }

    await expect(deleteEntityFiles(refs)).resolves.toEqual({ deleted: HAPPY_REF_COUNT })

    for (const p of paths) {
      expect(existsSync(p), `must be gone after the call: ${p}`).toBe(false)
    }
  })

  it("deletes blobs spread across more than one field of the same record", async () => {
    const a = ref("a.pdf")
    const b = ref("b.pdf", { fieldName: "contrato" })
    const paths = [await writeBlob(a), await writeBlob(b)]
    for (const p of paths) expect(existsSync(p)).toBe(true)

    await expect(deleteEntityFiles([a, b])).resolves.toEqual({ deleted: 2 })
    for (const p of paths) expect(existsSync(p)).toBe(false)
  })

  it("handles a field name with a space and non-ASCII characters", async () => {
    // The live deployment's field names are Portuguese. `collectFileFieldRefs` carries them
    // verbatim, so any normalisation here would aim the unlink at a directory that never existed
    // and the blob would silently survive the purge.
    const r = ref("anexo.pdf", { fieldName: "Código Mãe" })
    const target = await writeBlob(r)
    expect(existsSync(target)).toBe(true)

    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 1 })
    expect(existsSync(target)).toBe(false)
  })
})

describe("deleteEntityFiles — an already-absent blob counts as deleted", () => {
  it("counts a ref whose file does not exist, because the goal state is 'the blob is gone'", async () => {
    // THIS IS A DECISION, not an accident. Counting an already-absent blob as a FAILURE would
    // log a mismatch on every re-purge and every hand-cleaned record, which would train the
    // reader to ignore the line the mismatch log exists to raise. The mismatch is reserved for a
    // REAL failure — see the injected-failure cell below.
    const r = ref("never-written.pdf")
    expect(existsSync(blobPath(r))).toBe(false)

    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 1 })
  })

  it("counts an absent blob whose entity directory does not exist at all", async () => {
    const r = ref("nope.pdf", { entityId: "33333333-3333-4333-8333-333333333333" })
    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 1 })
  })
})

describe("deleteEntityFiles — one undeletable blob does not stop the others", () => {
  it("deletes the other refs in the SAME call and comes back short by exactly one", async () => {
    // THE INJECTED FAILURE, research option (A): the blob path is created as a DIRECTORY, so
    // `unlink` raises EISDIR. Chosen over `chmod 0500` (option B) because EISDIR does not
    // silently succeed as root, so the failure cell cannot become a gate that cannot fail.
    const refs = happyRefs()
    const sabotaged = refs[1]

    const survivorPaths = [blobPath(refs[0]), blobPath(refs[2])]
    await writeBlob(refs[0])
    await writeBlob(refs[2])

    const sabotagedPath = blobPath(sabotaged)
    await mkdir(sabotagedPath, { recursive: true })

    // Assert the INJECTION TOOK before trusting the cell. Research flagged this for option (B),
    // and it costs nothing here: without it, "deleted is short" would also pass if the sabotage
    // silently did nothing and some other bug ate a ref.
    await expect(unlink(sabotagedPath)).rejects.toThrow(/EISDIR/)

    const result = await deleteEntityFiles(refs)

    // The shortfall is a NAMED integer, not "less than": `deleted < refs.length` is satisfied by
    // a helper that deleted nothing at all.
    expect(result.deleted).toBe(SURVIVING_REF_COUNT)
    expect(HAPPY_REF_COUNT - result.deleted).toBe(SABOTAGED_REF_COUNT)
    expect(result.deleted).toBeLessThan(HAPPY_REF_COUNT)

    // THE BARRIER. This is what proves the loop CONTINUED rather than aborting on the second
    // ref, and it must be the OTHER refs of the SAME call — a separate call would prove nothing
    // about isolation.
    for (const p of survivorPaths) {
      expect(existsSync(p), `must have been deleted despite the sibling failure: ${p}`).toBe(false)
    }
    expect(existsSync(sabotagedPath), "the sabotaged ref must still be there").toBe(true)
  })

  it("never rejects when a blob is undeletable — a throw would fail a COMMITTED purge", async () => {
    // Asserted with `resolves`, not a bare await: a bare await would let a rejection surface as
    // an unhandled failure that reads like an infrastructure problem rather than a contract
    // breach, and `.resolves` states the contract as the assertion.
    const r = ref("is-a-directory.pdf")
    await mkdir(blobPath(r), { recursive: true })

    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 0 })
  })

  it("keeps going when the FIRST ref is the undeletable one", async () => {
    const refs = happyRefs()
    await mkdir(blobPath(refs[0]), { recursive: true })
    const survivorPaths = [await writeBlob(refs[1]), await writeBlob(refs[2])]

    await expect(deleteEntityFiles(refs)).resolves.toEqual({ deleted: SURVIVING_REF_COUNT })
    for (const p of survivorPaths) expect(existsSync(p)).toBe(false)
    expect(survivorPaths).toHaveLength(SURVIVING_REF_COUNT)
  })
})

describe("deleteEntityFiles — a poisoned storedName is refused, not unlinked", () => {
  it("refuses a storedName that climbs out of the field directory, and the target survives", async () => {
    // `../../escape.txt` resolves back to the UPLOAD ROOT. It stays inside the upload tree, so a
    // containment check written against the root alone would ALLOW it — which is why containment
    // here is checked against the FIELD directory. The reachable attack is not "escape /tmp", it
    // is one record's poisoned JSONB value deleting a DIFFERENT record's blob.
    const escapeTarget = path.join(uploadRoot, "escape.txt")
    await mkdir(uploadRoot, { recursive: true })
    await writeFile(escapeTarget, "must survive")
    expect(existsSync(escapeTarget)).toBe(true)

    const r = ref("../../escape.txt")
    expect(path.resolve(uploadRoot, r.entityId, r.fieldName, r.storedName)).toBe(escapeTarget)

    // Refused means NOT COUNTED: a refusal that counted as deleted would hide itself from the
    // mismatch log the caller writes.
    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 0 })

    // THE BARRIER. Without this half, the refusal is indistinguishable from a failed unlink.
    // Verified NOT decorative: with the containment check removed, this line reddens with
    // "the escape target must NOT have been unlinked: expected false to be true" — the file was
    // really gone. Transcript in 49-02-SUMMARY.md, ablation B.
    expect(existsSync(escapeTarget), "the escape target must NOT have been unlinked").toBe(true)
  })

  it("refuses a storedName that climbs out of the upload root entirely", async () => {
    const outside = path.join(sandbox, "outside.txt")
    await writeFile(outside, "must survive")

    const r = ref(path.join("..", "..", "..", "outside.txt"))
    expect(path.resolve(uploadRoot, r.entityId, r.fieldName, r.storedName)).toBe(outside)

    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 0 })
    expect(existsSync(outside), "a file outside UPLOAD_DIR must NOT be unlinked").toBe(true)
  })

  it("refuses an absolute storedName", async () => {
    const absolute = path.join(sandbox, "absolute.txt")
    await writeFile(absolute, "must survive")

    await expect(deleteEntityFiles([ref(absolute)])).resolves.toEqual({ deleted: 0 })
    expect(existsSync(absolute)).toBe(true)
  })

  it("refuses a poisoned fieldName, which is a JSONB key and just as untrusted", async () => {
    // `collectFileFieldRefs` carries whatever key the column holds — including "../..". The
    // fieldName is a path segment too, so checking only the storedName would leave the same hole
    // one level up.
    const escapeTarget = path.join(sandbox, "via-field-name.txt")
    await writeFile(escapeTarget, "must survive")

    const r = ref("via-field-name.txt", { fieldName: path.join("..", "..", "..") })
    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 0 })
    expect(existsSync(escapeTarget)).toBe(true)
  })

  it("refuses a poisoned entityId for the same reason", async () => {
    const escapeTarget = path.join(sandbox, "via-entity-id.txt")
    await writeFile(escapeTarget, "must survive")

    const r = ref("via-entity-id.txt", { entityId: path.join("..", "..") })
    await expect(deleteEntityFiles([r])).resolves.toEqual({ deleted: 0 })
    expect(existsSync(escapeTarget)).toBe(true)
  })

  it("refuses a refusal-shaped ref WITHOUT abandoning the legitimate refs beside it", async () => {
    const legitimate = ref("legit.pdf")
    const target = await writeBlob(legitimate)
    const escapeTarget = path.join(uploadRoot, "escape.txt")
    await writeFile(escapeTarget, "must survive")

    await expect(deleteEntityFiles([ref("../../escape.txt"), legitimate])).resolves.toEqual({
      deleted: 1,
    })
    expect(existsSync(target)).toBe(false)
    expect(existsSync(escapeTarget)).toBe(true)
  })
})

describe("deleteEntityFiles — the S3 branch (MOCK-LEVEL, not a behavioural proof)", () => {
  it("sends one DeleteObjectCommand per ref with the key the upload route mints", async () => {
    // THIS CELL IS A MOCK. `@aws-sdk/client-s3` is replaced at the top of this file, no bucket
    // exists in this environment, and nothing here is evidence that an S3 deployment's blobs are
    // actually removed. It pins the CALL SHAPE only. SEC-49-A owns the real S3 exposure.
    process.env.FILE_STORAGE = "s3"
    process.env.S3_ENDPOINT = "https://s3.example.invalid"
    process.env.S3_REGION = "auto"
    process.env.S3_ACCESS_KEY = "test-access-key"
    process.env.S3_SECRET_KEY = "test-secret-key"
    process.env.S3_BUCKET = "test-bucket"

    const refs = happyRefs()
    // A real local file at the mirrored local path: the S3 branch must not touch it.
    const localTwin = await writeBlob(refs[0])

    await expect(deleteEntityFiles(refs)).resolves.toEqual({ deleted: HAPPY_REF_COUNT })

    expect(s3.sends).toHaveLength(HAPPY_REF_COUNT)
    expect(s3.sends.map((s) => s.Key)).toEqual(
      refs.map((r) => `${r.entityId}/${r.fieldName}/${r.storedName}`)
    )
    for (const send of s3.sends) {
      expect(send.Bucket).toBe("test-bucket")
    }

    expect(existsSync(localTwin), "the S3 branch must not touch the local filesystem").toBe(true)
  })

  it("resolves 0 rather than throwing when S3 is selected but not configured", async () => {
    // The existing file route answers a 500 here. A purge has no response to write, so the only
    // honest outcome is a short count that the caller's mismatch log will surface.
    process.env.FILE_STORAGE = "s3"
    delete process.env.S3_ENDPOINT

    await expect(deleteEntityFiles([ref("a.pdf")])).resolves.toEqual({ deleted: 0 })
    expect(s3.sends).toHaveLength(0)
  })
})
