import type { Note } from "@/db/schema"

/**
 * The public shape of a note on the `/api/v1` surface.
 *
 * Field names are snake_case, matching every other serializer on this surface (`serialize.ts`).
 *
 * `deleted_at` is deliberately absent from this type AND from the object literal below.
 * Serializing it — even as `null` — would turn every note response into a soft-delete
 * oracle (T-35-06). Omitting the key from the type means a future edit that adds it back
 * fails typecheck at every call site rather than silently leaking.
 */
export interface SerializedNote {
  id: string
  entity_type: Note["entityType"]
  entity_id: string
  content: string
  author_id: string | null
  source: Note["source"]
  created_at: string | null
  updated_at: string | null
}

/**
 * `serialize.ts` keeps its own private `toIsoString`; it is not exported, so this module
 * carries the same two-line helper rather than widening that module's surface.
 */
function toIsoString(date: Date | null | undefined): string | null {
  if (!date) return null
  return date.toISOString()
}

/**
 * The SINGLE serializer for notes on the public API.
 *
 * All five note route files import this one function. A per-route copy is exactly the drift
 * that would let one endpoint start leaking `deletedAt` while the others do not, so this is
 * asserted by a grep gate in plan 35-10: the exported definition must appear exactly once, and
 * it appears here.
 */
export function serializeNote(note: Note): SerializedNote {
  return {
    id: note.id,
    entity_type: note.entityType,
    entity_id: note.entityId,
    content: note.content,
    author_id: note.authorId,
    source: note.source,
    created_at: toIsoString(note.createdAt),
    updated_at: toIsoString(note.updatedAt),
  }
}
