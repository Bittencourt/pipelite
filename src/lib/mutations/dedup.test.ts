import { beforeEach, describe, expect, it, vi } from "vitest"

/* -----------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND — READ THIS FIRST — WHAT IT CANNOT.
 *
 * This is the CALL-ORDER half of 39-VALIDATION V-1. It pins the statement sequence inside
 * `mergeRecordsMutation`'s transaction, the channel every audit row is written through, the
 * three pre-transaction guards, and the fact that the catch cannot leak a driver message.
 *
 * IT CANNOT RAISE `notes_migration_uniq`. A mocked `tx.update` does not enforce a partial
 * unique index, so a green run here says NOTHING about B4 — the 63% of organizations carrying
 * a `source='migration'` note. That proof is `src/lib/mutations/dedup.db.test.ts` (plan 39-10),
 * against the Docker Postgres. The boundary is named here on purpose: 39-CONTEXT records that
 * "a mocked merge test would have passed while the feature failed on 40% of real
 * organizations", and a later reader treating this file as coverage of the constraint is
 * exactly the mistake that would produce.
 *
 * What this file CAN do about B4 is pin the ORDER — the demotion before the reassignment —
 * which is the thing a real-database test would only tell you about after it broke.
 * ----------------------------------------------------------------------------------------- */

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock("@/lib/events", () => ({
  crmBus: { emit: vi.fn() },
}))

// The merge writes its `audit_log` rows directly (no `merged` bus event exists), so the actor
// must be drivable from a test. The real module reads an AsyncLocalStorage store no test
// establishes.
vi.mock("@/lib/audit/actor-context", () => ({
  getCurrentActor: vi.fn(() => undefined),
}))

vi.mock("@/lib/custom-fields", () => ({
  getActiveFieldDefinitions: vi.fn(async () => []),
}))

// `importOriginal` keeps ENTITY_NATIVE_ATTRIBUTES, CASCADE_CHILD_RELATIONS,
// FORMULA_EVALUATION_BUDGET and buildRelatedEntities REAL, so a drift between the derived
// parent-ref list and the map it is derived from cannot pass silently. Only the recalculation
// itself is mocked — its behaviour is covered exhaustively by formula-recalc.test.ts.
vi.mock("@/lib/formula-recalc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/formula-recalc")>()
  return {
    ...actual,
    recalculateFormulas: vi.fn(async () => ({ customFields: {}, evaluations: 1 })),
  }
})

import { getTableColumns } from "drizzle-orm"

import { db } from "@/db"
import { activities, auditLog, deals, duplicatePairs, notes, organizations, people } from "@/db/schema"
import { getCurrentActor } from "@/lib/audit/actor-context"
import { getActiveFieldDefinitions } from "@/lib/custom-fields"
import { MERGE_EXCLUDED_COLUMNS } from "@/lib/dedup/field-groups"
import { crmBus } from "@/lib/events"
import { recalculateFormulas } from "@/lib/formula-recalc"

import { MERGE_MARKER_KEYS, mergeRecordsMutation } from "./dedup"

const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}
const mockEmit = crmBus.emit as unknown as ReturnType<typeof vi.fn>
const mockGetCurrentActor = vi.mocked(getCurrentActor)
const mockGetDefinitions = vi.mocked(getActiveFieldDefinitions)
const mockRecalculate = vi.mocked(recalculateFormulas)

/** Every drizzle table this mutation may touch, so a recorded op names a table not an object. */
const TABLE_NAMES = new Map<unknown, string>([
  [organizations, "organizations"],
  [people, "people"],
  [deals, "deals"],
  [notes, "notes"],
  [auditLog, "auditLog"],
  [duplicatePairs, "duplicatePairs"],
  [activities, "activities"],
])

const nameOf = (table: unknown): string => TABLE_NAMES.get(table) ?? "unknown"

/** One recorded statement. `label` is what the order assertions read. */
interface RecordedOp {
  op: "select" | "update" | "insert" | "emit"
  table: string
  label: string
  set?: Record<string, unknown>
  values?: Record<string, unknown>[]
}

const SURVIVOR = {
  id: "org-survivor",
  name: "Acme Ltda",
  normName: "acme",
  website: null,
  industry: "Tech",
  notes: null,
  ownerId: "u1",
  defaultCurrency: "BRL",
  customFields: { "CNPJ / CPF": "111" },
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
}

const LOSER = {
  ...SURVIVOR,
  id: "org-loser",
  name: "Acme LTDA ME",
  normName: "acme",
  industry: null,
  website: "https://acme.example",
  customFields: { "CNPJ / CPF": "222" },
}

interface SetupOptions {
  /** Rows the two pre-transaction reads resolve with, in order. */
  survivorRow?: Record<string, unknown>
  loserRow?: Record<string, unknown>
  /**
   * "The read found nothing". Separate BOOLEAN flags rather than passing `undefined` for the row
   * above: a destructuring default fires on `undefined`, so `{ loserRow: undefined }` would
   * silently hand the test the default row and pass for the wrong reason.
   */
  survivorMissing?: boolean
  loserMissing?: boolean
  /** The `duplicate_pairs` row the V-9 membership read resolves with. */
  pairRow?: { recordAId: string; recordBId: string }
  pairMissing?: boolean
  movedDeals?: { id: string }[]
  movedPeople?: { id: string }[]
  demotedNotes?: { id: string }[]
  movedNotes?: { id: string }[]
  /** Both FOR UPDATE re-reads resolve empty when false — the "already gone" state. */
  lockedRowsPresent?: boolean
  /** Thrown from the first `tx.insert`, to exercise the rollback path. */
  throwOnInsert?: unknown
}

interface Harness {
  sequence: RecordedOp[]
  txUpdate: ReturnType<typeof vi.fn>
  txInsert: ReturnType<typeof vi.fn>
  emitObservedTxSettled: () => boolean | null
  labels: () => string[]
}

/**
 * One `tx` handle whose every statement is recorded in call order.
 *
 * ORDER IS THE PROPERTY THESE TESTS EXIST TO PIN, so assertions read indices out of
 * `sequence` rather than relying on `toHaveBeenCalledWith` — which says a statement happened
 * and says nothing about when.
 *
 * `label` folds the `set` payload into the identity of the statement, because four of the
 * recorded updates share a table with another: the two `notes` writes (demote vs reassign)
 * and the two `organizations` writes (survivor values vs the loser's soft delete). Telling
 * them apart by table alone is exactly how a reversed pair passes.
 */
function setup(options: SetupOptions = {}): Harness {
  const {
    survivorRow = SURVIVOR,
    loserRow = LOSER,
    pairRow = { recordAId: "org-loser", recordBId: "org-survivor" },
    survivorMissing = false,
    loserMissing = false,
    pairMissing = false,
    movedDeals = [],
    movedPeople = [],
    demotedNotes = [],
    movedNotes = [],
    lockedRowsPresent = true,
    throwOnInsert,
  } = options

  const sequence: RecordedOp[] = []
  let txSettled = false
  let emitObservedTxSettled: boolean | null = null

  // ---- module-level reads (outside the transaction) ----
  const selectLimit = vi
    .fn()
    .mockResolvedValueOnce(survivorMissing ? [] : [survivorRow])
    .mockResolvedValueOnce(loserMissing ? [] : [loserRow])
    .mockResolvedValueOnce(pairMissing ? [] : [pairRow])
    .mockResolvedValue([])
  const selectWhere = vi.fn(() => ({ limit: selectLimit }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  mockDb.select.mockImplementation(() => ({ from: selectFrom }))

  // ---- the transaction handle ----
  const txSelectFor = vi.fn(async () => (lockedRowsPresent ? [{ id: "x", deletedAt: null }] : []))
  const txSelectWhere = vi.fn(() => ({ for: txSelectFor }))
  const txSelectFrom = vi.fn((table: unknown) => {
    sequence.push({ op: "select", table: nameOf(table), label: `select:${nameOf(table)}` })
    return { where: txSelectWhere }
  })
  const txSelect = vi.fn(() => ({ from: txSelectFrom }))

  // Two `notes` updates and two `organizations` updates share a table, so the returning queue
  // is keyed off the recorded label rather than off call position — a `mockResolvedValueOnce`
  // chain here would silently shift if a statement were inserted between two of them.
  const returningFor = (label: string): { id: string }[] => {
    if (label === "update:deals(reparent)") return movedDeals
    if (label === "update:people(reparent)") return movedPeople
    if (label === "update:notes(demote)") return demotedNotes
    if (label === "update:notes(reassign)") return movedNotes
    return [{ ...survivorRow, id: String(survivorRow.id ?? "") } as unknown as { id: string }]
  }

  const txUpdate = vi.fn((table: unknown) => ({
    set: (payload: Record<string, unknown>) => {
      const label = updateLabel(nameOf(table), payload)
      sequence.push({ op: "update", table: nameOf(table), label, set: payload })
      const rows = returningFor(label)
      const settled = Promise.resolve(undefined) as Promise<undefined> & {
        returning: () => Promise<unknown[]>
      }
      settled.returning = async () => rows
      return { where: () => settled }
    },
  }))

  const txInsert = vi.fn((table: unknown) => ({
    values: async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      sequence.push({
        op: "insert",
        table: nameOf(table),
        label: `insert:${nameOf(table)}`,
        values: Array.isArray(payload) ? payload : [payload],
      })
      if (throwOnInsert !== undefined) throw throwOnInsert
      return undefined
    },
  }))

  const tx = { select: txSelect, update: txUpdate, insert: txInsert }

  mockDb.transaction.mockImplementation(async (cb: (handle: typeof tx) => Promise<unknown>) => {
    const result = await cb(tx)
    txSettled = true
    return result
  })

  mockEmit.mockImplementation(() => {
    emitObservedTxSettled = txSettled
    sequence.push({ op: "emit", table: "crmBus", label: "emit:crmBus" })
    return true
  })

  mockGetCurrentActor.mockReturnValue(undefined)
  mockGetDefinitions.mockResolvedValue([])
  mockRecalculate.mockResolvedValue({ customFields: {}, evaluations: 1 })

  return {
    sequence,
    txUpdate,
    txInsert,
    emitObservedTxSettled: () => emitObservedTxSettled,
    labels: () => sequence.map((entry) => entry.label),
  }
}

/**
 * The statement's identity: its table plus the distinguishing part of its SET payload.
 *
 * The discriminators are chosen to be unambiguous across BOTH entity branches, which a naive
 * "people means a child reparent" rule is not — a person merge updates `people` for the SURVIVOR,
 * and `people.organizationId` is itself a compared field, so the presence of a foreign key column
 * cannot be the test either. `customFields` is: the survivor's update is the only statement that
 * writes the blob wholesale, and it is checked first.
 */
function updateLabel(table: string, payload: Record<string, unknown>): string {
  if (table === "notes") {
    if ("source" in payload) return "update:notes(demote)"
    if ("entityId" in payload) return "update:notes(reassign)"
  }
  if (table === "duplicatePairs") return `update:duplicatePairs(${String(payload.status)})`
  if ("customFields" in payload) return `update:${table}(survivor)`
  if ("deletedAt" in payload) return `update:${table}(loser)`
  if ("organizationId" in payload || "personId" in payload) return `update:${table}(reparent)`
  return `update:${table}(other)`
}

const baseInput = {
  entityType: "organization" as const,
  pairId: "pair-1",
  survivorId: "org-survivor",
  loserId: "org-loser",
  choices: {},
}

/** Index of a label, with a message that names the whole recorded sequence when it is absent. */
function indexOf(harness: Harness, label: string): number {
  const at = harness.labels().indexOf(label)
  expect(at, `${label} was never issued; recorded: ${harness.labels().join(" -> ")}`).toBeGreaterThan(-1)
  return at
}

beforeEach(() => {
  // `resetAllMocks`, NOT `clearAllMocks`: a `mockResolvedValueOnce` queue survives `clear` and
  // would shift the next test's reads onto the previous test's rows while still passing
  // (recorded in Phase 38). Every mock is re-established by `setup()`.
  vi.resetAllMocks()
})

describe("mergeRecordsMutation — the pre-transaction guards", () => {
  it("Test 1: refuses a self-merge with SAME_RECORD and touches the database not at all", async () => {
    setup()

    const result = await mergeRecordsMutation({ ...baseInput, loserId: "org-survivor" })

    expect(result).toEqual({ success: false, error: "SAME_RECORD" })
    // A self-merge would soft-delete the record it had just updated, so the cheapest guard is
    // also the one that must not read anything first.
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("Test 2: a missing loser returns NOT_FOUND and opens no transaction", async () => {
    setup({ loserMissing: true })

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toEqual({ success: false, error: "NOT_FOUND" })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("Test 3: a survivor outside the named pair returns NOT_IN_PAIR and opens no transaction", async () => {
    // V-9 / T-39-02: `survivorId`, `loserId` and `pairId` all arrive from a browser. Without
    // this control a crafted request naming a real pair and two unrelated ids merges anything
    // into anything — and the result is not recoverable by the user.
    setup({ pairRow: { recordAId: "other-a", recordBId: "other-b" } })

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toEqual({ success: false, error: "NOT_IN_PAIR" })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("Test 3b: a pairId naming no row at all is refused, not treated as absent", async () => {
    setup({ pairMissing: true })

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toEqual({ success: false, error: "NOT_IN_PAIR" })
    expect(mockDb.transaction).not.toHaveBeenCalled()
  })

  it("a null pairId skips the membership read entirely", async () => {
    const harness = setup({ movedDeals: [{ id: "d1" }] })

    const result = await mergeRecordsMutation({ ...baseInput, pairId: null })

    expect(result).toMatchObject({ success: true })
    // Two reads, not three: the survivor and the loser, and no pair.
    expect(mockDb.select).toHaveBeenCalledTimes(2)
    expect(harness.labels()).not.toContain("update:duplicatePairs(merged)")
    // The supersede sweep still runs — it is about the loser, not about the pair.
    expect(harness.labels()).toContain("update:duplicatePairs(superseded)")
  })

  it("a row that disappears between the pre-read and the FOR UPDATE lock is NOT_FOUND", async () => {
    // 39-UI-SPEC M-8. Genuinely reachable: a pair can sit in the review list while another
    // request deletes one of its records.
    const harness = setup({ lockedRowsPresent: false })

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toEqual({ success: false, error: "NOT_FOUND" })
    expect(mockDb.transaction).toHaveBeenCalled()
    // Nothing was written before the lock check refused.
    expect(harness.labels().filter((label) => label.startsWith("update:"))).toEqual([])
  })
})

describe("mergeRecordsMutation — statement order inside the transaction", () => {
  it("Test 4: issues the merge statements in the contracted order", async () => {
    const harness = setup({
      movedDeals: [{ id: "d1" }],
      movedPeople: [{ id: "p1" }],
      demotedNotes: [{ id: "n1" }],
      movedNotes: [{ id: "n1" }, { id: "n2" }],
    })

    const result = await mergeRecordsMutation(baseInput)
    expect(result).toMatchObject({ success: true })

    // The whole contracted sequence, as a subsequence of what was recorded. Asserted as a list
    // rather than pairwise so a statement inserted in the wrong place fails here and not in
    // some later test that happens to straddle it.
    const contracted = [
      "update:deals(reparent)",
      "update:people(reparent)",
      "update:notes(demote)",
      "update:notes(reassign)",
      "update:organizations(survivor)",
      "update:organizations(loser)",
      "insert:auditLog",
      "update:duplicatePairs(merged)",
      "update:duplicatePairs(superseded)",
    ]
    const recorded = harness.labels()
    const positions = contracted.map((label) => recorded.indexOf(label))

    expect(positions, `recorded: ${recorded.join(" -> ")}`).not.toContain(-1)
    expect(
      positions.every((position, index) => index === 0 || position > positions[index - 1]),
      `contracted order violated. recorded: ${recorded.join(" -> ")}`
    ).toBe(true)

    // Both FOR UPDATE re-reads precede every write.
    const firstWrite = recorded.findIndex((label) => label.startsWith("update:"))
    expect(recorded.slice(0, firstWrite).filter((label) => label.startsWith("select:"))).toHaveLength(2)
  })

  it("Test 5: the note demotion is issued BEFORE the note reassignment", async () => {
    // Reversing these two reintroduces the 23505 on `notes_migration_uniq` for the 63% of
    // organizations that carry a migration note. This assertion is the only automated guard on
    // that order — a mocked write cannot raise the constraint itself.
    const harness = setup({
      demotedNotes: [{ id: "n1" }],
      movedNotes: [{ id: "n1" }, { id: "n2" }],
    })

    await mergeRecordsMutation(baseInput)

    const demoteAt = indexOf(harness, "update:notes(demote)")
    const reassignAt = indexOf(harness, "update:notes(reassign)")

    expect(
      demoteAt,
      `the demotion must precede the reassignment: demote at index ${demoteAt}, ` +
        `reassign at index ${reassignAt}. recorded: ${harness.labels().join(" -> ")}`
    ).toBeLessThan(reassignAt)
  })

  it("Test 11: activities are never updated, while deals demonstrably are", async () => {
    // Activities have `deal_id` and nothing else, so they follow their deal transitively. The
    // positive half is what stops the negative from passing vacuously.
    const harness = setup({ movedDeals: [{ id: "d1" }] })

    await mergeRecordsMutation(baseInput)

    const tables = harness.txUpdate.mock.calls.map((call) => call[0])
    expect(tables).not.toContain(activities)
    expect(tables).toContain(deals)
  })
})

describe("mergeRecordsMutation — the audit write channel", () => {
  it("Test 6: every audit row goes through the transaction handle, never the module client", async () => {
    const harness = setup({
      movedDeals: [{ id: "d1" }],
      movedPeople: [{ id: "p1" }],
    })

    await mergeRecordsMutation(baseInput)

    const auditInserts = harness.txInsert.mock.calls.filter((call) => call[0] === auditLog)
    expect(auditInserts.length).toBeGreaterThanOrEqual(3)

    // The half that makes this non-vacuous: a bus-written row uses the module-level client and
    // would survive a rollback, so the timeline could show a merge that never happened.
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("writes a `merged` row on each side, the survivor's carrying the markers", async () => {
    const harness = setup({
      movedDeals: [{ id: "d1" }],
      demotedNotes: [{ id: "n1" }],
      movedNotes: [{ id: "n1" }],
    })

    await mergeRecordsMutation(baseInput)

    const rows = harness.sequence
      .filter((entry) => entry.op === "insert" && entry.table === "auditLog")
      .flatMap((entry) => entry.values ?? [])

    const survivorRow = rows.find(
      (row) => row.entityId === "org-survivor" && row.action === "merged"
    ) as { changes: Record<string, { from: unknown; to: unknown }> } | undefined
    const loserRow = rows.find(
      (row) => row.entityId === "org-loser" && row.action === "merged"
    ) as { changes: Record<string, { from: unknown; to: unknown }> } | undefined

    expect(survivorRow).toBeDefined()
    expect(loserRow).toBeDefined()

    expect(survivorRow!.changes[MERGE_MARKER_KEYS.mergedFrom]).toEqual({
      from: "org-loser",
      to: null,
    })
    expect(survivorRow!.changes[MERGE_MARKER_KEYS.mergedFromName]).toEqual({
      from: "Acme LTDA ME",
      to: null,
    })
    // 1 deal + 0 people + 1 note.
    expect(survivorRow!.changes[MERGE_MARKER_KEYS.mergedChildren]).toEqual({ from: null, to: 2 })
    // The demotion fired, so the reclassification is on the record.
    expect(survivorRow!.changes[MERGE_MARKER_KEYS.mergedNoteReclassified]).toEqual({
      from: "migration",
      to: "user",
    })
    // The ordinary per-field diff shares the map, in the shape `AuditFieldRow` already renders.
    expect(survivorRow!.changes.industry).toBeUndefined()
    expect(survivorRow!.changes.name).toBeUndefined()

    expect(loserRow!.changes[MERGE_MARKER_KEYS.mergedInto]).toEqual({
      from: null,
      to: "org-survivor",
    })
  })

  it("omits the reclassification marker when no migration note had to be demoted", async () => {
    const harness = setup({ movedNotes: [{ id: "n1" }] })

    await mergeRecordsMutation(baseInput)

    const rows = harness.sequence
      .filter((entry) => entry.op === "insert" && entry.table === "auditLog")
      .flatMap((entry) => entry.values ?? [])
    const survivorRow = rows.find(
      (row) => row.entityId === "org-survivor" && row.action === "merged"
    ) as { changes: Record<string, unknown> }

    expect(survivorRow.changes).not.toHaveProperty(MERGE_MARKER_KEYS.mergedNoteReclassified)
  })

  it("records the survivor's adopted field values as an ordinary diff", async () => {
    // The survivor's `industry` is populated and the loser's is empty, so `industry` is
    // IDENTICAL by 39-UI-SPEC M-3 and the survivor keeps it. `website` is the reverse — the
    // survivor is empty and the loser is not — so it defaults to the LOSER and moves.
    const harness = setup({})

    await mergeRecordsMutation(baseInput)

    const survivorSet = harness.sequence.find(
      (entry) => entry.label === "update:organizations(survivor)"
    )?.set
    expect(survivorSet?.website).toBe("https://acme.example")
    expect(survivorSet?.industry).toBe("Tech")

    const rows = harness.sequence
      .filter((entry) => entry.op === "insert" && entry.table === "auditLog")
      .flatMap((entry) => entry.values ?? [])
    const survivorRow = rows.find(
      (row) => row.entityId === "org-survivor" && row.action === "merged"
    ) as { changes: Record<string, { from: unknown; to: unknown }> }

    expect(survivorRow.changes.website).toEqual({ from: null, to: "https://acme.example" })
    expect(survivorRow.changes).not.toHaveProperty("industry")
  })

  it("Test 7: one `updated` row per reparented child, and none for a kind with no children", async () => {
    // 12 children, 9 of one kind (the Phase 38 lesson): a 1-or-2 fixture cannot distinguish a
    // per-record write from a once-per-loop write in the failure message.
    const nineDeals = Array.from({ length: 9 }, (_, index) => ({ id: `deal-${index}` }))
    const threePeople = Array.from({ length: 3 }, (_, index) => ({ id: `person-${index}` }))
    const harness = setup({ movedDeals: nineDeals, movedPeople: threePeople })

    const result = await mergeRecordsMutation(baseInput)
    expect(result).toMatchObject({ success: true, movedChildren: 12 })

    const childRows = harness.sequence
      .filter((entry) => entry.op === "insert" && entry.table === "auditLog")
      .flatMap((entry) => entry.values ?? [])
      .filter((row) => row.action === "updated")

    expect(childRows.filter((row) => row.entityType === "deal")).toHaveLength(9)
    expect(childRows.filter((row) => row.entityType === "person")).toHaveLength(3)

    for (const row of childRows) {
      expect(row.changes).toEqual({ organizationId: { from: "org-loser", to: "org-survivor" } })
    }
  })

  it("Test 7b: no audit insert at all for a child kind with zero rows", async () => {
    const harness = setup({ movedDeals: [{ id: "d1" }], movedPeople: [] })

    await mergeRecordsMutation(baseInput)

    const childRows = harness.sequence
      .filter((entry) => entry.op === "insert" && entry.table === "auditLog")
      .flatMap((entry) => entry.values ?? [])
      .filter((row) => row.action === "updated")

    expect(childRows.filter((row) => row.entityType === "person")).toHaveLength(0)
    // An `insert().values([])` is a driver error, not a no-op, so the insert must be skipped
    // rather than issued with an empty array.
    for (const entry of harness.sequence) {
      if (entry.op === "insert") expect(entry.values?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("a person merge reparents deals by personId and touches no second child table", async () => {
    const harness = setup({
      survivorRow: { ...SURVIVOR, id: "p-survivor", firstName: "Ana", lastName: "Silva" },
      loserRow: { ...LOSER, id: "p-loser", firstName: "Ana", lastName: "Silva" },
      pairRow: { recordAId: "p-loser", recordBId: "p-survivor" },
      movedDeals: [{ id: "d1" }],
    })

    const result = await mergeRecordsMutation({
      ...baseInput,
      entityType: "person",
      survivorId: "p-survivor",
      loserId: "p-loser",
    })

    expect(result).toMatchObject({ success: true })
    expect(harness.labels()).toContain("update:deals(reparent)")
    // A PERSON HAS NO PEOPLE. `people` is written exactly once here — the survivor's own values —
    // and never as a child reparent, which is the organization branch's second child table.
    expect(harness.labels()).not.toContain("update:people(reparent)")
    // Exactly two `people` writes, both about the merged pair itself: the survivor's values and
    // the loser's soft delete. Any third would be a child reparent that does not exist.
    expect(harness.labels().filter((label) => label.startsWith("update:people"))).toEqual([
      "update:people(survivor)",
      "update:people(loser)",
    ])

    const childRows = harness.sequence
      .filter((entry) => entry.op === "insert" && entry.table === "auditLog")
      .flatMap((entry) => entry.values ?? [])
      .filter((row) => row.action === "updated")
    expect(childRows[0].changes).toEqual({ personId: { from: "p-loser", to: "p-survivor" } })
  })
})

describe("mergeRecordsMutation — failure cannot leak the schema", () => {
  it("Test 8: a 23505 inside the transaction returns FAILED and leaks no index name", async () => {
    const pgError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "notes_migration_uniq"',
    }
    setup({ movedNotes: [{ id: "n1" }], throwOnInsert: pgError })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toEqual({ success: false, error: "FAILED" })
    // The whole returned value, serialised — not just the `error` field, so a leak smuggled onto
    // a second property cannot pass.
    expect(JSON.stringify(result)).not.toContain("notes_migration_uniq")
    expect(JSON.stringify(result)).not.toContain("23505")
    expect(JSON.stringify(result)).not.toContain("duplicate key")
    // The real error is not swallowed — it goes to the server log, where it belongs.
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe("mergeRecordsMutation — what runs after the commit", () => {
  it("Test 9: crmBus.emit fires AFTER the transaction resolves", async () => {
    const harness = setup({ movedDeals: [{ id: "d1" }] })

    await mergeRecordsMutation(baseInput)

    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit.mock.calls[0][0]).toBe("organization.deleted")
    // The transaction mock latches a flag only once its callback has returned, so an emit moved
    // inside the callback observes `false` here. Asserting the flag rather than a call index is
    // what makes this test detect the move wherever inside the callback it lands.
    expect(
      harness.emitObservedTxSettled(),
      "crmBus.emit ran before the transaction settled — it must be outside the db.transaction callback"
    ).toBe(true)

    const payload = mockEmit.mock.calls[0][1] as Record<string, unknown>
    expect(payload.entityId).toBe("org-loser")
    // Every delete emit site passes `data === { id }`, which makes `previous` the only source of
    // state a subscriber can build a tombstone from.
    expect(payload.data).toEqual({ id: "org-loser" })
    expect(payload.previous).toBe(LOSER)
  })

  it("Test 9b: crmBus.emit does NOT fire when the transaction rejects", async () => {
    setup({ throwOnInsert: new Error("boom") })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toEqual({ success: false, error: "FAILED" })
    expect(mockEmit).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("nothing is emitted for the SURVIVOR", async () => {
    // `organization.updated` is an audited event, so emitting it would write a second audit row
    // duplicating the diff the `merged` row already carries.
    setup({ movedDeals: [{ id: "d1" }] })

    await mergeRecordsMutation(baseInput)

    const events = mockEmit.mock.calls.map((call) => call[0])
    expect(events).not.toContain("organization.updated")
    expect(events).toEqual(["organization.deleted"])
  })

  it("Test 10: a throwing recalculation does not change the successful result", async () => {
    setup({ movedDeals: [{ id: "d1" }] })
    mockRecalculate.mockRejectedValue(new Error("formula blew up"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await mergeRecordsMutation(baseInput)

    expect(result).toMatchObject({ success: true, movedChildren: 1 })
    expect(errorSpy).toHaveBeenCalled()
    // The emit still happens: the two post-commit blocks are independent.
    expect(mockEmit).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it("refreshes every reparented child once, sharing ONE evaluation budget", async () => {
    const harness = setup({
      movedDeals: [{ id: "d1" }, { id: "d2" }],
      movedPeople: [{ id: "p1" }],
    })
    mockRecalculate.mockResolvedValue({ customFields: {}, evaluations: 10 })

    await mergeRecordsMutation(baseInput)
    void harness

    expect(mockRecalculate).toHaveBeenCalledTimes(3)

    const budgets = mockRecalculate.mock.calls.map(
      (call) => (call[0] as { budget?: number }).budget
    )
    // ONE decrementing allowance across the loop, not one per child (T-34-03): 500, 490, 480.
    expect(budgets).toEqual([500, 490, 480])

    for (const call of mockRecalculate.mock.calls) {
      const argument = call[0]
      // The child's OWN fields did not change; only its parent's did.
      expect(argument.changedFields).toEqual([])
      // The children ARE the cascade here; leaving it default would fan out a further hop each.
      expect(argument.cascade).toBe(false)
      expect(argument.definitionsCache).toBeInstanceOf(Map)
    }
  })

  it("keys the parent's changed refs by the prefix buildRelatedEntities itself used", async () => {
    setup({ movedDeals: [{ id: "d1" }] })
    mockGetDefinitions.mockResolvedValue([
      { id: "def-1", name: "CNPJ / CPF", type: "text" },
    ] as unknown as Awaited<ReturnType<typeof getActiveFieldDefinitions>>)

    await mergeRecordsMutation(baseInput)

    const argument = mockRecalculate.mock.calls[0][0] as {
      changedRelatedFields?: Record<string, string[]>
      relatedEntities?: Record<string, unknown>
    }

    // Both objects must be keyed by the SAME prefix; reading it off `buildRelatedEntities`'
    // result is what makes them impossible to disagree.
    expect(Object.keys(argument.changedRelatedFields ?? {})).toEqual(
      Object.keys(argument.relatedEntities ?? {})
    )
    expect(Object.keys(argument.changedRelatedFields ?? {})).toEqual(["Organization"])

    const refs = argument.changedRelatedFields!.Organization
    // Derived from ENTITY_NATIVE_ATTRIBUTES.organization (kept REAL by importOriginal), which is
    // what `parentChangedRefNames` folds in: the attribute spellings AND the column names.
    for (const attribute of ["Name", "Website", "Industry", "Notes"]) {
      expect(refs).toContain(attribute)
    }
    for (const column of ["name", "website", "industry", "notes"]) {
      expect(refs).toContain(column)
    }
    // Plus every parent definition name, which is what the `customFields` sentinel expands to.
    expect(refs).toContain("CNPJ / CPF")
  })
})

describe("mergeRecordsMutation — the generated-column guard", () => {
  it("keeps MERGE_EXCLUDED_COLUMNS in step with every generated column of both tables", () => {
    // THE DRIFT ALARM `field-groups.ts` cannot hold itself: it is database-free by design, so it
    // lists these three by name. A fourth generated column must fail HERE, not in production on
    // the first merge of that entity type with SQLSTATE 428C9.
    for (const table of [organizations, people]) {
      for (const [property, column] of Object.entries(getTableColumns(table))) {
        if (column.generated === undefined) continue
        expect(
          MERGE_EXCLUDED_COLUMNS.has(property),
          `${property} is GENERATED ALWAYS and must be in MERGE_EXCLUDED_COLUMNS`
        ).toBe(true)
      }
    }
    // Anti-vacuity: the loop above must actually have found some.
    const generated = Object.values(getTableColumns(people)).filter(
      (column) => column.generated !== undefined
    )
    expect(generated.length).toBeGreaterThanOrEqual(3)
  })

  it("never puts a generated column in the survivor's SET clause", async () => {
    const harness = setup({})

    await mergeRecordsMutation(baseInput)

    const survivorSet = harness.sequence.find(
      (entry) => entry.label === "update:organizations(survivor)"
    )?.set
    expect(survivorSet).toBeDefined()

    for (const [property, column] of Object.entries(getTableColumns(organizations))) {
      if (column.generated === undefined) continue
      expect(survivorSet).not.toHaveProperty(property)
    }
    // Anti-vacuity: the SET clause is not empty, and it does carry a real column.
    expect(survivorSet).toHaveProperty("customFields")
    expect(survivorSet).toHaveProperty("updatedAt")
  })
})
