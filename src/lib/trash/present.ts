/**
 * "Deleted by" — one joined `audit_log` row, or its absence, turned into something renderable.
 *
 * PURE, and deliberately so on three axes: no `@/db`, no React, no translation keys. It returns
 * DATA. The trash cell picks the message keys (and reuses Phase 36's existing `audit.actorKind.*`
 * and `audit.unknownActor` rather than duplicating them under `trash.*`, per 37-UI-SPEC §
 * "Reused keys"), which is what lets the same function feed a server-rendered table, a server
 * action's response and a client cell without any of them importing a database driver.
 *
 * The whole reason this is a function and not an inline ternary in a component is that the
 * decisions below are attribution decisions, and getting one wrong prints a confident lie about
 * who deleted a customer record.
 */
import type { AuditActorKind } from "@/lib/audit/actor-context"

/**
 * The exact projection the trash query selects: the audit row's actor columns plus the three
 * LEFT-joined lookups. Every joined column is nullable because every join is a LEFT join and at
 * most one of the three actor references is set on any given row.
 */
export interface DeletedByRow {
  entityId: string
  actorKind: AuditActorKind
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  runId: string | null
  workflowId: string | null
  workflowName: string | null
  createdAt: Date
}

/**
 * A closed set of things the "Deleted by" cell can say.
 *
 * `notRecorded` and `unknownUser` are SEPARATE MEMBERS and that is the point of the union. See
 * `presentDeletedBy` for why. Neither is `null`: an absent fact is still a fact to render, and
 * expressing it as `null` would push the discrimination back into every caller.
 */
export type DeletedByPresentation =
  | { kind: "notRecorded" }
  | { kind: "user"; name: string | null; email: string | null }
  | { kind: "unknownUser" }
  | { kind: "workflowRun"; runId: string | null; workflowId: string | null; workflowName: string | null }
  | { kind: "apiKey" }
  | { kind: "import" }
  | { kind: "system" }

/**
 * Total function from a joined audit row (or its absence) to a presentation.
 *
 * @param row the batched lookup's hit for this record, or `undefined` when there was none.
 */
export function presentDeletedBy(row: DeletedByRow | undefined): DeletedByPresentation {
  // NOBODY WROTE IT DOWN. Absence from the batched lookup is not a degraded user — it means the
  // record was soft-deleted before change history existed, which is true of every soft-deleted
  // record on this deployment today. Reporting it as "Unknown user" would claim a user acted;
  // reporting it as a system actor would claim the software acted. Both are inventions, and the
  // union keeps this a third answer instead (37-CONTEXT § Specific Ideas, RESEARCH Pitfall 4,
  // T-37-REP2).
  if (row === undefined) return { kind: "notRecorded" }

  switch (row.actorKind) {
    case "user":
      // THE KIND TEST HAS ALREADY HAPPENED, and that ordering is the security property. An
      // `api_key` row also has `actor_user_id` populated — with the KEY'S OWNER — so a guard
      // that looked at `actorId` first would attribute an automated delete to a person. This
      // is the same guard shape as src/lib/timeline/sources.ts:754-761.
      return row.actorId !== null && row.actorEmail !== null
        ? { kind: "user", name: row.actorName, email: row.actorEmail }
        : // The audit row survives its actor: `audit_log.actor_user_id` is a real FK but the
          // user may have been removed from the join's perspective. A user DID this and we can
          // no longer say who — distinct from "not recorded" above.
          { kind: "unknownUser" }

    case "workflow_run":
      // Nulls are carried through rather than collapsed: the cell renders the kind label alone
      // when the workflow is gone, and a link only when all three parts are present. Deciding
      // that here would mean the presenter knew about hrefs, which it must not.
      return {
        kind: "workflowRun",
        runId: row.runId,
        workflowId: row.workflowId,
        workflowName: row.workflowName,
      }

    case "api_key":
      // NO NAME, AND HONESTLY SO. `audit_log` has `actor_user_id`, `workflow_run_id` and
      // `import_session_id` and nothing else — there is no api-key reference to resolve, and
      // the subscriber stores the key's OWNER in `actor_user_id` for this kind. Resolving a
      // name through that owner would pick an arbitrary one of that user's keys and print it as
      // fact (sources.ts:771-782, T-37-09). 37-UI-SPEC § "Deleted by" says "the key name beside
      // it when known"; it is never knowable from this schema, so this plan says so rather than
      // shipping a field that is always null. Recording a key id on the audit row is a schema
      // change and belongs to whichever plan is willing to make it.
      return { kind: "apiKey" }

    case "import":
      // Same refusal for the same reason: every `runWithActor({ kind: "import", ... })` call
      // site in src/app/import/actions.ts passes a null session id, so there is no session to
      // name and no link to build.
      return { kind: "import" }

    case "system":
      return { kind: "system" }

    default: {
      // A sixth actor kind is a COMPILE error here, not a blank cell at runtime — the guard
      // idiom from src/components/timeline/audit-entry.tsx:311-315.
      const unhandled: never = row.actorKind
      void unhandled
      return { kind: "notRecorded" }
    }
  }
}
