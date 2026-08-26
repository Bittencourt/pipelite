/**
 * SEC-04 — every blob a record's `customFields` JSONB references.
 *
 * ## The shape this walks, and who writes it
 *
 * A file custom field stores an ARRAY of descriptors, or `null` once the last file is removed.
 * The writer is `src/components/custom-fields/file-field.tsx:14-22` (the `FileItem` interface)
 * and the values are minted by `src/app/api/upload/route.ts:59-102`:
 *
 *     { id, filename, storedName, path, publicUrl, size, mimeType }
 *
 * `storedName` is `${crypto.randomUUID()}${path.extname(original)}` and is THE ON-DISK NAME —
 * `id` is not, and `filename` is the user's original name. Local bytes live at
 * `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}`; the S3 key is
 * `${entityId}/${fieldName}/${storedName}`. Those three segments are all a deletion needs, which
 * is why a `BlobRef` carries exactly them and not the stored `path`: the column's own copy of the
 * path was written by a possibly-differently-configured deployment, and trusting it would let a
 * stale absolute path aim a deletion anywhere.
 *
 * ## Why it walks the JSONB BLINDLY rather than reading `custom_field_definitions`
 *
 * A definition-driven walk would ask which fields have `type = 'file'` and enumerate only those.
 * `getActiveFieldDefinitions` (`src/lib/custom-fields.ts:22-30`) filters `isNull(deletedAt)`, so a
 * definition that was soft-deleted — or retyped — no longer appears while its VALUES remain in the
 * column untouched. A definition-driven walk therefore silently skips exactly the blobs whose
 * definition is gone, which is the failure class this phase exists to close: the blob outlives both
 * its row and its definition and nothing ever names it again. Walking the column blindly cannot
 * miss them. It costs nothing: this module has no database import at all, so it is callable from
 * inside a purge transaction, from a mutation, and from a pure unit test alike.
 *
 * ## The value-shape test is the one that already exists
 *
 * `src/lib/audit/present.ts:264-268` already decides "is this value a stored file descriptor?" by
 * shape rather than by definition — `isFileDescriptor` requires a string `filename` and any one of
 * `storedName` / `path` / `size` / `mimeType`. That predicate is module-private there and is NAMED
 * here rather than re-invented as a third spelling. This module's test is deliberately the
 * narrower half of it: a deletion needs a usable `storedName` specifically, so a non-empty string
 * `storedName` is both necessary and sufficient, and a descriptor missing it is skipped rather
 * than guessed at.
 *
 * ## Never throws
 *
 * The input is a column other code wrote, so it is hostile by default. Every guard below is a
 * `continue`, never a `throw`: a malformed value must cost its own blob, never the purge.
 */

/** The three segments that locate a blob in either storage backend. */
export interface BlobRef {
  entityId: string
  fieldName: string
  storedName: string
}

/**
 * Every blob referenced by `customFields`. Pure, no I/O, never throws.
 *
 * `entityId` is the caller's — the row id it is purging — not one read back out of the column.
 */
export function collectFileFieldRefs(entityId: string, customFields: unknown): BlobRef[] {
  // A `customFields` column is an OBJECT. `null` is the common case (no custom values ever set),
  // and an array would make `Object.entries` yield numeric "field names" that resolve to
  // directories that cannot exist — so it is refused here rather than half-walked.
  if (customFields === null || typeof customFields !== "object" || Array.isArray(customFields)) {
    return []
  }

  const refs: BlobRef[] = []

  for (const [fieldName, value] of Object.entries(customFields as Record<string, unknown>)) {
    // A file field is ALWAYS an array or null (`file-field.tsx:167` writes
    // `newFiles.length > 0 ? newFiles : null`). Anything else is a non-file field — a string, a
    // number, a nested object — and is skipped without inspection. This is also what makes the
    // walk safe on a field that was retyped from `file` to `text`.
    if (!Array.isArray(value)) continue

    for (const item of value) {
      // `typeof null === "object"`, so the null check is not redundant.
      if (item === null || typeof item !== "object") continue

      const stored = (item as { storedName?: unknown }).storedName

      // A non-string would be interpolated into a path as `[object Object]` or `42`; an empty
      // string would resolve to the FIELD DIRECTORY itself, which a deletion must never be
      // handed. Both are skipped, and both are covered by their own cell in the sibling test.
      if (typeof stored !== "string" || stored === "") continue

      refs.push({ entityId, fieldName, storedName: stored })
    }
  }

  return refs
}
