/**
 * TRASH-01 — the "deleted by" presenter.
 *
 * The contract under test is a DISCRIMINATION, not a format. Two facts look the same on screen
 * if you let them: "nobody wrote down who deleted this" (no `audit_log` row at all, which is
 * 100% of the current live dataset — 15 soft-deleted records exist and the log holds zero
 * `deleted` rows) and "a user did this and that user row is gone". Collapsing them into one
 * string is RESEARCH Pitfall 4 and a repudiation risk (T-37-REP2), so `notRecorded` and
 * `unknownUser` are asserted to be distinct kinds directly, not merely to render differently.
 *
 * The second contract is a REFUSAL. An `api_key` row stores the KEY OWNER in `actor_user_id`,
 * so the joined user is not the actor. The presenter therefore carries no name for that kind
 * (T-37-09); a test asserts the absence rather than trusting a comment.
 *
 * No mocks: the module has no database and no React, which is why it can be imported from a
 * server query and a client cell alike.
 */
import { describe, it, expect } from "vitest"

import { presentDeletedBy, type DeletedByRow } from "./present"

/** One row of the exact projection the trash query selects; each test overrides one field. */
function baseRow(overrides: Partial<DeletedByRow> = {}): DeletedByRow {
  return {
    entityId: "e1",
    actorKind: "user",
    actorId: "u1",
    actorName: "Ana",
    actorEmail: "ana@example.com",
    runId: null,
    workflowId: null,
    workflowName: null,
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  }
}

describe("presentDeletedBy — no audit row", () => {
  it("reports that nobody wrote it down, rather than inventing an actor", () => {
    expect(presentDeletedBy(undefined)).toEqual({ kind: "notRecorded" })
  })
})

describe("presentDeletedBy — user", () => {
  it("returns the name and email when both the id and the email resolved", () => {
    expect(presentDeletedBy(baseRow())).toEqual({
      kind: "user",
      name: "Ana",
      email: "ana@example.com",
    })
  })

  it("keeps a null name — the email fallback is the UI's job, not the presenter's", () => {
    expect(presentDeletedBy(baseRow({ actorName: null }))).toEqual({
      kind: "user",
      name: null,
      email: "ana@example.com",
    })
  })

  it("degrades to unknownUser when the joined user row is gone", () => {
    expect(
      presentDeletedBy(baseRow({ actorId: null, actorName: null, actorEmail: null }))
    ).toEqual({ kind: "unknownUser" })
  })

  it("degrades to unknownUser when only the email failed to resolve", () => {
    expect(presentDeletedBy(baseRow({ actorEmail: null }))).toEqual({ kind: "unknownUser" })
  })

  it("degrades to unknownUser when only the id failed to resolve", () => {
    expect(presentDeletedBy(baseRow({ actorId: null }))).toEqual({ kind: "unknownUser" })
  })
})

describe("presentDeletedBy — notRecorded is not unknownUser", () => {
  /** Pitfall 4, asserted as an inequality so no future refactor can quietly merge the two. */
  it("keeps the two facts as distinct kinds", () => {
    const notRecorded = presentDeletedBy(undefined)
    const unknownUser = presentDeletedBy(
      baseRow({ actorId: null, actorName: null, actorEmail: null })
    )

    expect(notRecorded.kind).toBe("notRecorded")
    expect(unknownUser.kind).toBe("unknownUser")
    expect(notRecorded.kind).not.toBe(unknownUser.kind)
  })

  it("returns a value for both — neither absence is expressed as null or undefined", () => {
    expect(presentDeletedBy(undefined)).not.toBeNull()
    expect(presentDeletedBy(undefined)).toBeDefined()
    expect(presentDeletedBy(baseRow({ actorId: null, actorEmail: null }))).toBeDefined()
  })
})

describe("presentDeletedBy — api_key", () => {
  /**
   * The joined user here is the key's OWNER. Naming them would attribute the delete to a
   * person who may never have touched it, so the presentation carries the kind and nothing
   * else.
   */
  it("names nobody, even though a user row joined", () => {
    const presentation = presentDeletedBy(baseRow({ actorKind: "api_key" }))

    expect(presentation).toEqual({ kind: "apiKey" })
    expect(JSON.stringify(presentation)).not.toContain("Ana")
    expect(JSON.stringify(presentation)).not.toContain("ana@example.com")
  })
})

describe("presentDeletedBy — workflow_run", () => {
  it("carries the run, workflow and name when the workflow still exists", () => {
    expect(
      presentDeletedBy(
        baseRow({
          actorKind: "workflow_run",
          actorId: null,
          actorName: null,
          actorEmail: null,
          runId: "r1",
          workflowId: "w1",
          workflowName: "Nurture",
        })
      )
    ).toEqual({
      kind: "workflowRun",
      runId: "r1",
      workflowId: "w1",
      workflowName: "Nurture",
    })
  })

  it("keeps the kind with all three nulls when the workflow is gone, so no link is built", () => {
    expect(
      presentDeletedBy(
        baseRow({
          actorKind: "workflow_run",
          actorId: null,
          actorName: null,
          actorEmail: null,
          runId: null,
          workflowId: null,
          workflowName: null,
        })
      )
    ).toEqual({ kind: "workflowRun", runId: null, workflowId: null, workflowName: null })
  })
})

describe("presentDeletedBy — import and system", () => {
  it("returns the bare import kind, because audit_log carries no import session for it", () => {
    expect(presentDeletedBy(baseRow({ actorKind: "import" }))).toEqual({ kind: "import" })
  })

  it("returns the bare system kind", () => {
    expect(presentDeletedBy(baseRow({ actorKind: "system" }))).toEqual({ kind: "system" })
  })
})

describe("presentDeletedBy — totality", () => {
  const KINDS = ["user", "workflow_run", "api_key", "import", "system"] as const
  const PRESENTATION_KINDS = [
    "notRecorded",
    "user",
    "unknownUser",
    "workflowRun",
    "apiKey",
    "import",
    "system",
  ]

  it.each(KINDS)("resolves %s to a declared presentation kind", (actorKind) => {
    const presentation = presentDeletedBy(baseRow({ actorKind }))

    expect(presentation).toBeDefined()
    expect(PRESENTATION_KINDS).toContain(presentation.kind)
  })

  it.each(KINDS)("resolves %s even when every joined column is null", (actorKind) => {
    const presentation = presentDeletedBy(
      baseRow({
        actorKind,
        actorId: null,
        actorName: null,
        actorEmail: null,
        runId: null,
        workflowId: null,
        workflowName: null,
      })
    )

    expect(presentation).toBeDefined()
    expect(PRESENTATION_KINDS).toContain(presentation.kind)
  })
})
