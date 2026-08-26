/**
 * SEC-04 — the three checks a file URL must pass before any byte is read or unlinked.
 *
 * ## Why this module exists HERE and not inside the route
 *
 * Next.js validates the export surface of a `route.ts`: a non-verb export fails the build's route
 * type check. The constraint is recorded at `src/lib/api/stage-scope.ts:55-57`, which exists for the
 * same reason. So the route keeps exactly `GET` and `DELETE`, and the logic they call lives here
 * where it can also be unit-tested without a request.
 *
 * ## Why it takes `uploadDir` as an ARGUMENT and reads no environment variable
 *
 * `src/lib/__tests__/compose-uploads-persistence.test.ts:399-404` asserts that the literal
 * `process.env.UPLOAD_DIR` appears in
 * `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`, and `:56` pins that exact path.
 * Moving the read here — or moving the route — turns that cross-tier gate red. That gate's own house
 * rule is "on a collision REWORD THE PROSE, never weaken the gate"; here it means the CODE keeps the
 * token. This module is therefore environment-free and the route passes its module-level
 * `UPLOAD_DIR` down.
 *
 * ## The three checks, and which one is load-bearing
 *
 * 1. `findOwnedRecordById` — the record must exist, the caller must own it, and it must not be
 *    trashed. A foreign record and a missing record are indistinguishable because the owner term
 *    lives INSIDE the query, so the caller learns nothing from the answer.
 * 2. `recordReferencesStoredName` — the requested filename must already be a value the server wrote
 *    into THIS record's `customFields[fieldName]`. **This is the load-bearing check.** It is not a
 *    filter over a hostile string; it is an allowlist whose contents the server minted, which makes
 *    traversal structurally impossible rather than merely detected, and makes the ownership check
 *    non-bypassable by guessing a field name.
 * 3. `resolveContainedPath` — defence in depth, for the case where the JSONB value itself is
 *    poisoned. Measured, not theorised: see its own comment.
 *
 * ## `isNull(deletedAt)` IS INCLUDED — a trashed record's file is REFUSED. Decision, with its cost.
 *
 * It is the conservative direction, it matches every other record read in the product, and SC-1's
 * own wording is "a request … which no longer exists returns no bytes". **The consequence, stated
 * so it is not discovered later:** `/trash` lists trashed records, and a restore-review flow that
 * wants to show a trashed record's attachments will now get a 404 for every one of them. If that
 * turns out to matter it is a follow-up decision about the restore flow — a separate, narrower
 * read path — and NOT a reason to widen this guard.
 *
 * ## Scope: this protects the LOCAL storage path only
 *
 * The route calls these checks before its storage branch, so they run under both backends. But
 * under `FILE_STORAGE=s3` the stored `publicUrl` is `${S3_PUBLIC_URL}/${key}`
 * (`src/app/api/upload/route.ts:89`), so nothing reads through that route at all and the guard has
 * no traffic to protect there. That gap is **SEC-49-A**, it is owned separately, and no claim of S3
 * coverage may be built on this module.
 */
import path from "path"
import { and, eq, isNull, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { db } from "@/db"
import { deals, people, organizations, activities } from "@/db/schema"
import type { EntityType } from "@/db/schema/custom-fields"
import { requireScopedPredicate } from "@/lib/api/stage-scope"

/**
 * The record a file URL resolved to.
 *
 * `entityType` is carried even though the download path does not branch on it: it is the only place
 * the caller can learn WHICH table answered without issuing a second read, which is what a
 * mismatch log or an audit entry needs in order to name the row it is talking about.
 */
export interface OwnedRecord {
  entityType: EntityType
  customFields: Record<string, unknown>
}

/**
 * One owner-scoped point read, per entity type.
 *
 * The `findFirst` is a bound closure rather than a `PgTable` reference because `db.query.deals` and
 * `db.query.people` are DIFFERENT types: a loop over a union of relational query builders does not
 * typecheck, and the alternative is a cast that would remove the compiler from a security boundary
 * — the same mistake `stage-scope.ts` documents at length about `as SQL`. The closure reads `db`
 * when it is CALLED, not when this map is built.
 */
interface OwnerScopedSource {
  readonly id: PgColumn
  readonly ownerId: PgColumn
  readonly deletedAt: PgColumn
  readonly findFirst: (
    where: SQL
  ) => Promise<{ customFields: Record<string, unknown> | null } | undefined>
}

/**
 * Where a record with this id might live.
 *
 * THE `satisfies` IS NOT DECORATION — it catches a class of error the annotation alone does not, and
 * `src/lib/trash/dispatch.ts:55-90` verified both directions. A MISSING key fails on the annotation.
 * An EXTRA key does NOT, because the literal is an argument to `Object.freeze`, so by the time the
 * result is assigned to the annotated const it is no longer a fresh literal and excess-property
 * checking has been skipped. Without the `satisfies`, a fifth entity type added later becomes a
 * table this resolver silently never visits — which is the same class of hole this module closes.
 */
const OWNER_SCOPED_SOURCE: Readonly<Record<EntityType, OwnerScopedSource>> = Object.freeze({
  deal: {
    id: deals.id,
    ownerId: deals.ownerId,
    deletedAt: deals.deletedAt,
    findFirst: where => db.query.deals.findFirst({ where, columns: { customFields: true } }),
  },
  person: {
    id: people.id,
    ownerId: people.ownerId,
    deletedAt: people.deletedAt,
    findFirst: where => db.query.people.findFirst({ where, columns: { customFields: true } }),
  },
  organization: {
    id: organizations.id,
    ownerId: organizations.ownerId,
    deletedAt: organizations.deletedAt,
    findFirst: where =>
      db.query.organizations.findFirst({ where, columns: { customFields: true } }),
  },
  activity: {
    id: activities.id,
    ownerId: activities.ownerId,
    deletedAt: activities.deletedAt,
    findFirst: where => db.query.activities.findFirst({ where, columns: { customFields: true } }),
  },
} satisfies Record<EntityType, OwnerScopedSource>)

/** The order the tables are tried in. Frozen so the walk is deterministic and reviewable. */
const LOOKUP_ORDER: readonly EntityType[] = Object.freeze([
  "deal",
  "person",
  "organization",
  "activity",
] as const)

/**
 * The record this id names, if the caller owns it and has not trashed it. Otherwise `null`.
 *
 * `null` covers "no such record", "someone else's record" and "trashed", deliberately
 * indistinguishably: the caller gets one answer for all three, so the response is not an existence
 * oracle. Phase 48's SEC-48-A settled that, and a 403-beside-404 would undo it.
 *
 * Four sequential indexed point reads with a short-circuit on the first hit is the accepted cost.
 * A file URL carries no entity type, so there is nothing to dispatch on; every alternative (a union
 * query, a shared id registry) is a schema change for a path that runs once per download.
 */
export async function findOwnedRecordById(
  entityId: string,
  userId: string
): Promise<OwnedRecord | null> {
  for (const entityType of LOOKUP_ORDER) {
    const source = OWNER_SCOPED_SOURCE[entityType]

    // Declared `SQL[]`, not inferred: every element is a real term BY TYPE rather than by
    // inspection, so `terms.length` below is a trustworthy count of what reached the conjunction.
    // drizzle's `and` silently FILTERS `undefined` out and `.where(undefined)` renders as no WHERE
    // clause at all — which here would be "the first row of the table, to any caller".
    const terms: SQL[] = [
      eq(source.id, entityId),
      eq(source.ownerId, userId),
      // The trashed-record decision. See the module header for the restore-review consequence.
      isNull(source.deletedAt),
    ]

    const row = await source.findFirst(
      requireScopedPredicate(and(...terms), terms.length, `findOwnedRecordById(${entityType})`)
    )

    if (row !== undefined) {
      // The column is nullable and defaults to `{}`; normalising here means every caller of
      // `recordReferencesStoredName` gets an object, and `null` cannot be mistaken for "no fields
      // matched".
      return { entityType, customFields: row.customFields ?? {} }
    }
  }

  return null
}

/**
 * Does this record itself reference `filename` under `fieldName`?
 *
 * THE LOAD-BEARING CHECK. The filename must already be a value the server wrote — `storedName` is
 * `${crypto.randomUUID()}${path.extname(original)}`, minted by `src/app/api/upload/route.ts:59-102`
 * — so this is an allowlist, not a filter. A traversal string cannot be in it, which is what makes
 * traversal structurally impossible here rather than merely detected. It is also what stops a
 * caller who owns SOME record from guessing a field name to reach a file the record does not have.
 *
 * The value-shape test is the narrow half of `src/lib/audit/present.ts:264-268`'s `isFileDescriptor`
 * (a string `filename` plus any one of `storedName` / `path` / `size` / `mimeType`), and it agrees
 * with `src/lib/trash/collect-file-field-refs.ts` — the other consumer of this same shape — on what
 * counts: a NON-EMPTY STRING `storedName` and nothing else. Named here rather than re-invented, so
 * the three do not drift into three spellings. An empty `storedName` would resolve to the field
 * DIRECTORY, which is why it is excluded rather than compared.
 *
 * `customFields` is typed, but it came out of a JSONB column that other code wrote, so the type is
 * a claim rather than a fact. Every guard below is therefore a runtime check, and every one of them
 * returns/continues rather than throwing: a malformed value must cost its own descriptor, never the
 * request.
 */
export function recordReferencesStoredName(
  customFields: Record<string, unknown>,
  fieldName: string,
  filename: string
): boolean {
  if (customFields === null || typeof customFields !== "object" || Array.isArray(customFields)) {
    return false
  }

  // A file field is ALWAYS an array or null (`file-field.tsx:167` writes
  // `newFiles.length > 0 ? newFiles : null`). Anything else is a non-file field — or a field that
  // was retyped away from `file` — and holds no servable name.
  const value = customFields[fieldName]
  if (!Array.isArray(value)) return false

  for (const item of value) {
    // `typeof null === "object"`, so the null check is not redundant.
    if (item === null || typeof item !== "object") continue

    const stored = (item as { storedName?: unknown }).storedName
    if (typeof stored !== "string" || stored === "") continue

    if (stored === filename) return true
  }

  return false
}

/**
 * The absolute path these three segments name, or `null` if they do not stay inside the record's own
 * field directory.
 *
 * ## Why `path.resolve` alone is not containment — measured, not theorised
 *
 * `path.resolve('/app/uploads','e1','f1','../../../../etc/passwd')` is `/etc/passwd`, and
 * `path.resolve('/app/uploads','../../etc','f1','x')` is `/etc/f1/x`. Both `filename` and `entityId`
 * are escape vectors, and the shipped route interpolated all three segments unvalidated. Confirmed
 * again at the handler level by this plan's own RED transcript, which recorded `readFile` reaching
 * `/tmp/etc/passwd` and `/etc/Anexos Ação/…`. The honest test is `path.relative`, after both sides
 * are resolved so every `..` has already been collapsed.
 *
 * ## Why the boundary is the FIELD DIRECTORY and not the upload root
 *
 * This is plan 49-02's finding, and it reproduces exactly here. `entityId` and `fieldName` are
 * precisely two path segments, so a two-level climb lands back ON the upload root:
 *
 *     path.resolve(uploadRoot, entityId, fieldName, "../../escape.txt") === `${uploadRoot}/escape.txt`
 *
 * A root-level check ALLOWS that. This plan's RED transcript measured it: the shipped route read
 * `/tmp/uploads/escape.txt`, which is inside the root. So a root-level assertion here would have
 * been a check that cannot fail against a handler serving another record's blob — and the realistic
 * attack was never "escape /tmp", it is one record's poisoned value reaching a DIFFERENT record's
 * file, which is cross-record movement INSIDE the tree that a root-level check cannot see.
 *
 * `src/lib/trash/delete-entity-files.ts` uses the same three-test spelling against the same
 * boundary. Keeping them identical is deliberate: two spellings of one containment rule is how one
 * of them ends up weaker.
 *
 * Note the deliberate parity cost, shared with that module: a field name whose own first characters
 * are `..` is refused. No such field name exists, and diverging here to permit one would mean two
 * different containment rules in the same codebase.
 */
export function resolveContainedPath(
  uploadDir: string,
  entityId: string,
  fieldName: string,
  filename: string
): string | null {
  const uploadRoot = path.resolve(uploadDir)

  // The root → field hop is TWO levels deep, so the direct-child test below cannot express it and
  // it is spelled out with the same three checks. `entityId` and `fieldName` are URL segments here,
  // so they are untrusted for the same reason they are untrusted in the trash module, where they
  // arrive out of a database row instead.
  const fieldDir = path.resolve(uploadRoot, entityId, fieldName)
  const fieldRelative = path.relative(uploadRoot, fieldDir)
  if (
    fieldRelative === "" ||
    fieldRelative.startsWith("..") ||
    path.isAbsolute(fieldRelative)
  ) {
    return null
  }

  const target = path.resolve(fieldDir, filename)
  const relative = path.relative(fieldDir, target)

  if (relative === "") return null // the field directory itself
  if (relative.startsWith("..")) return null // climbed out
  if (path.isAbsolute(relative)) return null // a different root entirely
  if (relative.includes(path.sep)) return null // a nested path, not a single stored name

  return target
}
