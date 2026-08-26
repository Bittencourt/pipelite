import { describe, it, expect, vi, beforeEach } from "vitest"
import type { CrmEventPayload, DealStageChangedPayload, CrmEventName } from "@/lib/events/types"
import type { CrmEventTriggerConfig } from "./types"

// Mock the db module
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn(),
  }
  return { db: mockDb }
})

// Mock createWorkflowRun
vi.mock("./create-run", () => ({
  createWorkflowRun: vi.fn().mockResolvedValue({ id: "run-1", status: "pending" }),
}))

import { db } from "@/db"
import { createWorkflowRun } from "./create-run"
import { matchesTrigger, matchAndFireTriggers } from "./matcher"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
}

const mockCreateWorkflowRun = createWorkflowRun as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

// --- matchesTrigger ---

describe("matchesTrigger", () => {
  const baseTrigger: CrmEventTriggerConfig = {
    type: "crm_event",
    entity: "deal",
    action: "created",
    fieldFilters: [],
  }

  const basePayload: CrmEventPayload = {
    entity: "deal",
    entityId: "deal-1",
    action: "created",
    data: { title: "Test Deal" },
    changedFields: null,
    userId: "user-1",
    timestamp: "2026-03-28T00:00:00Z",
  }

  it("returns true when entity+action match event name", () => {
    expect(matchesTrigger(baseTrigger, "deal.created", basePayload)).toBe(true)
  })

  it("returns false when entity does not match", () => {
    expect(matchesTrigger(baseTrigger, "person.created", {
      ...basePayload,
      entity: "person",
    })).toBe(false)
  })

  it("returns false when action does not match", () => {
    expect(matchesTrigger(baseTrigger, "deal.updated", {
      ...basePayload,
      action: "updated",
    })).toBe(false)
  })

  it("with fieldFilters returns true when changedFields includes at least one filtered field", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fieldFilters: ["title", "amount"],
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: ["title", "status"],
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(true)
  })

  it("with fieldFilters returns false when changedFields is null", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fieldFilters: ["title"],
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: null,
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(false)
  })

  it("with fieldFilters returns false when changedFields has no overlap with filter", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fieldFilters: ["title", "amount"],
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: ["status", "assignedTo"],
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(false)
  })

  it("with fromStageId returns true when payload.oldStageId matches", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      fromStageId: "stage-a",
    }
    const payload: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payload)).toBe(true)
  })

  it("with fromStageId returns false when payload.oldStageId does not match", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      fromStageId: "stage-a",
    }
    const payload: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-x",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payload)).toBe(false)
  })

  it("with toStageId returns true when payload.newStageId matches", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      toStageId: "stage-b",
    }
    const payload: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payload)).toBe(true)
  })

  it("ignores residual stage filters when action is not stage_changed", () => {
    // A leftover fromStageId/toStageId on an "updated" trigger must not
    // silently prevent it from ever matching.
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "updated",
      fromStageId: "stage-a",
      toStageId: "stage-b",
    }
    const payload: CrmEventPayload = {
      ...basePayload,
      action: "updated",
      changedFields: ["title"],
    }
    expect(matchesTrigger(trigger, "deal.updated", payload)).toBe(true)
  })

  it("with both fromStageId and toStageId requires both to match", () => {
    const trigger: CrmEventTriggerConfig = {
      ...baseTrigger,
      action: "stage_changed",
      fromStageId: "stage-a",
      toStageId: "stage-b",
    }
    const payloadBothMatch: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payloadBothMatch)).toBe(true)

    const payloadOnlyFrom: DealStageChangedPayload = {
      ...basePayload,
      entity: "deal",
      action: "updated",
      oldStageId: "stage-a",
      newStageId: "stage-c",
    }
    expect(matchesTrigger(trigger, "deal.stage_changed", payloadOnlyFrom)).toBe(false)
  })
})

// --- matchAndFireTriggers ---

describe("matchAndFireTriggers", () => {
  /**
   * The owner of every fixture record below, and therefore the only `workflows.created_by` the
   * scoped query may return (CR-05).
   */
  const OWNER_ID = "user-1"

  /**
   * TWO SELECTS ARE MODELLED HERE, NOT ONE, AND THE ORDER IS LOAD-BEARING (CR-05).
   *
   *   1. `resolveEventRecordOwner` — `.select({ownerId}).from(<entity table>).where(id = …).limit(1)`
   *   2. the active-workflow read — `.select().from(workflows).where(active AND created_by = owner)`
   *
   * The JavaScript `filter` below stands in for the SQL predicate, exactly as this helper's
   * `active` filter always has. It filters on `createdBy` TOO, because the predicate now carries
   * that term — a helper that kept returning every row would make the scope untestable here and
   * would quietly re-open what the db suite proves closed.
   *
   * HONEST LABEL: a mock filtering rows is evidence about the CALL SHAPE, not about the SQL. The
   * behavioural proof that the predicate reaches PostgreSQL is
   * `src/lib/triggers/trigger-owner-scope.db.test.ts`, which drives real mutations through the real
   * bus against a real database. What these cells add is the fail-closed paths, which that suite
   * cannot reach: an unresolvable owner and an unregistered entity.
   */
  function mockWorkflowQuery(
    workflows: Array<{ id: string; active: boolean; triggers: unknown[]; createdBy?: string }>,
    ownerId: string | null = OWNER_ID
  ) {
    // CALL 1 — the owner resolution. `.limit(1)` is what the previous single-chain mock lacked.
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(ownerId === null ? [] : [{ ownerId }]),
        }),
      }),
    })

    // CALL 2 — the owner-scoped active-workflow read.
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(
          workflows
            .filter((w) => w.active && (w.createdBy ?? OWNER_ID) === ownerId)
            .map((w) => ({
              id: w.id,
              active: w.active,
              createdBy: w.createdBy ?? OWNER_ID,
              triggers: w.triggers,
            }))
        ),
      }),
    })
  }

  const eventPayload: CrmEventPayload = {
    entity: "deal",
    entityId: "deal-1",
    action: "created",
    data: { title: "Test Deal" },
    changedFields: null,
    userId: "user-1",
    timestamp: "2026-03-28T00:00:00Z",
  }

  it("queries active workflows and creates runs for matches", async () => {
    mockWorkflowQuery([
      {
        id: "wf-1",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).toHaveBeenCalledOnce()
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        trigger_type: "crm_event",
        data: expect.objectContaining({ entityId: "deal-1" }),
      })
    )
  })

  it("skips inactive workflows (query only returns active)", async () => {
    mockWorkflowQuery([
      {
        id: "wf-inactive",
        active: false,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
  })

  it("skips non-crm_event triggers in the array", async () => {
    mockWorkflowQuery([
      {
        id: "wf-2",
        active: true,
        triggers: [
          { type: "schedule", mode: "interval", intervalMinutes: 60 },
          { type: "manual" },
        ],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
  })

  it("creates separate runs when multiple workflows match the same event", async () => {
    mockWorkflowQuery([
      {
        id: "wf-a",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
      {
        id: "wf-b",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-a", expect.any(Object))
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-b", expect.any(Object))
  })

  it("includes stage-change metadata (oldStageId, newStageId, changedFields, userId) in the envelope", async () => {
    mockWorkflowQuery([
      {
        id: "wf-stage",
        active: true,
        triggers: [
          {
            type: "crm_event",
            entity: "deal",
            action: "stage_changed",
            fieldFilters: [],
          },
        ],
      },
    ])

    const stagePayload: DealStageChangedPayload = {
      entity: "deal",
      entityId: "deal-1",
      action: "updated",
      data: { title: "Test Deal", stageId: "stage-b" },
      changedFields: ["stageId"],
      userId: "user-1",
      timestamp: "2026-03-28T00:00:00Z",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }

    await matchAndFireTriggers("deal.stage_changed", stagePayload)

    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-stage",
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Test Deal",
          entityId: "deal-1",
          oldStageId: "stage-a",
          newStageId: "stage-b",
          changedFields: ["stageId"],
          userId: "user-1",
        }),
      })
    )
  })

  it("does not let record fields clobber envelope metadata", async () => {
    mockWorkflowQuery([
      {
        id: "wf-1",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", {
      ...eventPayload,
      data: { title: "Evil", entityId: "spoofed", action: "deleted" },
    })

    expect(mockCreateWorkflowRun).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: "deal-1",
          action: "created",
          entity: "deal",
          title: "Evil",
        }),
      })
    )
  })

  it("does not throw when createWorkflowRun fails for one workflow", async () => {
    mockCreateWorkflowRun.mockRejectedValueOnce(new Error("DB error"))
    mockCreateWorkflowRun.mockResolvedValueOnce({ id: "run-2" })

    mockWorkflowQuery([
      {
        id: "wf-fail",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
      {
        id: "wf-ok",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    // Should not throw
    await expect(matchAndFireTriggers("deal.created", eventPayload)).resolves.not.toThrow()

    expect(mockCreateWorkflowRun).toHaveBeenCalledTimes(2)
  })

  /* -------------------------------------------------------------------------
   * CR-05 — the FAIL-CLOSED paths, which the db suite cannot reach
   * ---------------------------------------------------------------------- */

  it("CR-05: resolves the event record's owner BEFORE reading workflows, and reads workflows second", async () => {
    // The call ORDER is the claim, and it is a real one: the owner has to be known before the
    // predicate can be built, so a refactor that hoisted the workflow read above the resolution
    // would have to reintroduce an unscoped select to compile.
    mockWorkflowQuery([
      {
        id: "wf-1",
        active: true,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockDb.select).toHaveBeenCalledTimes(2)
    // Call 1 projects a single column (the owner); call 2 selects the whole workflow row.
    expect(mockDb.select.mock.calls[0]).toHaveLength(1)
    expect(mockDb.select.mock.calls[1]).toHaveLength(0)
    expect(mockCreateWorkflowRun).toHaveBeenCalledOnce()
  })

  it("CR-05: fires NOTHING when the event record's owner cannot be resolved", async () => {
    // A row that is no longer there, or an entity whose owner column came back empty. The absent
    // predicate used to treat this case as "match everything"; it now matches nothing.
    mockWorkflowQuery(
      [
        {
          id: "wf-1",
          active: true,
          triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
        },
      ],
      null
    )

    await matchAndFireTriggers("deal.created", eventPayload)

    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
    // And it stopped BEFORE the workflow read, so there is no unscoped statement to fall back to.
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it("CR-05: fires NOTHING for an entity with no owner-column entry, and never reaches the database", async () => {
    // `entity: "constructor"` is the prototype-chain probe. `EVENT_OWNER_LOOKUP` is a `Map`, so
    // `.get("constructor")` is `undefined` rather than the `Object` constructor — with an object
    // literal this would have been truthy, walked into `.from(undefined)` and thrown a driver
    // TypeError instead of failing closed.
    const bogus = { ...eventPayload, entity: "constructor" as unknown as CrmEventPayload["entity"] }

    await matchAndFireTriggers("deal.created", bogus)

    expect(mockCreateWorkflowRun).not.toHaveBeenCalled()
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("CR-05: a workflow owned by ANOTHER user is not returned by the scoped read", async () => {
    // HONEST LABEL: the filtering here is done by `mockWorkflowQuery`'s stand-in for the SQL
    // predicate, so this cell is evidence about the call shape and not about the statement. The
    // behavioural proof is `src/lib/triggers/trigger-owner-scope.db.test.ts`, against a real
    // database. It is kept because it pins the invariant the helper models.
    mockWorkflowQuery([
      {
        id: "wf-mine",
        active: true,
        createdBy: OWNER_ID,
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
      {
        id: "wf-someone-elses",
        active: true,
        createdBy: "user-2",
        triggers: [{ type: "crm_event", entity: "deal", action: "created", fieldFilters: [] }],
      },
    ])

    await matchAndFireTriggers("deal.created", eventPayload)

    // The positive half is what stops this being satisfied by a matcher that fires for nobody.
    expect(mockCreateWorkflowRun).toHaveBeenCalledOnce()
    expect(mockCreateWorkflowRun).toHaveBeenCalledWith("wf-mine", expect.any(Object))
  })
})

// --- Formula wrapper normalisation in the trigger envelope (SC-3 / D-17) ---

describe("matchAndFireTriggers formula wrapper normalisation", () => {
  /**
   * Two selects, in order: CR-05's owner resolution first, then the owner-scoped workflow read.
   * `user-1` is `updatedPayload`'s `userId` AND the owner these cells' deal resolves to, so the
   * workflow below is inside the scope and these cells stay about formula normalisation.
   */
  function mockOneUpdatedWorkflow() {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ ownerId: "user-1" }]),
        }),
      }),
    })

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: "wf-formula",
            active: true,
            createdBy: "user-1",
            triggers: [
              { type: "crm_event", entity: "deal", action: "updated", fieldFilters: [] },
            ],
          },
        ]),
      }),
    })
  }

  function envelopeOf(): { data: Record<string, unknown> } & Record<string, unknown> {
    return mockCreateWorkflowRun.mock.calls[0][1]
  }

  const updatedPayload = (data: Record<string, unknown>): CrmEventPayload => ({
    entity: "deal",
    entityId: "deal-1",
    action: "updated",
    data,
    changedFields: ["customFields"],
    userId: "user-1",
    timestamp: "2026-03-28T00:00:00Z",
  })

  const OK_WRAPPER = { formula: true, value: 1035, error: null }
  const ERR_WRAPPER = { formula: true, value: null, error: "Unknown field: Nope" }

  it("normalises a camelCase customFields wrapper to its scalar", async () => {
    mockOneUpdatedWorkflow()

    await matchAndFireTriggers(
      "deal.updated",
      updatedPayload({ title: "Acme", customFields: { Margin: OK_WRAPPER } })
    )

    const customFields = envelopeOf().data.customFields as Record<string, unknown>
    expect(customFields.Margin).toBe(1035)
    expect(typeof customFields.Margin).toBe("number")
  })

  it("normalises a snake_case custom_fields wrapper identically (serializeDeal write path)", async () => {
    mockOneUpdatedWorkflow()

    await matchAndFireTriggers(
      "deal.updated",
      updatedPayload({ title: "Acme", custom_fields: { Margin: OK_WRAPPER } })
    )

    const customFields = envelopeOf().data.custom_fields as Record<string, unknown>
    expect(customFields.Margin).toBe(1035)
  })

  it("normalises an errored wrapper to null, so a greater_than condition cannot become true", async () => {
    mockOneUpdatedWorkflow()

    await matchAndFireTriggers(
      "deal.updated",
      updatedPayload({ customFields: { Margin: ERR_WRAPPER } })
    )

    const customFields = envelopeOf().data.customFields as Record<string, unknown>
    expect(customFields.Margin).toBeNull()
    // The error string must not leak into the envelope as a truthy comparable value.
    expect(JSON.stringify(customFields)).not.toContain("Unknown field")
    expect(Number(customFields.Margin) > 1000).toBe(false)
  })

  it("passes non-formula custom field values through byte-identically", async () => {
    mockOneUpdatedWorkflow()

    const plain = {
      Origem: ["Outbound Manual"],
      "CNPJ / CPF": "12.345.678/0001-90",
      Consumo: 42,
      Vazio: null,
      Nested: { some: "object", without: "the formula key" },
    }

    await matchAndFireTriggers("deal.updated", updatedPayload({ customFields: { ...plain } }))

    expect(envelopeOf().data.customFields).toEqual(plain)
  })

  it("leaves an envelope with no custom fields deep-equal to the pre-change shape", async () => {
    mockOneUpdatedWorkflow()

    await matchAndFireTriggers("deal.updated", updatedPayload({ title: "Test Deal" }))

    expect(envelopeOf()).toEqual({
      trigger_type: "crm_event",
      trigger_id: expect.stringMatching(/^deal\.updated-\d+$/),
      timestamp: "2026-03-28T00:00:00Z",
      data: {
        title: "Test Deal",
        entity: "deal",
        entityId: "deal-1",
        action: "updated",
        changedFields: ["customFields"],
        userId: "user-1",
      },
    })
  })

  it("preserves envelope metadata and the write-after-spread anti-clobber invariant", async () => {
    // CR-05's owner resolution first, then the owner-scoped workflow read — same two-call shape as
    // `mockOneUpdatedWorkflow`, spelled out here because this cell needs a `stage_changed` trigger.
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ ownerId: "user-1" }]),
        }),
      }),
    })

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: "wf-stage",
            active: true,
            createdBy: "user-1",
            triggers: [
              { type: "crm_event", entity: "deal", action: "stage_changed", fieldFilters: [] },
            ],
          },
        ]),
      }),
    })

    const stagePayload: DealStageChangedPayload = {
      entity: "deal",
      entityId: "deal-1",
      action: "updated",
      data: {
        title: "Test Deal",
        customFields: { Margin: OK_WRAPPER },
        // Record fields attempting to spoof metadata must still lose to the post-spread write.
        entityId: "spoofed",
        action: "deleted",
        userId: "spoofed-user",
      },
      changedFields: ["stageId"],
      userId: "user-1",
      timestamp: "2026-03-28T00:00:00Z",
      oldStageId: "stage-a",
      newStageId: "stage-b",
    }

    await matchAndFireTriggers("deal.stage_changed", stagePayload)

    const envelope = envelopeOf()
    expect(envelope.data).toMatchObject({
      entity: "deal",
      entityId: "deal-1",
      action: "updated",
      changedFields: ["stageId"],
      userId: "user-1",
      oldStageId: "stage-a",
      newStageId: "stage-b",
      title: "Test Deal",
    })
    expect((envelope.data.customFields as Record<string, unknown>).Margin).toBe(1035)
  })

  it("does not mutate the shared crmBus payload — the webhook body keeps the full wrapper (D-17)", async () => {
    mockOneUpdatedWorkflow()

    const wrapper = { formula: true, value: 1035, error: null }
    const payload = updatedPayload({ customFields: { Margin: wrapper } })

    await matchAndFireTriggers("deal.updated", payload)

    // The webhook subscriber forwards payload.data verbatim; unwrapping here would silently
    // strip the structured error signal from the webhook body too.
    expect((payload.data.customFields as Record<string, unknown>).Margin).toBe(wrapper)
    expect(wrapper).toEqual({ formula: true, value: 1035, error: null })
  })
})
