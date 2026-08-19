/**
 * DEDUP-02 / DEDUP-03 — what the audit source hands the renderer for a `merged` row (39-12).
 *
 * WHY THIS FILE EXISTS AT ALL. `auditSource.branch` and `countBranch` are pure SQL fragments and
 * are already covered by `assemble.test.ts`; `hydrate` is not, because it queries. It is the one
 * place a stored `__merged*` marker becomes a first-class field on `AuditTimelineEntry`, and that
 * translation is where a malformed row either degrades or takes a whole record's timeline page
 * down with it (T-39-28). A source scan cannot prove a `typeof` narrowing; this can.
 *
 * WHAT IS MOCKED, AND WHAT DELIBERATELY IS NOT. Only `@/db` — the same single mock
 * `assemble.test.ts` uses, and for the same reason: `sources.ts` imports the client and that
 * module throws at import time when `DATABASE_URL` is unset. `buildAuditFieldChanges` runs FOR
 * REAL, so the marker-filtering rule proven in `src/lib/audit/present.test.ts` is exercised here
 * end to end rather than restated. No jsdom, no testing library, no second test framework (V-7).
 *
 * THE FIXTURES ARE THE MUTATION'S OWN SHAPES. Every `changes` map below is the literal shape
 * `mergeRecordsMutation` writes (`src/lib/mutations/dedup.ts` — the survivor's row at the
 * `__mergedFrom` / `__mergedFromName` / `__mergedChildren` insert, the loser's at
 * `__mergedInto` / `__mergedIntoName`). A fixture invented here rather than copied from there
 * would let the hydration and the writer drift apart while both suites stayed green.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock @/db BEFORE importing the source (vi.mock factories are hoisted above imports).
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}))

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import { db } from "@/db"
import type { AuditChanges } from "@/db/schema/audit-log"

import { auditSource } from "./sources"
import type { AuditTimelineEntry } from "./types"

const mockDb = db as unknown as { select: ReturnType<typeof vi.fn> }

const OCCURRED_AT = new Date("2026-08-19T10:00:00.000Z")
const SURVIVOR = "0f7a2c81-4d3e-4b19-9a56-1c8e7d2b3f40"
const LOSER = "8c2d1f4a-6b3e-4d59-a0f7-2e9c8b1d4a70"

interface RawRow {
  id: string
  entityType: string
  action: string
  changes: AuditChanges
  actorKind: string
  createdAt: Date
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  runId: string | null
  workflowId: string | null
  workflowName: string | null
}

function rawRow(overrides: Partial<RawRow> = {}): RawRow {
  return {
    id: "audit-1",
    entityType: "organization",
    action: "merged",
    changes: {},
    actorKind: "user",
    createdAt: OCCURRED_AT,
    actorId: "user-1",
    actorName: "Pedro",
    actorEmail: "pedro@example.com",
    runId: null,
    workflowId: null,
    workflowName: null,
    ...overrides,
  }
}

/**
 * Stand in for the one drizzle chain `hydrate` issues:
 * `select().from().leftJoin().leftJoin().leftJoin().where()`, awaited.
 *
 * `where` resolves to the rows, so the whole chain is a thenable at exactly the point the real
 * builder becomes one. NOTHING ELSE is stubbed on purpose: none of these fixtures carries a
 * `customFields.` key or a reference column, so `buildAuditResolution` issues no second query —
 * and if a future fixture does, `db.select` will be called twice and this stub will throw rather
 * than silently resolving a reference to `undefined`.
 */
function stubRows(rows: RawRow[]): void {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => Promise.resolve(rows),
  }
  mockDb.select.mockReturnValue(chain)
}

async function hydrateOne(row: RawRow): Promise<AuditTimelineEntry> {
  stubRows([row])
  const entries = (await auditSource.hydrate([row.id])) as AuditTimelineEntry[]
  expect(entries, "the stub must have produced exactly one hydrated entry").toHaveLength(1)
  return entries[0]
}

/** The survivor's row, verbatim from `mergeRecordsMutation`'s first audit insert. */
function survivorChanges(): AuditChanges {
  return {
    name: { from: "Tyr Energia Ltda", to: "Tyr Energia" },
    __mergedFrom: { from: LOSER, to: null },
    __mergedFromName: { from: "Tyr Energia Ltda (dup)", to: null },
    __mergedChildren: { from: null, to: 7 },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("the merged row's own two fields", () => {
  it("hydrates the loser's name from the __mergedFromName marker", async () => {
    const entry = await hydrateOne(rawRow({ changes: survivorChanges() }))

    expect(
      entry.mergedLoserName,
      "mergedLoserName must carry the name stored in __mergedFromName. It is the only record of what the losing record was called: the row itself is soft-deleted and its name may since have been edited, so reading it live is not an option and the marker is the fact"
    ).toBe("Tyr Energia Ltda (dup)")
  })

  it("hydrates the child count from the __mergedChildren marker's to side", async () => {
    const entry = await hydrateOne(rawRow({ changes: survivorChanges() }))

    expect(
      entry.mergedChildCount,
      "mergedChildCount must come from __mergedChildren's `to`, not its `from`. The mutation writes `{ from: null, to: movedChildren }` because nothing BECAME a count — reading `from` would render 'null linked records moved'"
    ).toBe(7)
  })

  it("still lists the real field changes beside them", async () => {
    const entry = await hydrateOne(rawRow({ changes: survivorChanges() }))

    expect(
      entry.changes.map((change) => change.field),
      "the merged entry must keep its per-field diff — that diff is the whole content of the merge receipt (A-5) — and must carry no row for any of the three markers"
    ).toEqual(["name"])
  })
})

describe("a malformed marker degrades instead of throwing", () => {
  it("reports no name and no children when both markers are missing", async () => {
    const entry = await hydrateOne(
      rawRow({ changes: { name: { from: "Antigo", to: "Novo" } } })
    )

    expect(
      entry.mergedLoserName,
      "a merged row with no __mergedFromName must hydrate null. This is genuinely reachable: the LOSER's own row carries __mergedIntoName instead, and any row written before a future shape change looks exactly like this"
    ).toBeNull()

    expect(
      entry.mergedChildCount,
      "a merged row with no __mergedChildren must hydrate 0, never NaN and never undefined. The renderer feeds this straight into an ICU plural and a non-number would render the raw dotted path"
    ).toBe(0)
  })

  it("rejects a non-string name and a non-number count rather than passing them through", async () => {
    const entry = await hydrateOne(
      rawRow({
        changes: {
          __mergedFromName: { from: { nested: "object" }, to: null },
          __mergedChildren: { from: null, to: "7" },
        },
      })
    )

    expect(
      entry.mergedLoserName,
      "the JSONB column's value type is `unknown` at this boundary, so the narrowing must be a real `typeof` test. An object reaching the predicate's {name} placeholder is a React child next-intl cannot render, and it would take down the whole timeline page rather than one row"
    ).toBeNull()

    expect(
      entry.mergedChildCount,
      'a count stored as the STRING "7" must degrade to 0. next-intl\'s plural selector needs a number; a string would be formatted as an unrecognised argument and the sentence would read as a raw ICU fragment'
    ).toBe(0)
  })

  it("rejects a non-finite count, which typeof alone would let through", async () => {
    const entry = await hydrateOne(
      rawRow({ changes: { __mergedChildren: { from: null, to: Number.NaN } } })
    )

    expect(
      entry.mergedChildCount,
      "NaN is `typeof \"number\"`, so the guard must test finiteness as well. JSON has no NaN literal, but the value arrives through `unknown` from a column any writer can reach, and 'NaN linked records moved' is a sentence no reader should ever see"
    ).toBe(0)
  })
})

describe("every other action is untouched", () => {
  const OTHER_ACTIONS = ["created", "updated", "deleted"] as const

  it("hydrates null and 0 for created, updated and deleted", async () => {
    for (const action of OTHER_ACTIONS) {
      const entry = await hydrateOne(
        rawRow({ action, changes: { name: { from: "Antigo", to: "Novo" } } })
      )

      expect.soft(
        entry.mergedLoserName,
        `a ${action} row must hydrate mergedLoserName as null. Both fields are required rather than optional precisely so no consumer needs a presence check — the meaninglessness is expressed as null/0, not as absence`
      ).toBeNull()

      expect.soft(entry.mergedChildCount, `a ${action} row must hydrate mergedChildCount as 0`).toBe(
        0
      )
    }
  })

  it("leaves the rest of the entry byte-identical to its pre-plan shape", async () => {
    const entry = await hydrateOne(
      rawRow({ action: "updated", changes: { name: { from: "Antigo", to: "Novo" } } })
    )

    // The full contract, asserted as one object so a field silently dropped by this plan's edit
    // fails here rather than surfacing as a blank cell in a browser two plans later.
    expect(entry).toEqual({
      kind: "audit",
      id: "audit-1",
      occurredAt: OCCURRED_AT,
      action: "updated",
      entityType: "organization",
      actorKind: "user",
      actor: { id: "user-1", name: "Pedro", email: "pedro@example.com" },
      workflowRun: null,
      // ALWAYS null and honestly so — audit_log carries no api key reference.
      apiKeyName: null,
      changes: [
        {
          field: "name",
          label: "audit.field.name",
          from: { type: "text", value: "Antigo" },
          to: { type: "text", value: "Novo" },
        },
      ],
      mergedLoserName: null,
      mergedChildCount: 0,
    })
  })

  it("ignores a marker it does not recognise, on any action", async () => {
    // `__purge` rides on a `deleted` row (Phase 37). It must contribute neither a field row nor a
    // merge field: the two hydrated fields read exactly two named markers and nothing else.
    const entry = await hydrateOne(
      rawRow({ action: "deleted", changes: { __purge: { from: null, to: true } } })
    )

    expect(entry.mergedLoserName).toBeNull()
    expect(entry.mergedChildCount).toBe(0)
    expect(
      entry.changes,
      "buildAuditFieldChanges returns [] for deleted before its loop, so the purge marker never reached a field row even before 39-12 — asserted here so the two mechanisms are not confused for one"
    ).toEqual([])
  })
})

describe("the marker spellings have not drifted from the writer", () => {
  /**
   * `sources.ts` copies the two marker strings rather than importing `MERGE_MARKER_KEYS`, so that
   * the timeline's READ path does not pull the merge mutation — the event bus, the formula
   * recalculator, three reparenting paths — in behind two string literals. This is the other half
   * of that decision: a rename in `dedup.ts` fails HERE instead of silently hydrating null on
   * every merged row, which no other assertion in the repo would notice.
   *
   * Comment-stripped, because the marker names are also spelled out in `dedup.ts`'s own doc
   * comments and a gate answered by a comment is the collision phases 37-38 lost fifteen runs to.
   */
  const DEDUP_PATH = "src/lib/mutations/dedup.ts"
  const SOURCES_PATH = "src/lib/timeline/sources.ts"

  const DEDUP = readStrippedSource(DEDUP_PATH)
  const SOURCES = readStrippedSource(SOURCES_PATH)

  it("read both sources", () => {
    for (const [path, source] of [
      [DEDUP_PATH, DEDUP],
      [SOURCES_PATH, SOURCES],
    ] as [string, string][]) {
      expect(
        source.length,
        `${path} must have been read: a helper returning "" would satisfy every assertion below`
      ).toBeGreaterThan(0)
    }
  })

  it("finds MERGE_MARKER_KEYS still declaring both keys the reader depends on", () => {
    expect(
      DEDUP,
      "dedup.ts must still declare MERGE_MARKER_KEYS. If the marker map moves or is renamed, this gate must go RED and be rewritten rather than keep passing over a file that no longer writes the markers"
    ).toContain("MERGE_MARKER_KEYS")

    for (const key of ['"__mergedFromName"', '"__mergedChildren"']) {
      expect.soft(
        DEDUP,
        `dedup.ts must still write ${key}. sources.ts reads that exact string; a rename on the writing side would hydrate null on every merged row from that day forward and no type error would appear, because both sides only ever agree through this literal`
      ).toContain(key)
    }
  })

  it("finds the reader holding the same two spellings", () => {
    for (const key of ['"__mergedFromName"', '"__mergedChildren"']) {
      expect.soft(
        SOURCES,
        `sources.ts must read ${key}. Anti-vacuity for the assertion above: if the reader stopped naming the key, "the writer still writes it" would be a fact about nothing`
      ).toContain(key)
    }
  })

  it("does not route the loser-side name marker into the survivor's field", () => {
    expect(
      SOURCES.includes("__mergedIntoName"),
      'sources.ts must not read "__mergedIntoName". It holds the SURVIVOR\'s name, on the loser\'s own row; feeding it to mergedLoserName would render `merged {name} into this record` backwards. The behavioural half of this claim is the loser-row test below — this half stops the string being reintroduced at a second site'
    ).toBe(false)
  })
})

describe("the loser's own row", () => {
  it("carries the survivor's name under a DIFFERENT marker, and is not mistaken for it", async () => {
    // The shape `mergeRecordsMutation` writes on the LOSER (39-09's recorded deviation: the
    // loser's in-transaction row is `merged`, not `deleted` — the tombstone comes from the bus).
    const entry = await hydrateOne(
      rawRow({
        changes: {
          __mergedInto: { from: null, to: SURVIVOR },
          __mergedIntoName: { from: null, to: "Tyr Energia" },
          __mergedChildren: { from: null, to: 7 },
        },
      })
    )

    expect(
      entry.mergedLoserName,
      "__mergedIntoName must NOT populate mergedLoserName. It holds the SURVIVOR's name, and rendering it through the `merged {name} into this record` predicate would state the merge backwards — a confidently wrong fact in an audit log, which this repo's own actor-attribution rule (T-36-29) forbids in favour of an honest omission"
    ).toBeNull()

    expect(
      entry.mergedChildCount,
      "__mergedChildren is written on BOTH sides and means the same thing on both, so the count is read on the loser's row too"
    ).toBe(7)
  })
})
