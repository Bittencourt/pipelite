import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Who or what performed a CRM write.
 *
 * This module is deliberately dependency-free: it imports nothing but the Node runtime.
 * All four entry boundaries establish the actor here (the API auth wrapper, the workflow
 * execution engine, the audited server actions and the two importers), so any dependency
 * added to this file is pulled into every one of them. Keep it that way.
 */
export type AuditActorKind = "user" | "workflow_run" | "api_key" | "import" | "system"

export interface AuditActor {
  kind: AuditActorKind
  /**
   * The authenticated user behind the write, or null when there genuinely is none
   * (a scheduled run, a system job, a workflow whose author is unknown).
   *
   * NEVER inferred from a CRM event payload. The payload's `userId` describes the record
   * being written, not the identity that wrote it, and borrowing it would put a plausible
   * but unverified name on an audit row.
   */
  userId: string | null
  /** The run identity for the `workflow_run` kind. */
  workflowRunId?: string | null
  /** The session identity for the `import` kind. */
  importSessionId?: string | null
}

const actorStorage = new AsyncLocalStorage<AuditActor>()

/**
 * Read the actor for the current async scope.
 *
 * Returns `undefined` outside any boundary — it does NOT default to a `system` actor.
 * The analog in the workflow execution layer defaults its depth to 0 because zero is a
 * real depth; here "no actor was established" must stay distinguishable from "an actor
 * whose kind is genuinely system", so the two cannot collapse into one value. Mapping
 * absence to `system` is a single explicit line in the audit subscriber, where it is
 * asserted; doing it here would let an unattributed write silently acquire an identity.
 */
export function getCurrentActor(): AuditActor | undefined {
  return actorStorage.getStore()
}

/**
 * Run `fn` with `actor` established for it and everything it awaits.
 *
 * The `T | Promise<T>` signature is what lets synchronous and async call sites wrap
 * without a cast at the definition. Callers must build `actor` from already-authenticated
 * values only — this module exposes no way to set an actor from request data.
 */
export function runWithActor<T>(
  actor: AuditActor,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return actorStorage.run(actor, fn)
}
