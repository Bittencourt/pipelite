/**
 * DEDUP-01 / SC-1 — the create-time certain-match lookup.
 *
 * There is no database here. Every assertion about a query is made against the STATEMENT the
 * module builds, rendered to real SQL text and bind params by `PgDialect.sqlToQuery` — the same
 * technique `src/lib/trash/queries.test.ts` and `src/lib/audit/prune.test.ts` use. That matters
 * because the four properties this module has to guarantee are all properties of the statement
 * rather than of its result:
 *
 *   1. NO QUERY AT ALL on the degraded paths. An unconfigured identity key and a junk e-mail must
 *      cost NOTHING, and the only way to tell "returned []" from "round-tripped and then returned
 *      []" without a database is to count the `db.select` calls.
 *   2. THE EQUALITY IS ON THE GENERATED COLUMN. `scripts/dedup-checks.sql` Part 4 EXPLAINs
 *      `norm_name = public.dedup_norm_org($1)` and `norm_email = lower(btrim(coalesce($1,'')))`
 *      and asserts an index is chosen. A query whose shape drifts from those probes loses the
 *      index silently — no error, no log line, just a sequential scan over 46,054 rows.
 *   3. NOTHING IS INTERPOLATED. Every dynamic value must appear in `params` and never in the text
 *      (T-39-06).
 *   4. THE CAP IS ON THE QUERY. `.limit(5)` after fetching would pass any result-shaped test while
 *      still having pulled an unbounded row set across the wire (T-39-23).
 *
 * `@/db` is mocked down to `select` alone, and `./identity-settings` is mocked so these cases are
 * about the lookup rather than about the setting's own parse (which `identity-settings.test.ts`
 * covers). Any further query the implementation grows surfaces as a TypeError rather than being
 * absorbed by a permissive mock.
 *
 * No deployment-specific custom-field label appears in this file — see the same note in
 * `identity-settings.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

vi.mock("@/db", () => ({ db: { select: vi.fn() } }))
vi.mock("./identity-settings", () => ({ readOrgIdentityFields: vi.fn() }))

import { db } from "@/db"
import { organizations, people } from "@/db/schema"
import { readOrgIdentityFields } from "./identity-settings"
import { CREATE_TIME_MATCH_LIMIT } from "./constants"
import { findCertainMatches } from "./matching"

const mockSelect = (db as unknown as { select: ReturnType<typeof vi.fn> }).select
const mockReadIdentityFields = readOrgIdentityFields as unknown as ReturnType<typeof vi.fn>

const dialect = new PgDialect()

/** Two deployment-neutral stand-in labels. */
const FIELD_A = "Tax ID"
const FIELD_B = "Contact Email"

/** One recorded `db.select(...)` chain: the projection plus every clause hung off it. */
interface RecordedSelect {
  fields: Record<string, unknown>
  from?: unknown
  where?: SQL
  limit?: number
}

interface SelectBuilder extends PromiseLike<unknown[]> {
  from(table: unknown): SelectBuilder
  where(condition: SQL): SelectBuilder
  limit(rows: number): SelectBuilder
}

const selectCalls: RecordedSelect[] = []
let selectOutcomes: Array<unknown[] | Error> = []

function queueSelects(...outcomes: Array<unknown[] | Error>): void {
  selectOutcomes = outcomes
}

function installSelectMock(): void {
  mockSelect.mockImplementation((fields: Record<string, unknown>) => {
    const recorded: RecordedSelect = { fields }
    selectCalls.push(recorded)

    const outcome = selectOutcomes.shift() ?? []

    const builder: SelectBuilder = {
      from(table) {
        recorded.from = table
        return builder
      },
      where(condition) {
        recorded.where = condition
        return builder
      },
      limit(rows) {
        recorded.limit = rows
        return builder
      },
      then(onFulfilled, onRejected) {
        const settled =
          outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
        return settled.then(onFulfilled, onRejected)
      },
    }

    return builder
  })
}

/** A statement rendered to the SQL text and bind params the driver would actually receive. */
function render(statement: SQL | undefined): { sql: string; params: unknown[] } {
  if (!statement) throw new Error("no statement was captured")
  const { sql, params } = dialect.sqlToQuery(statement)
  return { sql: sql.toLowerCase().replace(/\s+/g, " "), params: params as unknown[] }
}

/** The WHERE clause of the nth recorded select, rendered. */
function renderedWhere(index = 0): { sql: string; params: unknown[] } {
  const call = selectCalls[index]
  if (!call) throw new Error(`db.select was not called ${index + 1} time(s)`)
  return render(call.where)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  selectCalls.length = 0
  selectOutcomes = []
  installSelectMock()
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("findCertainMatches — organizations", () => {
  it("Test 1 — returns [] and issues NO query when the identity key is unconfigured", async () => {
    mockReadIdentityFields.mockResolvedValue(null)

    const result = await findCertainMatches({
      entityType: "organization",
      name: "Supermercado Bom Preco",
      customFields: { [FIELD_A]: "1234" },
    })

    expect(result).toEqual([])
    // THIS IS THE GRACEFUL DEGRADATION AND IT MUST COST NOTHING. `null` means no certain tier, so
    // there is no answer a round trip could produce — and the create path pays for this on every
    // submit of every organization on an unconfigured install.
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("Test 2 — returns [] and issues NO query when the draft has no configured identity value", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A, FIELD_B])

    const result = await findCertainMatches({
      entityType: "organization",
      name: "Supermercado Bom Preco",
      customFields: { "Some Other Field": "irrelevant" },
    })

    // A certain match needs the identity field populated on BOTH records
    // (`scoring.ts` firstSharedIdentity). Absent on the draft, no row can ever qualify.
    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns [] and issues NO query when the draft name is not comparable", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A])

    // `isComparableOrgName` refuses initials and empty strings: measured, 9 of 46,054
    // organizations normalize to one, and equality over those collapses them into a clique.
    const result = await findCertainMatches({
      entityType: "organization",
      name: "A B",
      customFields: { [FIELD_A]: "1234" },
    })

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("Test 3 — queries normName equality with deleted_at IS NULL and keeps only certain rows", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A, FIELD_B])
    queueSelects([
      // Certain: equal normalized name AND equal identity value.
      {
        id: "org-1",
        name: "Supermercado Bom Preco LTDA",
        normName: "supermercado bom preco",
        customFields: { [FIELD_A]: "1234" },
      },
      // Same name, DIFFERENT identity value — `likely`, not certain, and the create-time warning
      // shows certain matches only (39-UI-SPEC Surface 1).
      {
        id: "org-2",
        name: "Supermercado Bom Preco ME",
        normName: "supermercado bom preco",
        customFields: { [FIELD_A]: "9999" },
      },
      // Same name, identity field absent — no positive identity evidence, so `likely`.
      {
        id: "org-3",
        name: "Supermercado Bom Preco",
        normName: "supermercado bom preco",
        customFields: {},
      },
    ])

    const result = await findCertainMatches({
      entityType: "organization",
      name: "Supermercado Bom Preco",
      customFields: { [FIELD_A]: "1234" },
    })

    const { sql, params } = renderedWhere()
    expect(selectCalls[0]?.from).toBe(organizations)
    // Part 4 probe 2 EXPLAINs exactly this shape against `org_norm_btree_idx`.
    expect(sql).toContain('"norm_name" = public.dedup_norm_org(')
    expect(sql).toContain('"deleted_at" is null')
    // T-39-06: the name is a bind parameter, never text.
    expect(params).toContain("Supermercado Bom Preco")
    expect(sql).not.toContain("supermercado")

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe("org-1")
    expect(result[0]?.reason).toBe("nameIdentity")
  })

  it("Test 9a — distinguishingValue is the organization's matched identity field value", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A, FIELD_B])
    queueSelects([
      {
        id: "org-1",
        name: "Supermercado Bom Preco LTDA",
        normName: "supermercado bom preco",
        // Only the SECOND configured field is shared, so that is the one that decided and the one
        // 39-UI-SPEC W-7's middle line must show.
        customFields: { [FIELD_B]: "contato@bompreco.example" },
      },
    ])

    const result = await findCertainMatches({
      entityType: "organization",
      name: "Supermercado Bom Preco",
      customFields: { [FIELD_A]: "1234", [FIELD_B]: "Contato@BomPreco.example" },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.distinguishingValue).toBe("contato@bompreco.example")
    expect(result[0]?.name).toBe("Supermercado Bom Preco LTDA")
  })

  it("Test 6 — the cap is on the organization query, not applied after fetching", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A])
    queueSelects([])

    await findCertainMatches({
      entityType: "organization",
      name: "Supermercado Bom Preco",
      customFields: { [FIELD_A]: "1234" },
    })

    // T-39-23. A post-fetch slice would pull every namesake of a 46,054-row table across the wire
    // and only then throw them away.
    expect(selectCalls[0]?.limit).toBe(CREATE_TIME_MATCH_LIMIT)
    expect(CREATE_TIME_MATCH_LIMIT).toBe(5)
  })

  it("Test 7a — excludeId is excluded in the organization query", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A])
    queueSelects([])

    await findCertainMatches({
      entityType: "organization",
      name: "Supermercado Bom Preco",
      customFields: { [FIELD_A]: "1234" },
      excludeId: "org-self",
    })

    const { sql, params } = renderedWhere()
    // A record must never match itself; this is what the future edit path needs.
    expect(sql).toContain('"id" <>')
    expect(params).toContain("org-self")
  })

  it("Test 8a — a rejected organization query returns [] and logs, never throws", async () => {
    mockReadIdentityFields.mockResolvedValue([FIELD_A])
    queueSelects(new Error("relation unavailable"))

    // A duplicate check must never be the reason a create fails (S-5).
    await expect(
      findCertainMatches({
        entityType: "organization",
        name: "Supermercado Bom Preco",
        customFields: { [FIELD_A]: "1234" },
      })
    ).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it("never reads the identity setting for a person draft", async () => {
    queueSelects([])

    await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "da Silva",
      email: "maria.silva@example.com",
    })

    // The person rule is `people.email`, a real column. It has nothing to do with the
    // organization identity setting, and coupling the two would switch the person warning off on
    // every unconfigured install.
    expect(mockReadIdentityFields).not.toHaveBeenCalled()
  })
})

describe("findCertainMatches — people", () => {
  it("Test 4 — queries normEmail equality with deleted_at IS NULL and reason email", async () => {
    queueSelects([
      {
        id: "person-1",
        firstName: "Maria",
        lastName: "da Silva",
        email: "Maria.Silva@Example.COM",
        normName: "maria da silva",
        normPhone: "",
      },
    ])

    const result = await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "Silva",
      email: "maria.silva@example.com",
    })

    const { sql, params } = renderedWhere()
    expect(selectCalls[0]?.from).toBe(people)
    // Part 4 probe 5 EXPLAINs exactly this shape against `people_norm_email_idx`. The probe spells
    // the SAME expression the generated column is built from, which is why nothing can drift.
    expect(sql).toContain('"norm_email" = lower(btrim(coalesce(')
    expect(sql).toContain('"deleted_at" is null')
    expect(params).toContain("maria.silva@example.com")
    expect(sql).not.toContain("@example.com")

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe("person-1")
    expect(result[0]?.reason).toBe("email")
  })

  it("Test 5 — returns [] and issues NO query for the junk e-mail '#'", async () => {
    const result = await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "da Silva",
      email: "#",
    })

    // THE B2 GUARD RUNS BEFORE THE ROUND TRIP, NOT AFTER IT. Measured: 212 people share the
    // literal value `#`, which alone is 22,366 pairs. Querying and then discarding would be a
    // 212-row fetch on every create with a junk address.
    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns [] and issues NO query for an absent e-mail", async () => {
    const result = await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "da Silva",
      email: null,
    })

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns [] and issues NO query for a sentinel placeholder address", async () => {
    const result = await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "da Silva",
      email: "teste@teste.com",
    })

    // Syntactically valid, semantically meaningless — 16 people share it (39-RESEARCH).
    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("Test 9b — distinguishingValue is the person's e-mail and name is first + last", async () => {
    queueSelects([
      {
        id: "person-1",
        firstName: "Maria",
        lastName: "da Silva",
        email: " Maria.Silva@Example.COM ",
        normName: "maria da silva",
        normPhone: "",
      },
    ])

    const result = await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "Silva",
      email: "maria.silva@example.com",
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.distinguishingValue).toBe("Maria.Silva@Example.COM")
    expect(result[0]?.name).toBe("Maria da Silva")
  })

  it("Test 6b — the cap is on the person query too", async () => {
    queueSelects([])

    await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "Silva",
      email: "maria.silva@example.com",
    })

    expect(selectCalls[0]?.limit).toBe(CREATE_TIME_MATCH_LIMIT)
  })

  it("Test 7b — excludeId is excluded in the person query", async () => {
    queueSelects([])

    await findCertainMatches({
      entityType: "person",
      firstName: "Maria",
      lastName: "Silva",
      email: "maria.silva@example.com",
      excludeId: "person-self",
    })

    const { sql, params } = renderedWhere()
    expect(sql).toContain('"id" <>')
    expect(params).toContain("person-self")
  })

  it("Test 8b — a rejected person query returns [] and logs, never throws", async () => {
    queueSelects(new Error("relation unavailable"))

    await expect(
      findCertainMatches({
        entityType: "person",
        firstName: "Maria",
        lastName: "Silva",
        email: "maria.silva@example.com",
      })
    ).resolves.toEqual([])
    expect(errorSpy).toHaveBeenCalled()
  })

  it("drops a returned row whose own e-mail would not qualify as an identity key", async () => {
    queueSelects([
      {
        id: "person-1",
        firstName: "Maria",
        lastName: "da Silva",
        email: null,
        normName: "maria da silva",
        normPhone: "",
      },
    ])

    // Both sides are validated independently (`scoring.ts` classifyPersonMatch), so a junk value
    // on either side can never be promoted by a good value on the other. A row like this cannot
    // come back from the normEmail equality in practice; the guard is what makes that a property
    // of the code rather than of the query plan.
    await expect(
      findCertainMatches({
        entityType: "person",
        firstName: "Maria",
        lastName: "Silva",
        email: "maria.silva@example.com",
      })
    ).resolves.toEqual([])
  })
})
