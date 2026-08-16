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

// Singleton - must survive across module boundaries in all environments.
//
// This is NOT defensive boilerplate. Next.js bundles `instrumentation.ts` into a different
// module graph from the app's server actions, so this file is instantiated TWICE in a
// production build: once in the graph that registers the audit subscriber (the READER) and
// once in the graph that runs the wrapped server actions (the WRITER). With a plain
// module-level `const`, the writer stores the actor on one AsyncLocalStorage instance and the
// reader calls `getStore()` on a different one, always gets `undefined`, and every audit row
// is written as `system` with a null user — silently defeating AUDIT-01, while every unit
// test passes because vitest has a single module registry.
//
// Observed in the running container on 2026-08-16: a deal created by a logged-in user in the
// browser produced `actor_kind = system`. `crmBus` (src/lib/events/bus.ts:25) already carries
// this same pattern for the same reason, which is why the EVENT reached the subscriber at all
// while the ACTOR did not.
const globalForActor = globalThis as typeof globalThis & {
  auditActorStorage?: AsyncLocalStorage<AuditActor>
}
const actorStorage =
  globalForActor.auditActorStorage ?? new AsyncLocalStorage<AuditActor>()
globalForActor.auditActorStorage = actorStorage

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
