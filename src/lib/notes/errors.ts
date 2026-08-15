/**
 * The stable failure codes the notes server actions return.
 *
 * WHY CODES AND NOT PROSE
 * The actions used to return English literals — "Not authenticated", "Not authorized",
 * "Note not found" — into a fully localized UI. Every call site discarded them and rendered
 * a fixed translated toast instead, which is why nothing untranslated ever reached a user,
 * but it also meant a user who is NOT allowed to touch a note was told to "try again" on an
 * operation that will never succeed, forever. `notes.error.notPermitted` existed in all
 * three locales and was asserted by the parity gate while no component rendered it: a dead
 * string that looked load-bearing.
 *
 * A code is comparable without being readable, so the UI boundary can branch on it and pick
 * the right translated message, and the server never has to know what language the caller
 * reads.
 *
 * NOT AN EXISTENCE ORACLE. `notFound` covers a missing note AND a soft-deleted one, exactly
 * as `findNoteById` does by contract — the two must stay indistinguishable (T-35-10).
 *
 * This lives outside `src/app/notes/actions.ts` because that module carries `"use server"`
 * and may therefore export nothing but async functions.
 */
export const NOTE_ERROR = {
  notAuthenticated: "not_authenticated",
  notAuthorized: "not_authorized",
  notFound: "not_found",
  /** Anything else: a validation refusal, a driver failure, a thrown action. */
  failed: "failed",
} as const

export type NoteErrorCode = (typeof NOTE_ERROR)[keyof typeof NOTE_ERROR]

/**
 * The mutation layer's English prose, narrowed to a code at the action boundary.
 *
 * `src/lib/mutations/notes.ts` is shared with the /api/v1 surface, which maps those same
 * strings onto HTTP Problem types, so the strings stay where they are and the translation
 * happens here.
 */
export function toNoteErrorCode(error: string): NoteErrorCode {
  if (error === "Note not found" || error === "Record not found") {
    return NOTE_ERROR.notFound
  }
  return NOTE_ERROR.failed
}
