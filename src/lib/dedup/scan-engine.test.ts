import { beforeEach, describe, expect, it, vi } from "vitest"

/* -----------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND — READ THIS FIRST — WHAT IT CANNOT.
 *
 * This is the STATEMENT-SHAPE AND CALL-ORDER half of the scan. It pins the family of SQL
 * statements `runDuplicateScan` issues, the ORDER it issues them in, the fact that the
 * `pg_trgm` threshold is set LOCALLY to the transaction, the `status <> 'dismissed'` guard
 * that is the entire dismissal-survives-a-rescan mechanism, and the two failure postures
 * (a rejection never escapes; an exploding pair count rolls the transaction back).
 *
 * IT CANNOT MEASURE A PLAN OR A ROW COUNT. A mocked `tx.execute` has no planner, so nothing
 * here can catch a sequential scan of `scan_groups` and nothing here can tell you that the
 * name-level join really produces 419 pairs instead of 27,156. That proof is
 * `scripts/dedup-checks.sql` PART 8, against the real 46,054-row database, and the SQL text
 * below is a MIRROR of it. Changing a statement here without changing Part 8 makes that
 * measurement a lie while every test in this file stays green.
 *
 * IT ALSO CANNOT PROVE `least`/`greatest` ORDER A PAIR CORRECTLY — that is Postgres'
 * behaviour, not this module's. What it proves is the half that can silently rot: that the
 * writer USES them, on the right columns, in the right order, rather than dropping the
 * group's canonical id straight into `record_a_id`. Part 8 asserts the written rows really
 * satisfy `record_a_id < record_b_id`.
 * ----------------------------------------------------------------------------------------- */

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}))

vi.mock("./scan-state", () => ({
  updateScanState: vi.fn(async () => {}),
  isScanCancelled: vi.fn(async () => false),
}))

vi.mock("./identity-settings", () => ({
  readOrgIdentityFields: vi.fn(async () => null),
  readSimilarityThreshold: vi.fn(async () => 0.85),
}))

import { db } from "@/db"

import {
  MIN_PERSON_NAME_LENGTH,
  MIN_PERSON_NAME_TOKENS,
  SCAN_MIN_NAME_LENGTH,
  SENTINEL_EMAILS,
  SENTINEL_NORM_NAMES,
} from "./constants"
import { readOrgIdentityFields, readSimilarityThreshold } from "./identity-settings"
import { runDuplicateScan } from "./scan-engine"
import { isScanCancelled, updateScanState } from "./scan-state"

const mockDb = db as unknown as { transaction: ReturnType<typeof vi.fn> }
const mockUpdateScanState = vi.mocked(updateScanState)
const mockIsScanCancelled = vi.mocked(isScanCancelled)
const mockReadOrgIdentityFields = vi.mocked(readOrgIdentityFields)
const mockReadSimilarityThreshold = vi.mocked(readSimilarityThreshold)

// ---------------------------------------------------------------------------------------
// Rendering a drizzle `SQL` tree back into text and bound parameters.
//
// `JSON.stringify` is unusable here for the reason scan-cleanup.test.ts records: a Column
// back-references its table and the structure is circular. So the tree is walked.
//
// THE CHUNK MODEL, BECAUSE GETTING IT WRONG MAKES THIS FILE PROVE THE OPPOSITE OF WHAT IT
// CLAIMS. `sql` pushes each interpolated value into `queryChunks` RAW — it does not wrap it
// in a `Param` until the dialect builds the query. So a bare `${field}` arrives here as the
// JavaScript string itself. A walker that renders an unrecognised chunk as text therefore
// splices every bound value into the "SQL text" and then happily asserts that the SQL
// contains no concatenated values, which is exactly backwards.
//
// The rule below is: only a `StringChunk` (a `value` array with no `encoder`) and a nested
// `SQL` are TEXT. Everything else is a BOUND PARAMETER — an explicit `Param` from
// `sql.param([...])`, or a raw interpolated primitive.
// ---------------------------------------------------------------------------------------

function isSqlNode(node: unknown): node is Record<string, unknown> {
  return node !== null && typeof node === "object" && Array.isArray((node as { queryChunks?: unknown }).queryChunks)
}

function isStringChunk(node: unknown): node is { value: string[] } {
  return (
    node !== null &&
    typeof node === "object" &&
    !("encoder" in node) &&
    Array.isArray((node as { value?: unknown }).value) &&
    (node as { value: unknown[] }).value.every((part) => typeof part === "string")
  )
}

function renderSql(node: unknown): string {
  if (isSqlNode(node)) return (node.queryChunks as unknown[]).map(renderSql).join("")
  if (isStringChunk(node)) return node.value.join("")
  return "$?"
}

function collectParams(node: unknown, acc: unknown[] = []): unknown[] {
  if (isSqlNode(node)) {
    for (const chunk of node.queryChunks as unknown[]) collectParams(chunk, acc)
    return acc
  }
  if (isStringChunk(node)) return acc
  if (node !== null && typeof node === "object" && "encoder" in node) {
    acc.push((node as unknown as { value: unknown }).value)
    return acc
  }
  acc.push(node)
  return acc
}

/** Whitespace-collapsed so an assertion reads the SQL, not the indentation. */
function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * The identity of a statement, derived from the SQL ITSELF rather than from a label the
 * module hands the test. A module that renamed its own labels could not break this.
 *
 * The tier/reason literals are what discriminate the four upserts, which is one reason they
 * are written as SQL literals rather than bound: they are members of a closed union fixed at
 * compile time, and they make both this classifier and Part 8 able to name a statement.
 */
function classify(sqlText: string): string {
  const text = flatten(sqlText)
  if (/^CREATE TEMP TABLE scan_groups/i.test(text)) return "create-group-table"
  if (/^CREATE INDEX/i.test(text)) return "index-group-table"
  if (/^ANALYZE/i.test(text)) return "analyze-group-table"
  if (/set_config\(/.test(text)) return "set-similarity-threshold"
  if (/INSERT INTO duplicate_pairs/i.test(text)) {
    if (/'certain', 'nameIdentity'/.test(text)) return "upsert-certain-nameIdentity"
    if (/'certain', 'email'/.test(text)) return "upsert-certain-email"
    if (/'likely', 'similarNamePhone'/.test(text)) return "upsert-likely-similarNamePhone"
    if (/'likely', 'similarName'/.test(text)) return "upsert-likely-similarName"
    return "upsert-unclassified"
  }
  if (/count\(\*\)/.test(text)) {
    if (/FROM duplicate_pairs/i.test(text)) return "count-pairs"
    if (/FROM scan_groups/i.test(text)) return "count-groups"
    return "count-rows"
  }
  return "unclassified"
}

interface RecordedSql {
  kind: "sql"
  label: string
  text: string
  params: unknown[]
}

interface RecordedProgress {
  kind: "progress"
  label: string
  updates: Record<string, unknown>
}

type Recorded = RecordedSql | RecordedProgress

interface SetupOptions {
  /** What the scanned-row count query resolves with. */
  rowCount?: number
  /** Rows in the name dictionary that sit in a multi-member group. */
  groupedRows?: number
  /** What the pre-commit sanity check sees. Default is deliberately below `rowCount`. */
  pairCount?: number
  /** The configured organization identity field labels, or `null` for unconfigured. */
  identityFields?: string[] | null
  similarityThreshold?: number
  cancelled?: boolean
  /** Thrown by `db.transaction` itself, to exercise the outer failure posture. */
  transactionError?: unknown
}

interface Harness {
  sequence: Recorded[]
  labels: () => string[]
  statements: () => RecordedSql[]
  byLabel: (label: string) => RecordedSql | undefined
  allText: () => string
  rolledBack: () => boolean
  committed: () => boolean
}

function setup(options: SetupOptions = {}): Harness {
  const {
    rowCount = 46054,
    groupedRows = 32000,
    pairCount = 24970,
    identityFields = null,
    similarityThreshold = 0.85,
    cancelled = false,
    transactionError,
  } = options

  const sequence: Recorded[] = []
  let rolledBack = false
  let committed = false

  const execute = vi.fn(async (statement: unknown) => {
    const text = renderSql(statement)
    const label = classify(text)
    sequence.push({ kind: "sql", label, text, params: collectParams(statement) })

    if (label === "count-rows") return [{ n: rowCount }] as unknown
    if (label === "count-groups") return [{ groups: 21503, grouped_rows: groupedRows }] as unknown
    if (label === "count-pairs") return [{ n: pairCount }] as unknown
    return [] as unknown
  })

  const tx = { execute }

  mockDb.transaction.mockImplementation(async (callback: (handle: typeof tx) => Promise<unknown>) => {
    if (transactionError !== undefined) throw transactionError
    try {
      const result = await callback(tx)
      committed = true
      return result
    } catch (error) {
      rolledBack = true
      throw error
    }
  })

  mockUpdateScanState.mockImplementation(async (_scanId: string, updates) => {
    sequence.push({
      kind: "progress",
      label: "progress",
      updates: updates as unknown as Record<string, unknown>,
    })
  })

  mockIsScanCancelled.mockResolvedValue(cancelled)
  mockReadOrgIdentityFields.mockResolvedValue(identityFields)
  mockReadSimilarityThreshold.mockResolvedValue(similarityThreshold)

  const statements = () => sequence.filter((entry): entry is RecordedSql => entry.kind === "sql")

  return {
    sequence,
    labels: () => sequence.map((entry) => entry.label),
    statements,
    byLabel: (label: string) => statements().find((entry) => entry.label === label),
    allText: () =>
      statements()
        .map((entry) => flatten(entry.text))
        .join("\n"),
    rolledBack: () => rolledBack,
    committed: () => committed,
  }
}

const SCAN_ID = "scan-1"

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.transaction.mockReset()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("runDuplicateScan — the statement family and its order", () => {
  it("opens exactly one transaction and issues the statement family in order", async () => {
    // The organization certain tier only exists when an identity field is configured, so it is
    // configured here — this is the only test that sees the whole family at once.
    const harness = setup({ identityFields: ["CNPJ / CPF"] })

    await runDuplicateScan(SCAN_ID, "organization")

    expect(mockDb.transaction).toHaveBeenCalledTimes(1)

    const labels = harness.labels()
    const at = (label: string) => labels.indexOf(label)

    // ORDER, not merely presence. Each of these five must exist AND be in this sequence.
    expect(at("create-group-table")).toBeGreaterThanOrEqual(0)
    expect(at("set-similarity-threshold")).toBeGreaterThan(at("create-group-table"))
    expect(at("upsert-certain-nameIdentity")).toBeGreaterThan(at("set-similarity-threshold"))
    expect(at("upsert-likely-similarName")).toBeGreaterThan(at("upsert-certain-nameIdentity"))
    // The last recorded event is a progress write, after the fuzzy tier has landed.
    expect(labels.lastIndexOf("progress")).toBeGreaterThan(at("upsert-likely-similarName"))

    // The trigram index over the deduplicated name dictionary IS the blocking mechanism, so the
    // index and the ANALYZE that makes the planner willing to use it are part of the family.
    expect(at("index-group-table")).toBeGreaterThan(at("create-group-table"))
    expect(at("analyze-group-table")).toBeGreaterThan(at("index-group-table"))
    expect(harness.byLabel("index-group-table")?.text).toContain("gin_trgm_ops")
  })

  it("sets the trigram threshold LOCALLY and never with a bare SET", async () => {
    // T-39-26. postgres.js pools connections, so a plain `SET pg_trgm.similarity_threshold`
    // leaks the floor onto whatever query runs next on that connection. Both directions are
    // asserted: the transaction-local form is present AND the bare form appears nowhere.
    const harness = setup({ identityFields: ["CNPJ / CPF"], similarityThreshold: 0.9 })

    await runDuplicateScan(SCAN_ID, "organization")

    const setter = harness.byLabel("set-similarity-threshold")
    expect(setter).toBeDefined()
    // `set_config(name, value, is_local => true)` IS `SET LOCAL`, and it is the only form that
    // takes a bound parameter — GUC assignment syntax accepts a literal only.
    expect(flatten(setter!.text)).toContain("set_config('pg_trgm.similarity_threshold', $?, true)")
    expect(setter!.params).toContain("0.9")

    // The bare form, in any casing, anywhere in the issued SQL.
    expect(harness.allText()).not.toMatch(/\bSET\s+pg_trgm/i)
    // And no `SET LOCAL pg_trgm` text form either: it cannot bind, so its presence would mean
    // a value was concatenated into SQL.
    expect(harness.allText()).not.toMatch(/\bSET\s+LOCAL\s+pg_trgm/i)

    // Correctness does not depend on the GUC at all — the filter is expressed twice, and the
    // second expression is a bound parameter on an explicit `similarity()` call.
    const fuzzy = harness.byLabel("upsert-likely-similarName")
    expect(flatten(fuzzy!.text)).toContain("similarity(a.norm_name, b.norm_name) >= $?")
    expect(fuzzy!.params).toContain(0.9)
  })

  it("upserts on duplicate_pairs_uniq with a DO UPDATE guarded against a dismissal", async () => {
    // THE DISMISSAL-SURVIVES-A-RESCAN MECHANISM, and the only thing that implements it.
    // Every writer must carry it, so this asserts across ALL upserts rather than one.
    const harness = setup({ identityFields: ["CNPJ / CPF"] })

    await runDuplicateScan(SCAN_ID, "organization")

    const upserts = harness.statements().filter((entry) => entry.label.startsWith("upsert-"))
    expect(upserts.length).toBeGreaterThanOrEqual(2)

    for (const upsert of upserts) {
      const text = flatten(upsert.text)
      expect(text).toContain("ON CONFLICT (entity_type, record_a_id, record_b_id) DO UPDATE")
      expect(text).toContain("WHERE duplicate_pairs.status <> 'dismissed'")
      // The DO UPDATE never writes `status`, so a `merged` or `superseded` pair is not reopened
      // either — the guard is about `dismissed`, the omission is about the other two.
      expect(text).not.toMatch(/SET[^)]*\bstatus\s*=/i)
    }
  })

  it("canonicalizes record ids with least/greatest in every tier", async () => {
    // `duplicate_pairs_uniq` is on (entity_type, record_a_id, record_b_id) and NOTHING enforces
    // the ordering convention it depends on. Dropping the group's canonical id straight into
    // record_a_id would make (A,B) and (B,A) two different keys and bypass every dismissal.
    const harness = setup({ identityFields: ["CNPJ / CPF"] })

    await runDuplicateScan(SCAN_ID, "organization")
    await runDuplicateScan(SCAN_ID, "person")

    const upserts = harness.statements().filter((entry) => entry.label.startsWith("upsert-"))
    expect(upserts.length).toBeGreaterThanOrEqual(4)

    for (const upsert of upserts) {
      const text = flatten(upsert.text)
      const least = text.indexOf("least(")
      const greatest = text.indexOf("greatest(")
      expect(least).toBeGreaterThanOrEqual(0)
      expect(greatest).toBeGreaterThan(least)
      // The two ids are the SAME two expressions in both positions, so neither side can be a
      // bare canonical id: `least(x, y)` then `greatest(x, y)`.
      const leastArgs = text.slice(least + "least(".length, text.indexOf(")", least))
      const greatestArgs = text.slice(greatest + "greatest(".length, text.indexOf(")", greatest))
      expect(leastArgs).toBe(greatestArgs)
      expect(leastArgs).toContain(",")
    }
  })

  it("polls the cancel flag between the tiers and skips the fuzzy tier when cancelled", async () => {
    const harness = setup({ identityFields: ["CNPJ / CPF"], cancelled: true })

    await runDuplicateScan(SCAN_ID, "organization")

    expect(mockIsScanCancelled).toHaveBeenCalledWith(SCAN_ID)

    const labels = harness.labels()
    // The certain tier DID run — which is what makes the poll "between the tiers" rather than
    // "before the scan".
    expect(labels).toContain("upsert-certain-nameIdentity")
    // And the second tier never was issued. Asserting the ABSENCE of the statement, not just a
    // status: a scan that ran the expensive join and then reported cancelled is not cancelled.
    expect(labels).not.toContain("upsert-likely-similarName")

    const statuses = harness.sequence
      .filter((entry): entry is RecordedProgress => entry.kind === "progress")
      .map((entry) => entry.updates.status)
    expect(statuses).toContain("cancelled")
    expect(statuses).not.toContain("completed")
  })

  it("writes progress at least twice with a monotonically non-decreasing current", async () => {
    const harness = setup({ identityFields: ["CNPJ / CPF"], rowCount: 46054, groupedRows: 32000 })

    await runDuplicateScan(SCAN_ID, "organization")

    const progress = harness.sequence.filter(
      (entry): entry is RecordedProgress => entry.kind === "progress"
    )
    const withCurrent = progress.filter((entry) => typeof entry.updates.current === "number")
    expect(withCurrent.length).toBeGreaterThanOrEqual(2)

    let previous = -1
    for (const entry of withCurrent) {
      const current = entry.updates.current as number
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
      // `total` is the scanned row count, so UI-SPEC P-1's "{current} of {total} records
      // compared" is a real ratio rather than a fabricated percentage.
      expect(entry.updates.total).toBe(46054)
    }

    // The scan finishes at the row count, so the bar reaches 100 rather than stalling at 97.
    expect(previous).toBe(46054)
  })

  it("sets status error and does not rethrow when the transaction rejects", async () => {
    // The caller is a fire-and-forget server action. An unhandled rejection there has no owner.
    const harness = setup({ transactionError: new Error("deadlock detected") })

    await expect(runDuplicateScan(SCAN_ID, "organization")).resolves.toBeUndefined()

    const statuses = harness.sequence
      .filter((entry): entry is RecordedProgress => entry.kind === "progress")
      .map((entry) => entry.updates.status)
    expect(statuses).toContain("error")
  })

  it("rolls back rather than committing when the pair count exceeds the row count", async () => {
    // PITFALL 3's IN-CODE DETECTOR. A clique join sneaking into either tier turns 24,551 pairs
    // into 1,030,436, and the cheapest possible statement of "that happened" is that the scan
    // wrote more pairs than the entity has records.
    const harness = setup({ identityFields: ["CNPJ / CPF"], rowCount: 100, pairCount: 5000 })

    await expect(runDuplicateScan(SCAN_ID, "organization")).resolves.toBeUndefined()

    expect(harness.byLabel("count-pairs")).toBeDefined()
    // The throw happened INSIDE the transaction, so Postgres discarded every pair it wrote.
    expect(harness.rolledBack()).toBe(true)
    expect(harness.committed()).toBe(false)

    const statuses = harness.sequence
      .filter((entry): entry is RecordedProgress => entry.kind === "progress")
      .map((entry) => entry.updates.status)
    expect(statuses).toContain("error")
    expect(statuses).not.toContain("completed")

    const logged = vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join("\n")
    expect(logged).toContain("[dedup-scan]")
  })

  it("scans people off the person normalization columns and filters junk e-mail", async () => {
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "person")

    const groupTable = flatten(harness.byLabel("create-group-table")!.text)
    expect(groupTable).toContain("FROM people")
    expect(groupTable).toContain("norm_name")

    // The two person certain/likely exact tiers.
    const email = harness.byLabel("upsert-certain-email")
    expect(email).toBeDefined()
    const emailText = flatten(email!.text)
    expect(emailText).toContain("norm_email")
    // THE E-MAIL FORMAT PREDICATE, which took 28,032 pairs to 5,338. Its absence is the single
    // most expensive omission available in the person tier: 212 people share the literal `#`.
    expect(emailText).toMatch(/norm_email ~ \$\?/)
    expect(email!.params).toContain("^[^@[:space:]]+@[^@[:space:]]+\\.[a-zA-Z]{2,}$")
    // And the two measured placeholder addresses that survive the syntax test.
    expect(email!.params).toEqual(
      expect.arrayContaining([expect.arrayContaining([...SENTINEL_EMAILS])])
    )

    const phone = harness.byLabel("upsert-likely-similarNamePhone")
    expect(phone).toBeDefined()
    const phoneText = flatten(phone!.text)
    expect(phoneText).toContain("norm_phone")
    // Two absent phones are not an agreement (scoring.ts, classifyPersonMatch).
    expect(phoneText).toContain("norm_phone <> ''")

    // The organization identity tier has no business in a person scan.
    expect(harness.labels()).not.toContain("upsert-certain-nameIdentity")
  })
})

describe("runDuplicateScan — the tier rules are scoring.ts's rules", () => {
  it("skips the organization certain tier entirely when no identity field is configured", async () => {
    // 39-RESEARCH measured `website` NULL on all 46,054 organizations, which killed the locked
    // "name + website domain" rule. The tempting repair — call an equal normalized name
    // "certain" on its own — was measured at 1,030,436 pairs, because 70.7% of organizations
    // share a normalized name. `null` therefore means NO certain tier, never a name-only one.
    const harness = setup({ identityFields: null })

    await runDuplicateScan(SCAN_ID, "organization")

    expect(harness.labels()).not.toContain("upsert-certain-nameIdentity")
    // The fuzzy tier still runs: an unconfigured install degrades to *likely* only.
    expect(harness.labels()).toContain("upsert-likely-similarName")
  })

  it("emits similarNamePhone at the LIKELY tier, matching classifyPersonMatch", async () => {
    // scoring.ts is the single place the tier rule lives and it returns
    // { tier: "likely", reason: "similarNamePhone" }. A `certain` here would put a pre-checked
    // merge in front of an admin on the strength of a shared name and a shared phone number,
    // which is the expensive wrong answer in this phase.
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "person")

    const phone = harness.byLabel("upsert-likely-similarNamePhone")
    expect(phone).toBeDefined()
    expect(flatten(phone!.text)).toContain("'likely', 'similarNamePhone'")
    expect(flatten(phone!.text)).not.toContain("'certain', 'similarNamePhone'")
  })

  it("refuses to downgrade an existing certain pair to likely on a rescan", async () => {
    // Two people can share an e-mail AND a name AND a phone, so the certain e-mail tier and the
    // likely name+phone tier can land on the same canonical pair. Without this conjunct the
    // later statement's DO UPDATE would rewrite `certain` as `likely`.
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "person")

    for (const upsert of harness.statements().filter((entry) => entry.label.startsWith("upsert-"))) {
      expect(flatten(upsert.text)).toContain(
        "AND NOT (duplicate_pairs.tier = 'certain' AND excluded.tier <> 'certain')"
      )
    }
  })

  it("mirrors isComparableOrgName's TOKEN test, not a total-length test", async () => {
    // `isComparableOrgName` requires at least one token of SCAN_MIN_NAME_LENGTH characters, and
    // its own docstring records why a total-length test is wrong: it passes `a b c` and rebuilds
    // the one-letter clique the guard exists to prevent. Measured: 9 of 46,054 organizations.
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "organization")

    const groupTable = harness.byLabel("create-group-table")!
    const text = flatten(groupTable.text)
    expect(text).toContain("FROM organizations")
    expect(text).toContain("norm_name <> ''")
    expect(text).toContain("unnest(string_to_array(norm_name, ' '))")
    expect(groupTable.params).toContain(SCAN_MIN_NAME_LENGTH)
  })

  it("mirrors isComparablePersonName's three conjuncts", async () => {
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "person")

    const groupTable = harness.byLabel("create-group-table")!
    const text = flatten(groupTable.text)
    expect(text).toContain("length(norm_name) >= $?")
    expect(text).toContain("array_length(array_remove(string_to_array(norm_name, ' '), ''), 1)")
    expect(groupTable.params).toContain(MIN_PERSON_NAME_LENGTH)
    expect(groupTable.params).toContain(MIN_PERSON_NAME_TOKENS)
    // The 559 occurrences of the import placeholder `nao encotrado`.
    expect(groupTable.params).toEqual(
      expect.arrayContaining([expect.arrayContaining([...SENTINEL_NORM_NAMES])])
    )
  })

  it("joins scan_groups to itself on the name level, never the entity table", async () => {
    // THE 65x COLLAPSE, and it is not a precision change. Measured: the identical trigram join
    // over ROWS yields 27,156 pairs in 67.1 s; over the 21,503 DISTINCT normalized names it
    // yields 419 pairs in 18.2 s. A 216-member group joined against an N-member group emits
    // 216xN identical-looking pairs at the row level and exactly ONE at the name level.
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "organization")

    const fuzzy = flatten(harness.byLabel("upsert-likely-similarName")!.text)
    expect(fuzzy).toContain("FROM scan_groups a JOIN scan_groups b")
    expect(fuzzy).not.toContain("organizations")
    // `b.norm_name > a.norm_name` is what makes each unordered name pair appear once.
    expect(fuzzy).toContain("b.norm_name > a.norm_name")
    expect(fuzzy).toContain("b.norm_name % a.norm_name")
  })

  it("binds every dynamic value and never concatenates one into SQL text", async () => {
    // T-39-06. A record name never enters SQL text; the only literals in these statements are
    // members of closed compile-time unions (the tiers, the reasons, the column names).
    const harness = setup({ identityFields: ["CNPJ / CPF", "E-mail de Contato 1"] })

    await runDuplicateScan(SCAN_ID, "organization")

    const all = harness.allText()
    expect(all).not.toContain("CNPJ")
    expect(all).not.toContain("E-mail de Contato")
    expect(all).not.toContain(SCAN_ID)

    const identity = harness.byLabel("upsert-certain-nameIdentity")!
    expect(identity.params).toContain("CNPJ / CPF")
    expect(identity.params).toContain("E-mail de Contato 1")
    expect(identity.params).toContain(SCAN_ID)
    // `readIdentityValue`'s parity: a JSONB number is NOT an identity value, so the extraction
    // is guarded on jsonb_typeof rather than using `->>` unconditionally.
    expect(flatten(identity.text)).toContain("jsonb_typeof")
    expect(flatten(identity.text)).toContain("lower(btrim(")
  })

  it("drops the temp dictionary at commit so a pooled connection cannot carry it forward", async () => {
    const harness = setup()

    await runDuplicateScan(SCAN_ID, "organization")

    // Without ON COMMIT DROP the table survives the transaction, and the next scan to land on
    // the same pooled connection fails with "relation scan_groups already exists".
    expect(flatten(harness.byLabel("create-group-table")!.text)).toContain(
      "CREATE TEMP TABLE scan_groups ON COMMIT DROP AS"
    )
  })

  it("reads the threshold and the identity fields outside the transaction", async () => {
    const harness = setup({ identityFields: ["CNPJ / CPF"] })

    await runDuplicateScan(SCAN_ID, "organization")

    expect(mockReadSimilarityThreshold).toHaveBeenCalledTimes(1)
    expect(mockReadOrgIdentityFields).toHaveBeenCalledTimes(1)
    // One transaction, and the settings reads are not statements inside it.
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(harness.statements().map((entry) => entry.label)).not.toContain("unclassified")
  })
})
