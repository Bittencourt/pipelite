import type { Note } from "@/db/schema"

/**
 * The public shape of a note on the `/api/v1` surface.
 *
 * `deletedAt` is deliberately absent from this type AND from the object literal below.
 * Serializing it — even as `null` — would turn every note response into a soft-delete
 * oracle (T-35-06). Omitting the key from the type means a future edit that adds it back
 * fails typecheck at every call site rather than silently leaking.
 */
export interface SerializedNote {
  id: string
  entityType: Note["entityType"]
  entityId: string
  content: string
  authorId: string | null
  source: Note["source"]
  createdAt: string | null
  updatedAt: string | null
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
    entityType: note.entityType,
    entityId: note.entityId,
    content: note.content,
    authorId: note.authorId,
    source: note.source,
    createdAt: toIsoString(note.createdAt),
    updatedAt: toIsoString(note.updatedAt),
  }
}
