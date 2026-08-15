/**
 * Note edit/delete authorization — the single shared predicate for both auth surfaces.
 *
 * WHY THIS MODULE EXISTS
 *
 * The same access-control decision has to be enforced in two places that authenticate in
 * completely different ways:
 *   - the browser server action (plan 35-09), where Auth.js gives a signed session carrying
 *     `session.user.role`; and
 *   - the `/api/v1/notes` route (plan 35-10), where `withApiAuth` yields an `ApiAuthContext`
 *     that is `{ userId, keyId }` ONLY (src/lib/api/auth.ts:6-9) — it has no role, so the role
 *     must be re-read from storage via `resolveActorRole`. No existing v1 route does this.
 *
 * Both call sites MUST import `isAuthorOrAdmin` from here rather than inlining a check, so the
 * two surfaces cannot drift apart (T-35-09). The repo's existing inline ownership checks
 * (e.g. src/app/organizations/actions.ts:77) are duplicated across call sites — that drift is
 * exactly what this module prevents.
 *
 * This predicate deliberately does NOT live in `src/lib/mutations/notes.ts`: the project's
 * logged decision is that ownership checks stay in server actions / API routes while mutations
 * only check entity existence.
 */

import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema/users"

/** Matches the `user_role` pg enum in src/db/schema/users.ts. */
export interface NoteActor {
  userId: string
  role: "admin" | "member"
}

/**
 * True iff the actor is present AND (the actor is an admin OR the actor authored the note).
 *
 * Pure: no database access, no I/O. That is what makes it callable identically from the
 * session surface and the API-key surface.
 *
 * A note with `authorId === null` (author deleted / imported note) is editable by admins only —
 * never by "everyone", and never by a caller whose own id is empty.
 */
export function isAuthorOrAdmin(
  note: { authorId: string | null },
  actor: NoteActor | null | undefined,
): boolean {
  // Fail closed on an absent or malformed actor: an unauthenticated caller must never reach true.
  if (!actor || !actor.userId) {
    return false
  }

  if (actor.role === "admin") {
    return true
  }

  // Strict equality only: loose equality between a null authorId and a null-ish actor id must
  // never be allowed to authorise an unattributed note.
  return note.authorId !== null && note.authorId === actor.userId
}

/**
 * Reads the stored role for a user id, returning `null` when the user does not exist or has
 * been soft-deleted.
 *
 * Exists for the API-key surface, whose auth context carries no role (T-35-24: the role is read
 * from storage, never accepted from the request). Fails closed on any error (T-35-25): a `null`
 * actor makes `isAuthorOrAdmin` return false.
 */
export async function resolveActorRole(userId: string): Promise<NoteActor | null> {
  try {
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { id: true, role: true },
    })

    if (!row) {
      return null
    }

    return { userId: row.id, role: row.role }
  } catch (error) {
    console.error("Failed to resolve actor role:", error)
    return null
  }
}
