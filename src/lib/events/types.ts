export type CrmEntityType = "deal" | "person" | "organization" | "activity"
export type CrmAction = "created" | "updated" | "deleted"

export interface CrmEventPayload {
  entity: CrmEntityType
  entityId: string
  action: CrmAction
  data: Record<string, unknown>
  /**
   * The entity row exactly as it existed immediately BEFORE this write, in the same casing
   * as `data` (raw camelCase at most sites, snake_case at the five serialized `/api/v1`
   * emit sites - `src/lib/audit/diff.ts` reconciles the two).
   *
   * ALWAYS supplied by the writer, which already holds the pre-read row it used to check
   * existence, and NEVER reconstructed by a subscriber: a subscriber fires after the write
   * has landed, so the former value is gone by the time it runs. This is the only way
   * before-values can exist at all.
   *
   * It lives on the shared payload as optional rather than on a narrower update-only type
   * because:
   *   (a) creates legitimately have no previous row, and `?:` says that honestly;
   *   (b) deletes emit `data === { id }` at all seven delete sites, so `previous` is the
   *       ONLY source of state there - an "update-only" type would exclude the very case
   *       that depends on it most;
   *   (c) a second payload interface would force a parallel edit to
   *       `DealStageChangedPayload` and to every entry of the 13-entry `CrmEventMap`.
   */
  previous?: Record<string, unknown>
  changedFields: string[] | null
  userId: string
  timestamp: string
}

export interface DealStageChangedPayload extends CrmEventPayload {
  entity: "deal"
  oldStageId: string
  newStageId: string
}

export type CrmEventMap = {
  "deal.created": CrmEventPayload
  "deal.updated": CrmEventPayload
  "deal.deleted": CrmEventPayload
  "deal.stage_changed": DealStageChangedPayload
  "person.created": CrmEventPayload
  "person.updated": CrmEventPayload
  "person.deleted": CrmEventPayload
  "organization.created": CrmEventPayload
  "organization.updated": CrmEventPayload
  "organization.deleted": CrmEventPayload
  "activity.created": CrmEventPayload
  "activity.updated": CrmEventPayload
  "activity.deleted": CrmEventPayload
}

export type CrmEventName = keyof CrmEventMap
