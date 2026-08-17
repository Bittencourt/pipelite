/**
 * THE CROSS-SURFACE SELECT-WIRING GATE.
 *
 * (a) EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. Phase 37 lost nine gate runs to a
 *     raw-text grep colliding with an explanatory comment — once with the plan's own suggested
 *     wording — and Phase 38 has now added five more, for fourteen across the two phases. The
 *     correct response to a collision is to REWORD THE PROSE, never to weaken the gate. So every
 *     read below goes through the shared string-aware `readStrippedSource`; nothing in this file
 *     reads a source file with comments intact except the one test that exists to prove the
 *     stripping actually ran.
 *
 * (b) THIS GATE LIVES HERE RATHER THAN IN ANY SURFACE PLAN because it asserts rules ACROSS four
 *     surfaces that all landed in a single wave. An index-keyed row id on one of three tables, a
 *     selection cleared off a server-supplied array on one surface, a missing propagation stop on
 *     the deal card, a bar mounted above the Load More button — each of those is invisible in its
 *     own file's diff and each ships green under the per-surface suites. No plan that owned only
 *     one of the four files could have asserted any of them without going red until the other
 *     three merged.
 *
 * (c) THE COLOUR ASSERTIONS DELIBERATELY EXCLUDE `src/app/activities/activity-list.tsx`. Its
 *     overdue banner carries pre-existing non-token colours in a block this phase never touched.
 *     A blanket scan over that file would go red on day one, and a gate that is red on day one
 *     gets deleted rather than fixed — strictly worse than a scoped gate that stays enabled. The
 *     exclusion is asserted and named below rather than left silent, and it is pinned to the debt
 *     that justifies it, so cleaning the banner up turns this gate red and forces the exclusion to
 *     be removed with it.
 */
import { readdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  callArguments,
  readStrippedSource,
  stripComments,
} from "@/components/custom-fields/__tests__/source-scan"

const REPO_ROOT = process.cwd()

const ORG_TABLE_PATH = "src/app/organizations/data-table.tsx"
const PEOPLE_TABLE_PATH = "src/app/people/data-table.tsx"
const ACTIVITY_LIST_PATH = "src/app/activities/activity-list.tsx"
const ACTIVITIES_CLIENT_PATH = "src/app/activities/activities-client.tsx"
const DEAL_CARD_PATH = "src/app/deals/deal-card.tsx"
const KANBAN_COLUMN_PATH = "src/app/deals/kanban-column.tsx"
const KANBAN_BOARD_PATH = "src/app/deals/kanban-board.tsx"

/** The two static column modules this phase is required NOT to have touched. */
const ORG_COLUMNS_PATH = "src/app/organizations/columns.tsx"
const PEOPLE_COLUMNS_PATH = "src/app/people/columns.tsx"

const ORG_TABLE = readStrippedSource(ORG_TABLE_PATH)
const PEOPLE_TABLE = readStrippedSource(PEOPLE_TABLE_PATH)
const ACTIVITY_LIST = readStrippedSource(ACTIVITY_LIST_PATH)
const ACTIVITIES_CLIENT = readStrippedSource(ACTIVITIES_CLIENT_PATH)
const DEAL_CARD = readStrippedSource(DEAL_CARD_PATH)
const KANBAN_COLUMN = readStrippedSource(KANBAN_COLUMN_PATH)
const KANBAN_BOARD = readStrippedSource(KANBAN_BOARD_PATH)

const ORG_COLUMNS = readStrippedSource(ORG_COLUMNS_PATH)
const PEOPLE_COLUMNS = readStrippedSource(PEOPLE_COLUMNS_PATH)

/** The seven surface modules, in the order the phase wired them. */
const SURFACES: { path: string; source: string }[] = [
  { path: ORG_TABLE_PATH, source: ORG_TABLE },
  { path: PEOPLE_TABLE_PATH, source: PEOPLE_TABLE },
  { path: ACTIVITY_LIST_PATH, source: ACTIVITY_LIST },
  { path: ACTIVITIES_CLIENT_PATH, source: ACTIVITIES_CLIENT },
  { path: DEAL_CARD_PATH, source: DEAL_CARD },
  { path: KANBAN_COLUMN_PATH, source: KANBAN_COLUMN },
  { path: KANBAN_BOARD_PATH, source: KANBAN_BOARD },
]

/** The three list tables, which share one wiring contract between them. */
const TABLES: { path: string; source: string }[] = [
  { path: ORG_TABLE_PATH, source: ORG_TABLE },
  { path: PEOPLE_TABLE_PATH, source: PEOPLE_TABLE },
  { path: ACTIVITY_LIST_PATH, source: ACTIVITY_LIST },
]

// ---------------------------------------------------------------------------------------------
// VOCABULARY TABLE 1 — WHAT THE DETECTOR RECOGNISES.
//
// Every entry is a token whose PRESENCE on any of the seven surfaces would mean either a phase
// hazard regressed or one of the six ideas 38-CONTEXT deferred was shipped anyway. The table is
// explicit and iterated so the list cannot quietly shrink, and so a reader can see exactly what
// this gate claims to catch.
// ---------------------------------------------------------------------------------------------
const RECOGNISED: { token: string; why: string }[] = [
  {
    token: "getSelectedRowModel",
    why: "the table's own selected-row model is never pruned when a row leaves the data array, so a model-derived id list can carry phantom keys into a destructive submit (T-38-37); each surface must intersect its truthy selection keys with the ids it actually loaded",
  },
  {
    token: "getPaginationRowModel",
    why: 'client-side pagination would hide rows from a select-all that claims to cover "the loaded page", and it is also the shape a filter-wide "select all N matching" would arrive in — a deferred idea (38-CONTEXT)',
  },
  {
    token: "selectAllMatching",
    why: 'deferred idea: filter-wide "select all N matching records" beyond the loaded page. Every select-all in this phase is page-scoped and capped',
  },
  {
    token: "selectAllFiltered",
    why: "deferred idea: the same filter-wide select-all under its other plausible name",
  },
  {
    token: "bulkStage",
    why: "deferred idea: bulk stage moves on the kanban. The board's only stage write remains the single-deal drag",
  },
  {
    token: "moveToStage",
    why: "deferred idea: a bulk move-to-stage control. The drag path persists through reorderDeals for one deal at a time",
  },
  {
    token: "bulkEditField",
    why: "deferred idea: bulk edit of arbitrary fields, including custom fields. This phase ships delete, reassign and export only",
  },
  {
    token: "bulkUpdateFields",
    why: "deferred idea: bulk edit of arbitrary fields under its other plausible name",
  },
  {
    token: "bulkReassignActivityAssignee",
    why: "deferred idea: bulk reassignment of an Activity assignee alongside the owner. The Activities bulk path writes ownerId only",
  },
  {
    token: "reassignDigest",
    why: "deferred idea: a digest email notifying a new owner of a bulk reassignment. No bulk path sends mail",
  },
  {
    token: "colSpan={columns.length}",
    why: "the columns prop no longer counts the prepended checkbox column, so a prop-derived span leaves the empty state one cell short of the header",
  },
]

// ---------------------------------------------------------------------------------------------
// VOCABULARY TABLE 2 — WHAT THE DETECTOR MUST LEAVE ALONE.
//
// A gate for the gate. Each of these tokens looks superficially like something the table above
// forbids, and every one of them is legitimate and currently live. Asserting they are PRESENT is
// what proves the recognised table is precise rather than a broad sweep that happens to be green:
// if a future tightening of this file starts flagging any of them, this test fails first and names
// the token, instead of the tightening landing as a false positive somebody disables the gate over.
// ---------------------------------------------------------------------------------------------
const LEFT_ALONE: { token: string; where: string; source: string; why: string }[] = [
  {
    token: "getFilteredRowModel",
    where: ACTIVITY_LIST_PATH,
    source: ACTIVITY_LIST,
    why: "pre-existing and INERT — no column or global filter state is ever set on this table and every Activities filter is applied server-side through URL params, so the filtered row model equals the core row model. Removing it would be an unrelated change; it is not pagination and it hides no row from the select-all",
  },
  {
    token: "assigneeId",
    where: ACTIVITY_LIST_PATH,
    source: ACTIVITY_LIST,
    why: "a pre-existing SINGLE-RECORD field on the Activity shape, not a bulk path. The deferred idea is bulk reassignment of it, which is gated by name in the recognised table and by the scoped assertion below",
  },
  {
    token: "assigneeIds",
    where: KANBAN_BOARD_PATH,
    source: KANBAN_BOARD,
    why: "the single-deal edit dialog's prop, unrelated to bulk. A blanket assignee ban would flag it",
  },
  {
    token: "reorderDeals",
    where: KANBAN_BOARD_PATH,
    source: KANBAN_BOARD,
    why: "the pre-existing single-deal drag persistence. It writes one stage for one deal, which is exactly what the deferred bulk stage move is not",
  },
  {
    token: "getRowId",
    where: ORG_TABLE_PATH,
    source: ORG_TABLE,
    why: "required, not forbidden — the whole point of assertion A below is that this option is present and resolves to the record id",
  },
  {
    token: "bg-red-50",
    where: ACTIVITY_LIST_PATH,
    source: ACTIVITY_LIST,
    why: "the pre-existing overdue banner, in a block this phase never touched. It is why activity-list.tsx is excluded from the colour scan, and the exclusion is named in its own test rather than applied silently",
  },
]

/** Every colour the UI contract forbids on the surfaces this phase authored, plus any raw hex. */
const FORBIDDEN_COLOURS = [
  "text-red-",
  "text-green-",
  "bg-red-",
  "bg-green-",
  "bg-white",
  "text-black",
]
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}/

/** A button that does not name its object, per the copy contract. */
const BARE_LABELS = [">Save<", ">Cancel<", ">Confirm<", ">OK<", ">Yes<", ">Apply<"]

/**
 * `getRowId` whose single parameter is returned as that parameter's own `id`.
 *
 * The back-reference is doing real work: it rejects `(_row, index) => String(index)` — the exact
 * index-keyed shape T-38-36 is about — because a two-parameter arrow cannot satisfy it, and it
 * rejects `(row) => row.position` too.
 */
const RECORD_ID_ROW_ID = /getRowId:\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*\1\.id\b/

/**
 * Index of the matching close delimiter starting one character INSIDE an already-open pair, or -1.
 *
 * String-aware, so a brace or paren inside a template literal or a className string cannot close
 * the pair early. WR-13 discipline: every caller checks for -1 with a named message before using
 * the result as a slice bound — a helper that silently widens to the enclosing block stops
 * detecting without saying so.
 */
function closingIndex(source: string, from: number, open: string, close: string): number {
  let depth = 1
  let quote: string | null = null
  let i = from

  while (i < source.length) {
    const ch = source[i]

    if (quote) {
      if (ch === "\\") {
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch
      i += 1
      continue
    }

    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return i
    }

    i += 1
  }

  return -1
}

interface IfStatement {
  condition: string
  body: string
}

/**
 * Every `if (...)` in a comment-stripped source, paired with its block.
 *
 * This is what makes assertion C real on the three surfaces that have NO effect at all. Plans
 * 38-15 through 38-17 implemented clear-on-filter as React's documented
 * adjust-state-when-a-prop-changes pattern, because `react-hooks/set-state-in-effect` is an ERROR
 * in this repo — `people/data-table.tsx` now contains zero `useEffect` calls. A gate that only
 * inspected effect dependency arrays would therefore pass those three files by finding nothing,
 * which is a false pass rather than a passing gate. The CONTRACT is what is asserted instead: the
 * server-supplied collection must not appear in whatever position decides the clear, whether that
 * position is a dependency array or a render-time comparison.
 */
function ifStatements(source: string): IfStatement[] {
  const found: IfStatement[] = []
  const opener = /\bif\s*\(/g
  let match: RegExpExecArray | null

  while ((match = opener.exec(source)) !== null) {
    const conditionStart = match.index + match[0].length
    const conditionEnd = closingIndex(source, conditionStart, "(", ")")
    if (conditionEnd === -1) continue

    const condition = source.slice(conditionStart, conditionEnd)

    let cursor = conditionEnd + 1
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1

    let body: string
    if (source[cursor] === "{") {
      const bodyEnd = closingIndex(source, cursor + 1, "{", "}")
      if (bodyEnd === -1) continue
      body = source.slice(cursor + 1, bodyEnd)
    } else {
      const lineEnd = source.indexOf("\n", cursor)
      body = source.slice(cursor, lineEnd === -1 ? source.length : lineEnd)
    }

    found.push({ condition, body })
    opener.lastIndex = conditionEnd + 1
  }

  return found
}

interface EffectCall {
  body: string
  dependencies: string[]
  hasDependencyArray: boolean
}

/** Every `useEffect(...)` in a comment-stripped source, split into its body and its deps. */
function effectCalls(source: string): EffectCall[] {
  return callArguments(source, "useEffect").map((args) => {
    const trimmed = args.trim()
    const deps = /,\s*\[([^[\]]*)\]\s*$/.exec(trimmed)

    if (!deps) {
      return { body: trimmed, dependencies: [], hasDependencyArray: false }
    }

    const arrayAt = trimmed.lastIndexOf("[")

    return {
      body: arrayAt === -1 ? trimmed : trimmed.slice(0, arrayAt),
      dependencies: deps[1]
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
      hasDependencyArray: true,
    }
  })
}

/**
 * The four modules that OWN a selection, with the server-supplied collection each one must never
 * clear off and the identifier that proves its real clear position exists.
 */
const CLEAR_OWNERS: {
  path: string
  source: string
  setter: string
  collections: string[]
  clearKey: string
}[] = [
  {
    path: ORG_TABLE_PATH,
    source: ORG_TABLE,
    setter: "setRowSelection",
    collections: ["data"],
    clearKey: "prevSearch",
  },
  {
    path: PEOPLE_TABLE_PATH,
    source: PEOPLE_TABLE,
    setter: "setRowSelection",
    collections: ["data"],
    clearKey: "prevSearch",
  },
  {
    path: ACTIVITIES_CLIENT_PATH,
    source: ACTIVITIES_CLIENT,
    setter: "setRowSelection",
    collections: ["activities"],
    clearKey: "lastFilterSignature",
  },
  {
    path: KANBAN_BOARD_PATH,
    source: KANBAN_BOARD,
    setter: "setSelectedDealIds",
    collections: ["dealsByStage", "initialDealsByStage"],
    clearKey: "selectedPipelineId",
  },
]

const REVALIDATE_MEASUREMENT =
  "Phase 35 measured against Next 16.1.6 that revalidatePath re-renders the CURRENT client tree a few milliseconds after the action resolves, whichever path it names, and every bulk action calls it. A clear keyed on the server-supplied collection would therefore fire in the middle of a bulk action and wipe the failed-record selection SC-3 requires to SURVIVE the call (T-38-33)"

/** Not a runtime component, and it quotes the very tokens being searched for as literals. */
const isTestFile = (file: string) =>
  /(^|[/\\])__tests__[/\\]/.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)

/** Every non-test module under `src/components/bulk`, resolved repo-relative. */
function walkBulkModules(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkBulkModules(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !isTestFile(full)) {
      out.push(path.relative(REPO_ROOT, full))
    }
  }
  return out
}

const BULK_MODULES = walkBulkModules(path.join(REPO_ROOT, "src", "components", "bulk")).sort()

/**
 * The files the colour and copy contract is enforced over: everything this phase AUTHORED, plus
 * the two `/deals` files it added selection controls to. `activity-list.tsx` is excluded, named,
 * and justified in its own test below.
 */
const COLOUR_SCANNED = [...BULK_MODULES, DEAL_CARD_PATH, KANBAN_COLUMN_PATH]

// =============================================================================================
// ANTI-VACUITY 1 — the files were found and read.
// =============================================================================================

describe("anti-vacuity: every surface module was actually read", () => {
  it("reads seven non-empty surface sources", () => {
    for (const surface of SURFACES) {
      expect(
        surface.source.length,
        `${surface.path} stripped to nothing. A silently empty read passes every negative assertion in this file perfectly, which is a false pass rather than a passing gate`
      ).toBeGreaterThan(500)
    }

    expect(
      SURFACES.length,
      "this gate claims to cover four surfaces across seven modules; a shorter list means one of them stopped being checked"
    ).toBe(7)
  })

  it("reads both static column modules the phase must not have touched", () => {
    for (const [modulePath, source] of [
      [ORG_COLUMNS_PATH, ORG_COLUMNS],
      [PEOPLE_COLUMNS_PATH, PEOPLE_COLUMNS],
    ] as const) {
      expect(
        source.length,
        `${modulePath} stripped to nothing, so the untouched-columns claim below would pass without reading anything`
      ).toBeGreaterThan(500)
    }
  })
})

// =============================================================================================
// ANTI-VACUITY 2 — POSITIVE MARKERS, asserted BEFORE any negative assertion in this file.
// =============================================================================================

describe("anti-vacuity: positive markers prove these are the right files", () => {
  it("finds a TanStack table in each of the three list surfaces", () => {
    for (const table of TABLES) {
      expect(
        table.source,
        `${table.path} no longer builds a TanStack table. Every row-selection assertion below is about that table's options, so this gate must go red and be reconsidered rather than keep passing over a file that no longer has one`
      ).toContain("useReactTable")
    }
  })

  it("finds the sortable deal card and the kanban column header row", () => {
    expect(
      DEAL_CARD,
      "deal-card.tsx no longer calls useSortable, so the propagation-stop assertions below are about sensors that are no longer attached to this node"
    ).toContain("useSortable")

    expect(
      KANBAN_COLUMN,
      "kanban-column.tsx no longer lays its header out as a justify-between row, which is where the per-stage select-all sits — the cap assertions below would then be describing a control somewhere else"
    ).toContain("justify-between")
  })

  it("finds the dnd-kit sensors the deal card's stops exist to defeat", () => {
    expect(
      KANBAN_BOARD,
      "kanban-board.tsx no longer registers useSensors. The deal card's pointer and key stops are justified ENTIRELY by PointerSensor's distance constraint and KeyboardSensor's Space binding living here; without them the assertions are cargo cult"
    ).toContain("useSensors")
  })
})

// =============================================================================================
// ANTI-VACUITY 3 — the stripping is proven to run, not assumed.
// =============================================================================================

describe("anti-vacuity: the comment stripping demonstrably ran", () => {
  it("finds a gated token in raw prose and not in the stripped source", async () => {
    const raw = await readFile(KANBAN_BOARD_PATH, "utf8")

    expect(
      raw,
      "kanban-board.tsx no longer explains why /deals is the phase's one exception to selection-lives-in-rowSelection. That doc comment is this gate's LIVE proof that stripping matters: it names, out loud, the exact token assertion I gates at zero occurrences on this very file, so a raw-text version of that assertion would fail on prose alone"
    ).toContain("useReactTable")

    expect(
      KANBAN_BOARD,
      "the stripped kanban-board source still contains a token only its doc comment carries, which means the comment stripping did not run — and every negative assertion in this file is then reading prose rather than code"
    ).not.toContain("useReactTable")
  })

  it("exercises the stripper directly on a commented-out forbidden token", () => {
    expect(
      stripComments("const x = 1\n// getSelectedRowModel\n"),
      "the shared stripper left a commented-out forbidden token behind; the fourteen comment/grep collisions across Phases 37-38 are exactly this failure"
    ).not.toContain("getSelectedRowModel")

    expect(
      stripComments('const href = "https://example.com/a"\n'),
      "the stripper truncated a URL as a line comment, which would silently swallow the rest of the line and any JSX prop on it"
    ).toContain("https://example.com/a")
  })
})

// =============================================================================================
// THE TWO VOCABULARY TABLES.
// =============================================================================================

describe("vocabulary: tokens the detector recognises", () => {
  it("finds none of them on any of the seven surfaces", () => {
    for (const entry of RECOGNISED) {
      const offenders = SURFACES.filter((surface) => surface.source.includes(entry.token)).map(
        (surface) => surface.path
      )

      expect(
        offenders,
        `"${entry.token}" appears in ${offenders.join(", ")}. ${entry.why}`
      ).toEqual([])
    }

    expect(
      RECOGNISED.length,
      "the recognised table shrank. It pins the six deferred ideas plus the three phase hazards this gate exists for, and an entry removed silently is a rule removed silently"
    ).toBeGreaterThanOrEqual(11)
  })
})

describe("vocabulary: tokens the detector must leave alone", () => {
  it("finds every one of them still present and unflagged", () => {
    for (const entry of LEFT_ALONE) {
      expect(
        entry.source,
        `"${entry.token}" is no longer present in ${entry.where}. ${entry.why}. This table is the gate for the gate: if a tightening of the recognised table above starts flagging one of these, THIS test is what names it instead of the tightening landing as a false positive that gets the whole file disabled`
      ).toContain(entry.token)

      expect(
        RECOGNISED.some((recognised) => recognised.token === entry.token),
        `"${entry.token}" is in both vocabulary tables at once, so the gate simultaneously requires and forbids it`
      ).toBe(false)
    }
  })
})

// =============================================================================================
// A. RECORD-ID KEYING — all three tables at once.
// =============================================================================================

describe("A. every list table keys its selection on the record id", () => {
  const INDEX_HAZARD =
    "TanStack's default row id is the row INDEX, and these rows arrays are CUMULATIVE across Load More — page two re-renders the same array with fifty more entries, and activity-list re-sorts on every render. With index keys any reorder or removal silently retargets the selection onto DIFFERENT records, and the next action would be a bulk delete of records the user never picked (T-38-36)"

  it("declares getRowId, resolving to the row's own id", () => {
    for (const table of TABLES) {
      expect(
        table.source,
        `${table.path} does not declare getRowId at all. ${INDEX_HAZARD}`
      ).toContain("getRowId")

      expect(
        RECORD_ID_ROW_ID.test(table.source),
        `${table.path} declares getRowId but its argument does not resolve to the row's own id. ${INDEX_HAZARD}`
      ).toBe(true)
    }
  })

  it("enables row selection explicitly", () => {
    for (const table of TABLES) {
      expect(
        table.source,
        `${table.path} must set enableRowSelection: true — without it the row checkboxes render but never toggle, and the header select-all is inert`
      ).toContain("enableRowSelection: true")
    }
  })

  it("hands selection changes to a controlled setter", () => {
    for (const table of TABLES) {
      expect(
        table.source,
        `${table.path} must wire onRowSelectionChange; an uncontrolled table keeps its own copy of the selection and the bulk bar would submit a stale one`
      ).toContain("onRowSelectionChange")
    }
  })
})

// =============================================================================================
// B. NO MODEL-DERIVED ID LIST, ANYWHERE.
// =============================================================================================

describe("B. no surface derives its submitted ids from the table's selected-row model", () => {
  it("finds the accessor on none of the seven modules", () => {
    const offenders = SURFACES.filter((surface) =>
      surface.source.includes("getSelectedRowModel")
    ).map((surface) => surface.path)

    expect(
      offenders,
      `${offenders.join(", ")} reads the selected-row model. TanStack does not prune the selection map when a row leaves the data array, so a model-derived list can carry phantom ids — and a phantom id in a destructive submit is an action on a record the user never picked (T-38-37). Every surface must intersect its truthy keys with the ids it actually loaded`
    ).toEqual([])
  })
})

// =============================================================================================
// C. NOTHING CLEARS A SELECTION OFF A SERVER-SUPPLIED COLLECTION.
// =============================================================================================

describe("C. no selection is cleared off a server-supplied collection", () => {
  it("keeps the forbidden collection out of every clearing effect's dependency array", () => {
    for (const owner of CLEAR_OWNERS) {
      const clearing = effectCalls(owner.source).filter((effect) =>
        effect.body.includes(owner.setter)
      )

      for (const effect of clearing) {
        expect(
          effect.hasDependencyArray,
          `${owner.path} has an effect calling ${owner.setter} with no extractable dependency array, so this gate cannot tell what it is keyed on and must not pretend otherwise`
        ).toBe(true)

        for (const collection of owner.collections) {
          expect(
            effect.dependencies,
            `${owner.path} clears its selection from an effect keyed on "${collection}". ${REVALIDATE_MEASUREMENT}`
          ).not.toContain(collection)
        }
      }
    }
  })

  it("keeps the forbidden collection out of every render-time clear guard", () => {
    for (const owner of CLEAR_OWNERS) {
      const guards = ifStatements(owner.source).filter((statement) =>
        statement.body.includes(owner.setter)
      )

      for (const guard of guards) {
        for (const collection of owner.collections) {
          expect(
            new RegExp(`\\b${collection}\\b`).test(guard.condition),
            `${owner.path} clears its selection from a render-time guard whose condition reads "${collection}": ${guard.condition.trim()}. ${REVALIDATE_MEASUREMENT}`
          ).toBe(false)
        }
      }
    }
  })

  it("locates a real clear position and its key on all four owners", () => {
    for (const owner of CLEAR_OWNERS) {
      const clearingEffects = effectCalls(owner.source).filter((effect) =>
        effect.body.includes(owner.setter)
      ).length
      const clearingGuards = ifStatements(owner.source).filter((statement) =>
        statement.body.includes(owner.setter)
      ).length

      expect(
        clearingEffects + clearingGuards,
        `no clear position was found in ${owner.path} at all. Both extractors returning nothing makes the two assertions above vacuous — they would pass over a file that clears the selection somewhere this gate cannot see`
      ).toBeGreaterThanOrEqual(1)

      expect(
        owner.source,
        `${owner.path} must key its clear on "${owner.clearKey}" — URL-derived state that changes only when the user changes a search, a filter or a pipeline, never when the server re-renders the same records. ${REVALIDATE_MEASUREMENT}`
      ).toContain(owner.clearKey)
    }
  })
})

// =============================================================================================
// D. THE EMPTY STATE COUNTS THE RENDERED COLUMNS.
// =============================================================================================

describe("D. the empty-state span is read from the table, not from the prop", () => {
  it("never spans the columns prop", () => {
    for (const table of TABLES) {
      expect(
        table.source.includes("colSpan={columns.length}"),
        `${table.path} spans its empty state with the columns prop, which no longer counts the prepended checkbox column — the visible symptom is an empty state one cell short of the header on a filtered-to-nothing list`
      ).toBe(false)
    }
  })

  it("counts the table's own leaf columns instead", () => {
    for (const table of TABLES) {
      expect(
        table.source,
        `${table.path} must derive its empty-state span from the table's leaf columns so the count stays correct however many columns are composed in`
      ).toContain("getAllLeafColumns")
    }
  })
})

// =============================================================================================
// E. THE SELECT COLUMN IS PREPENDED.
// =============================================================================================

describe("E. the checkbox column is prepended, never appended", () => {
  it("composes the select column first", () => {
    for (const table of TABLES) {
      expect(
        table.source,
        `${table.path} must compose its columns as the select column followed by the existing ones — the checkbox is the first cell of every row on every surface`
      ).toContain("[selectColumn, ...columns]")
    }
  })

  it("never composes it last", () => {
    for (const table of TABLES) {
      expect(
        table.source.includes("...columns, selectColumn"),
        `${table.path} appends the select column. Appended, the checkbox lands after the row actions on three different surfaces and the empty-state span silently starts describing a different column order`
      ).toBe(false)
    }
  })
})

// =============================================================================================
// F. THE DEAL CARD'S THREE PROPAGATION STOPS AND ITS UNCHANGED RING COUNT.
// =============================================================================================

describe("F. the deal card stops all three channels the dnd-kit sensors listen on", () => {
  it("stops the click that would expand the card", () => {
    expect(
      DEAL_CARD,
      "the checkbox wrapper must stop click propagation: the card root toggles isExpanded, so without it ticking a box also expands the card"
    ).toContain("onClick={(e) => e.stopPropagation()}")
  })

  it("stops the pointer gesture PointerSensor would read as a drag", () => {
    expect(
      DEAL_CARD,
      "the checkbox wrapper must stop pointerdown: dnd-kit's listeners are spread on the card root and PointerSensor uses activationConstraint { distance: 5 }, so a 6px pointer wobble on the box drags the deal into another stage — a selection gesture silently becoming a stage move (T-38-40)"
    ).toContain("onPointerDown")
  })

  it("stops the Space key KeyboardSensor would consume", () => {
    expect(
      DEAL_CARD,
      "the checkbox wrapper must stop keydown: the card root carries useSortable's attributes, including the KeyboardSensor binding, so Space on a focused card starts a KEYBOARD DRAG — and Space is also how a keyboard user toggles a checkbox. Without this stop keyboard selection is IMPOSSIBLE, which makes it an accessibility requirement rather than an optimisation (T-38-41)"
    ).toContain("onKeyDown")

    expect(
      (DEAL_CARD.match(/stopPropagation/g) ?? []).length,
      "the deal card must stop all three channels — click, pointer and key — and each one prevents a different concrete failure, so none of them is defensive duplication"
    ).toBeGreaterThanOrEqual(3)
  })

  it("marks bulk selection with a tint and adds no fourth ring treatment", () => {
    expect(
      DEAL_CARD,
      "the bulk-selected card must be a 5% primary wash: bg-muted would be invisible against a bg-muted/50 column track, and both primary ring treatments are already taken"
    ).toContain("bg-primary/5")

    expect(
      (DEAL_CARD.match(/ring-2 ring-primary/g) ?? []).length,
      "the deal card must carry EXACTLY two primary ring treatments — the expanded state and the keyboard cursor. A card can legitimately be keyboard-focused AND expanded AND bulk-selected at once, so a third ring would be indistinguishable from the two that already mean something else (T-38-42)"
    ).toBe(2)
  })
})

// =============================================================================================
// G. THE BAR MOUNTS AFTER LOAD MORE; THE REPORT MOUNTS BEFORE THE LIST.
// =============================================================================================

describe("G. the bar and its spacer mount below everything", () => {
  const SPACER_HAZARD =
    "the bar is `fixed`, so it renders an h-20 sibling spacer to buy back the space it covers. Mounted above the Load More block, that spacer injects 80px into the MIDDLE of the page and the fixed bar covers the very button the spacer exists to keep reachable — the exact defect T-38-38 describes"

  const LOAD_MORE_SURFACES = [
    { path: ORG_TABLE_PATH, source: ORG_TABLE, loadMore: "Load More", list: "<Table>" },
    { path: PEOPLE_TABLE_PATH, source: PEOPLE_TABLE, loadMore: "Load More", list: "<Table>" },
    {
      path: ACTIVITIES_CLIENT_PATH,
      source: ACTIVITIES_CLIENT,
      loadMore: "Load More",
      list: "<ActivityList",
    },
  ]

  it("mounts the action bar after the Load More affordance", () => {
    for (const surface of LOAD_MORE_SURFACES) {
      const loadMoreAt = surface.source.indexOf(surface.loadMore)
      const barAt = surface.source.indexOf("<BulkActionBar")

      expect(
        loadMoreAt,
        `${surface.path} no longer renders a "${surface.loadMore}" affordance, so the ordering assertion below has no anchor and would compare against -1`
      ).toBeGreaterThan(-1)

      expect(
        barAt,
        `${surface.path} no longer renders the bulk action bar as an element`
      ).toBeGreaterThan(-1)

      expect(
        barAt,
        `${surface.path} mounts the bulk action bar BEFORE its Load More affordance. ${SPACER_HAZARD}`
      ).toBeGreaterThan(loadMoreAt)
    }
  })

  it("mounts the failure report before the list it describes", () => {
    for (const surface of LOAD_MORE_SURFACES) {
      const reportAt = surface.source.indexOf("<BulkFailureReport")
      const listAt = surface.source.indexOf(surface.list)

      expect(
        reportAt,
        `${surface.path} no longer renders the per-record failure report`
      ).toBeGreaterThan(-1)

      expect(
        listAt,
        `${surface.path} no longer renders "${surface.list}", so this ordering assertion has no anchor`
      ).toBeGreaterThan(-1)

      expect(
        reportAt,
        `${surface.path} mounts the failure report after its list. The report is a list to READ rather than a control to press and can run to as many lines as there were failures, so it belongs above the records it names and outside the fixed bar, which has to stay one compact cluster down to 320px`
      ).toBeLessThan(listAt)
    }
  })
})

// =============================================================================================
// H. THE KANBAN CAP AND ITS BOUNDARY.
// =============================================================================================

describe("H. the per-stage select-all is capped and says so", () => {
  it("caps the column header's copy against the shared limit", () => {
    expect(
      KANBAN_COLUMN,
      "the column header must reach the capped copy key: /deals has NO pagination, the largest live stage holds 10,495 deals and nine stages hold more than 300, so the capped branch is the ordinary case rather than an edge case (T-38-03)"
    ).toContain("selectAllInStageCapped")

    expect(
      KANBAN_COLUMN,
      "the capped copy must state the shared limit rather than a locally written number, so the copy and the runtime cap cannot drift"
    ).toContain("BULK_MAX_IDS")
  })

  it("renders tri-state and disables rather than hides on an empty stage", () => {
    expect(
      KANBAN_COLUMN,
      "the per-stage select-all must reach the primitive's mixed state; a two-state box cannot tell a partly-selected stage from an unselected one"
    ).toContain("indeterminate")

    expect(
      KANBAN_COLUMN,
      "an empty stage's select-all must be DISABLED rather than removed: a header element that appears and disappears makes the column header jump as deals move between stages"
    ).toContain("disabled={deals.length === 0}")
  })

  it("caps the board's running total and holds the selection as a set of ids", () => {
    expect(
      KANBAN_BOARD,
      "the board must enforce the shared limit at runtime, checked against the WHOLE current selection so ticking a second stage cannot push the total past it"
    ).toContain("BULK_MAX_IDS")

    expect(
      KANBAN_BOARD,
      "the board is the phase's one declared exception to selection-lives-in-rowSelection — there is no TanStack table on a kanban — so it must hold a set of deal ids directly"
    ).toContain("useState<Set<string>>")

    expect(
      KANBAN_BOARD,
      "the bar's entity type must be the SINGULAR schema literal: it maps that literal to a Trash tab, and a plural would not resolve"
    ).toContain('entityType="deal"')
  })
})

// =============================================================================================
// I. THE DEFERRED IDEAS ARE ABSENT, INCLUDING THE TWO THAT NEED A SCOPED DETECTOR.
// =============================================================================================

describe("I. every deferred idea is absent from every surface", () => {
  it("ships no Activities assignee bulk path", () => {
    expect(
      ACTIVITIES_CLIENT,
      "the module that owns the Activities bulk path must not mention an assignee id at all. Bulk reassignment of an Activity assignee alongside the owner is a DEFERRED idea (38-CONTEXT), and the pre-existing single-record assigneeId field lives in activity-list.tsx, which is why this assertion is scoped to this file rather than swept across all seven"
    ).not.toContain("assigneeId")
  })

  it("ships no tabular Deals view", () => {
    for (const [modulePath, source] of [
      [DEAL_CARD_PATH, DEAL_CARD],
      [KANBAN_COLUMN_PATH, KANBAN_COLUMN],
      [KANBAN_BOARD_PATH, KANBAN_BOARD],
    ] as const) {
      expect(
        source.includes("useReactTable"),
        `${modulePath} builds a TanStack table. A tabular Deals view as an alternative to the kanban is a DEFERRED idea (38-CONTEXT), and /deals being a kanban is the entire justification for this phase's one exception to selection-lives-in-rowSelection`
      ).toBe(false)
    }
  })
})

// =============================================================================================
// J. COLOUR AND COPY HYGIENE, SCOPED.
// =============================================================================================

describe("J. colour and copy hygiene over the files this phase authored", () => {
  it("walks a non-empty set of bulk modules", () => {
    expect(
      BULK_MODULES.length,
      `the walk over src/components/bulk returned ${BULK_MODULES.length} runtime modules. A zero-file scan passes every colour assertion below without reading a line of code`
    ).toBeGreaterThanOrEqual(5)

    expect(
      BULK_MODULES.every((modulePath) => !isTestFile(modulePath)),
      `the walk picked up a test file: ${BULK_MODULES.join(", ")}. Test files quote the forbidden tokens as literals — the three existing bulk wiring gates each declare their own copy of this colour table — so scanning them would make this assertion fail on its own vocabulary`
    ).toBe(true)
  })

  it("uses no colour outside the token set", () => {
    for (const modulePath of COLOUR_SCANNED) {
      const source = readStrippedSource(modulePath)

      for (const token of FORBIDDEN_COLOURS) {
        expect(
          source.includes(token),
          `${modulePath} must express colour through the design tokens only; "${token}" bypasses them and breaks dark mode`
        ).toBe(false)
      }

      expect(
        HEX_LITERAL.test(source),
        `${modulePath} must contain no raw hex colour: every colour on these surfaces is a CSS variable so both themes are covered`
      ).toBe(false)
    }
  })

  it("excludes activity-list.tsx from the colour scan, by name and with the reason", () => {
    expect(
      COLOUR_SCANNED.includes(ACTIVITY_LIST_PATH),
      `${ACTIVITY_LIST_PATH} is EXCLUDED from the colour assertions ON PURPOSE. Its overdue banner carries pre-existing non-token colours in a block this phase never touched, and a blanket scan over the whole file would go red on day one — a gate that is red on day one gets deleted rather than fixed, which is strictly worse than a scoped gate that stays enabled (T-38-45). The exclusion is stated here rather than applied silently`
    ).toBe(false)

    expect(
      FORBIDDEN_COLOURS.some((token) => ACTIVITY_LIST.includes(token)),
      `${ACTIVITY_LIST_PATH} no longer carries any non-token colour, so the exclusion above has nothing left to justify it. If this failed because the overdue banner was finally cleaned up, DELETE THE EXCLUSION and add this file to the scan — do not delete this assertion`
    ).toBe(true)
  })

  it("gives every bulk control a label that names its object and its own copy namespace", () => {
    for (const modulePath of BULK_MODULES) {
      const source = readStrippedSource(modulePath)

      for (const label of BARE_LABELS) {
        expect(
          source.includes(label),
          `${modulePath} renders a bare ${label.slice(1, -1)} button. On a destructive multi-record action every control must name what it does and how many records it does it to`
        ).toBe(false)
      }

      expect(
        source.includes("tCommon"),
        `${modulePath} reaches into the shared common copy namespace. Every string on these surfaces is count-aware or entity-aware and belongs under the bulk namespace, where locale parity covers it as a unit`
      ).toBe(false)
    }
  })
})

// =============================================================================================
// THE HEADLINE CLAIM — the two static column modules were never touched.
// =============================================================================================

describe("the phase designed out its collision with the Phase 43 columns retype", () => {
  it("leaves both static column modules free of any selection wiring", () => {
    for (const [modulePath, source] of [
      [ORG_COLUMNS_PATH, ORG_COLUMNS],
      [PEOPLE_COLUMNS_PATH, PEOPLE_COLUMNS],
    ] as const) {
      expect(
        source,
        `${modulePath} must still export column definitions — the positive marker for this claim`
      ).toContain("ColumnDef")

      for (const token of [
        "useSelectColumn",
        "components/bulk",
        "components/ui/checkbox",
        "rowSelection",
      ]) {
        expect(
          source.includes(token),
          `${modulePath} now references "${token}". This phase composes the checkbox column in the data tables SPECIFICALLY so neither columns module is touched: they export STATIC arrays imported by server components, so a column defined there could never call useTranslations and its accessible name would ship as untranslated English — and touching them would collide with Phase 43's POLISH-01 retype of these exact two files`
        ).toBe(false)
      }
    }
  })

  it("composes the select column in the data tables instead", () => {
    for (const [modulePath, source] of [
      [ORG_TABLE_PATH, ORG_TABLE],
      [PEOPLE_TABLE_PATH, PEOPLE_TABLE],
    ] as const) {
      expect(
        source,
        `${modulePath} must be where the checkbox column is composed, since the columns module it imports from is deliberately left alone`
      ).toContain("useSelectColumn")
    }
  })
})
