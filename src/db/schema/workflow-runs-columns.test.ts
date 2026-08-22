import { describe, it, expect } from "vitest"
import { getTableConfig } from "drizzle-orm/pg-core"
import { workflows, workflowRuns } from "./workflows"
import { notificationPreferences } from "./notification-preferences"
import type { ExecutionContext } from "@/lib/execution/types"

/**
 * The storage contract for the four columns phase 41 adds, asserted against the PARSED
 * Drizzle table definitions rather than against the text of the schema files.
 *
 * That distinction is the whole point of this file, and it is copied deliberately from
 * `saved-views.test.ts`: phase 39 was bitten five separate times by assertions written as
 * raw-token greps, where the comment explaining a rule tripped the grep gate enforcing the
 * rule and deleting the comment "fixed" it. `getTableConfig` gives the real column,
 * foreign-key and default structure, so an assertion here can only be satisfied by
 * changing the schema, never by editing prose. This file reads no schema file as text.
 *
 * ANTI-VACUITY NOTE: unlike `saved-views.test.ts:117-128`, this file does NOT assert an
 * exact whole-table column map for `workflow_runs`, `workflows` or the email preferences
 * beyond the sibling set. Those tables are pre-existing and edited by other phases; a
 * total map here would turn any unrelated future column into a phase-41 test failure.
 * Instead: the named columns are asserted exactly, plus a count-free completeness check
 * that every column name this file claims about actually exists on the table.
 */

type ColumnFacts = { type: string; notNull: boolean; hasDefault: boolean; primary: boolean }

function columnFacts(table: Parameters<typeof getTableConfig>[0]): Record<string, ColumnFacts> {
  const out: Record<string, ColumnFacts> = {}
  for (const column of getTableConfig(table).columns) {
    out[column.name] = {
      type: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primary: column.primary,
    }
  }
  return out
}

/**
 * The DEFAULT VALUE, not merely its presence. `hasDefault: true` cannot distinguish
 * `DEFAULT false` from `DEFAULT true`, and for both booleans in this phase the wrong one
 * of the two is a silent feature-wide outage rather than a visible error.
 */
function columnDefault(table: Parameters<typeof getTableConfig>[0], name: string): unknown {
  const column = getTableConfig(table).columns.find((c) => c.name === name)
  if (!column) throw new Error(`no column named ${name}`)
  return column.default
}

function foreignKeyColumns(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).foreignKeys.flatMap((fk) => fk.reference().columns.map((c) => c.name))
}

// The exact set of column names this file makes claims about, per table. The completeness
// check below asserts every one of them is really on the table, so no assertion in this
// file can pass by silently reading `undefined` out of the facts map.
const ASSERTED_RUN_COLUMNS = ["dry_run", "replayed_from_run_id", "workflow_id"] as const
const ASSERTED_WORKFLOW_COLUMNS = ["failure_alert_sent_at"] as const
const ASSERTED_PREFERENCE_COLUMNS = [
  "email_deal_assigned",
  "email_activity_reminder",
  "email_weekly_digest",
  "email_workflow_failed",
] as const

const A_NOT_NULL_BOOLEAN_WITH_A_DEFAULT: ColumnFacts = {
  type: "boolean",
  notNull: true,
  hasDefault: true,
  primary: false,
}

describe("workflow_runs.dry_run (WFOPS-02 storage)", () => {
  it("is NOT NULL with a default, so no pre-existing run row is invisible", () => {
    expect(
      columnFacts(workflowRuns)["dry_run"],
      "dry_run must be NOT NULL with a default. A nullable dry_run makes eq(dryRun, false) " +
        "evaluate to NULL for every run row that existed before this migration, so the runs " +
        'list renders "No runs yet" for every workflow in the database.',
    ).toEqual(A_NOT_NULL_BOOLEAN_WITH_A_DEFAULT)
  })

  it("defaults to the boolean false, not true", () => {
    expect(
      columnDefault(workflowRuns, "dry_run"),
      "dry_run must default to false. hasDefault: true alone does not distinguish false from " +
        "true, and DEFAULT true would mark every pre-existing run as a dry run — hiding all of " +
        "them from the real-runs list instead of showing them.",
    ).toBe(false)
  })
})

describe("workflow_runs.replayed_from_run_id (WFOPS-02 provenance)", () => {
  it("is a plain nullable text column with no default", () => {
    expect(columnFacts(workflowRuns)["replayed_from_run_id"]).toEqual({
      type: "text",
      notNull: false,
      hasDefault: false,
      primary: false,
    })
  })

  it("carries NO foreign key, because runs are prunable — while workflow_id still does", () => {
    // Both halves are asserted so this cannot pass by the FK list coming back empty.
    // `src/lib/audit/prune.ts` and `src/lib/trash/prune.ts` both delete rows on a daily
    // tick; an FK here would either block pruning the origin run or cascade-delete the
    // replay along with it. The column is diagnostic only and grants no authorization.
    const fkColumns = foreignKeyColumns(workflowRuns)
    expect(fkColumns).toContain("workflow_id")
    expect(fkColumns).not.toContain("replayed_from_run_id")
  })
})

describe("workflows.failure_alert_sent_at (WFOPS-03 throttle)", () => {
  it("is a nullable timestamp with no default, so NULL means never alerted", () => {
    // NULL is the claimable state that plan 41-08's guarded UPDATE tests for. A default
    // would make every existing workflow look already-alerted and suppress the first
    // alert for all of them. Shape copied from activities.reminderSentAt; the WRITER is
    // deliberately not copied — that one is a read-then-write race.
    expect(columnFacts(workflows)["failure_alert_sent_at"]).toEqual({
      type: "timestamp",
      notNull: false,
      hasDefault: false,
      primary: false,
    })
  })
})

describe("notification_preferences.email_workflow_failed (WFOPS-03 opt-out)", () => {
  it("is the fourth email_* boolean and all four carry identical facts", () => {
    // Asserted as ONE object literal including the three pre-existing siblings, so a
    // fourth preference added by RENAMING one of them fails here rather than silently
    // dropping an existing opt-out.
    const facts = columnFacts(notificationPreferences)
    expect({
      email_deal_assigned: facts["email_deal_assigned"],
      email_activity_reminder: facts["email_activity_reminder"],
      email_weekly_digest: facts["email_weekly_digest"],
      email_workflow_failed: facts["email_workflow_failed"],
    }).toEqual({
      email_deal_assigned: A_NOT_NULL_BOOLEAN_WITH_A_DEFAULT,
      email_activity_reminder: A_NOT_NULL_BOOLEAN_WITH_A_DEFAULT,
      email_weekly_digest: A_NOT_NULL_BOOLEAN_WITH_A_DEFAULT,
      email_workflow_failed: A_NOT_NULL_BOOLEAN_WITH_A_DEFAULT,
    })
  })

  it("defaults to the boolean true, opt-out rather than opt-in", () => {
    expect(
      columnDefault(notificationPreferences, "email_workflow_failed"),
      "email_workflow_failed must default to true. An absent-or-false default silently " +
        "disables WFOPS-03 failure alerting for every user who has never opened the " +
        "notification settings page, which is most users.",
    ).toBe(true)
    // The siblings are opt-out too; asserted so a change of house style is visible here.
    expect(columnDefault(notificationPreferences, "email_deal_assigned")).toBe(true)
    expect(columnDefault(notificationPreferences, "email_activity_reminder")).toBe(true)
    expect(columnDefault(notificationPreferences, "email_weekly_digest")).toBe(true)
  })
})

describe("completeness of this file's claims", () => {
  // Count-free: every column name asserted above must really exist on its table. This is
  // what stops a typo'd key from making an assertion vacuously read `undefined`, without
  // pinning a total column map that unrelated phases would break.
  it("asserts only columns that exist on workflow_runs", () => {
    const names = Object.keys(columnFacts(workflowRuns))
    for (const column of ASSERTED_RUN_COLUMNS) expect(names).toContain(column)
  })

  it("asserts only columns that exist on workflows", () => {
    const names = Object.keys(columnFacts(workflows))
    for (const column of ASSERTED_WORKFLOW_COLUMNS) expect(names).toContain(column)
  })

  it("asserts only columns that exist on notification_preferences", () => {
    const names = Object.keys(columnFacts(notificationPreferences))
    for (const column of ASSERTED_PREFERENCE_COLUMNS) expect(names).toContain(column)
  })
})

// ---------------------------------------------------------------------------------------
// Type-level contract, checked by `tsc` rather than by vitest — vitest's esbuild transform
// strips types without checking them, so this line is inert at runtime and load-bearing
// in `npm run typecheck`.
//
// `_dryRun` is declared on ExecutionContext HERE in wave 1 because plans 41-05, 41-06 and
// 41-07 all compile against it in the same wave and must not each invent it. It is
// OPTIONAL so the existing non-dry call paths need no change, and it is authoritative
// from the `workflow_runs.dry_run` COLUMN only — never read back out of the mutable
// `workflow_runs.context` jsonb blob, so a hand-edited context cannot turn a dry run into
// a real one mid-execution (T-41-02).
// ---------------------------------------------------------------------------------------
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

const _dryRunIsAnOptionalBoolean: Exact<ExecutionContext["_dryRun"], boolean | undefined> = true

describe("type-level contracts are present", () => {
  it("holds the ExecutionContext._dryRun contract", () => {
    // Referenced so lint cannot report it unused; deleting it would silently drop the
    // guarantee that six wave-2 plans compile against.
    expect(_dryRunIsAnOptionalBoolean).toBe(true)
  })
})
