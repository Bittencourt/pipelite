import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// `resolveActorRole` is the only DB-touching export in this module; `isAuthorOrAdmin` must stay
// pure, which is what lets both auth surfaces (Auth.js session + API key) share it.
vi.mock("@/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
    },
  },
}))

import { db } from "@/db"
import { isAuthorOrAdmin, resolveActorRole, type NoteActor } from "./authorize"

const findFirstMock = vi.mocked(db.query.users.findFirst)

/**
 * Walks a drizzle `SQL` condition tree and collects every `name` it can reach through
 * `queryChunks`. Used to prove the soft-delete filter is actually part of the lookup rather
 * than trusting a comment. Cycle-safe: it only recurses into arrays and `queryChunks`, never
 * into a Column's back-reference to its table.
 */
function referencedNames(node: unknown, acc: string[] = []): string[] {
  if (node === null || typeof node !== "object") return acc
  if (Array.isArray(node)) {
    for (const child of node) referencedNames(child, acc)
    return acc
  }
  const record = node as Record<string, unknown>
  if (typeof record.name === "string") acc.push(record.name)
  if (Array.isArray(record.queryChunks)) referencedNames(record.queryChunks, acc)
  return acc
}

const member = (userId: string): NoteActor => ({ userId, role: "member" })
const admin = (userId: string): NoteActor => ({ userId, role: "admin" })

describe("isAuthorOrAdmin", () => {
  it("allows the author", () => {
    expect(isAuthorOrAdmin({ authorId: "u1" }, member("u1"))).toBe(true)
  })

  it("allows an admin who is not the author", () => {
    expect(isAuthorOrAdmin({ authorId: "u1" }, admin("u2"))).toBe(true)
  })

  it("allows an admin who is the author", () => {
    expect(isAuthorOrAdmin({ authorId: "u1" }, admin("u1"))).toBe(true)
  })

  it("rejects a non-author member", () => {
    // T-35-03: this single assertion is the IDOR control for both call sites.
    expect(isAuthorOrAdmin({ authorId: "u1" }, member("u2"))).toBe(false)
  })

  it("rejects a member on a note with a null author", () => {
    expect(isAuthorOrAdmin({ authorId: null }, member("u2"))).toBe(false)
  })

  it("allows an admin on a note with a null author", () => {
    expect(isAuthorOrAdmin({ authorId: null }, admin("u2"))).toBe(true)
  })

  it("rejects a null or undefined actor", () => {
    expect(isAuthorOrAdmin({ authorId: "u1" }, null)).toBe(false)
    expect(isAuthorOrAdmin({ authorId: "u1" }, undefined)).toBe(false)
    expect(isAuthorOrAdmin({ authorId: null }, null)).toBe(false)
  })

  it("does not treat a null authorId as matching a null-ish actor id", () => {
    // Guards the `null == undefined` / falsy-equality class of bug: an actor with an empty
    // userId must never authorise itself against an unattributed note.
    expect(isAuthorOrAdmin({ authorId: null }, { userId: "", role: "member" })).toBe(false)
    expect(isAuthorOrAdmin({ authorId: "" }, { userId: "", role: "member" })).toBe(false)
  })

  it("performs no database access", () => {
    isAuthorOrAdmin({ authorId: "u1" }, member("u1"))
    isAuthorOrAdmin({ authorId: "u1" }, member("u2"))
    expect(findFirstMock).not.toHaveBeenCalled()
  })
})

describe("resolveActorRole", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the actor with the stored role", async () => {
    findFirstMock.mockResolvedValue({ id: "u1", role: "admin" } as never)

    await expect(resolveActorRole("u1")).resolves.toEqual({ userId: "u1", role: "admin" })
  })

  it("never trusts a caller-supplied role: the returned role is the stored one", async () => {
    // T-35-24: the API-key surface has no role on its context, so the value must come from storage.
    findFirstMock.mockResolvedValue({ id: "u1", role: "member" } as never)

    await expect(resolveActorRole("u1")).resolves.toEqual({ userId: "u1", role: "member" })
  })

  it("returns null for an unknown user", async () => {
    findFirstMock.mockResolvedValue(undefined as never)

    await expect(resolveActorRole("nope")).resolves.toBeNull()
  })

  it("returns null for a soft-deleted user by filtering on deletedAt", async () => {
    findFirstMock.mockResolvedValue(undefined as never)

    await expect(resolveActorRole("deleted-user")).resolves.toBeNull()
    expect(findFirstMock).toHaveBeenCalledTimes(1)

    const args = findFirstMock.mock.calls[0][0] as {
      where?: unknown
      columns?: Record<string, boolean>
    }
    expect(args.columns).toMatchObject({ id: true, role: true })

    const names = referencedNames(args.where)
    expect(names).toContain("deleted_at")
    expect(names).toContain("id")
  })

  it("fails closed and returns null when the lookup throws", async () => {
    // T-35-25: an errored role lookup must not fall through to an authorised decision.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    findFirstMock.mockRejectedValue(new Error("connection refused") as never)

    await expect(resolveActorRole("u1")).resolves.toBeNull()
    expect(consoleError).toHaveBeenCalled()
  })

  it("composes with isAuthorOrAdmin so a failed lookup denies access", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    findFirstMock.mockRejectedValue(new Error("boom") as never)

    const actor = await resolveActorRole("u1")

    expect(actor).toBeNull()
    expect(isAuthorOrAdmin({ authorId: "u1" }, actor)).toBe(false)
    expect(consoleError).toHaveBeenCalled()
  })
})
