export type CrmEntityType = "deal" | "person" | "organization" | "activity"
export type CrmAction = "created" | "updated" | "deleted"

export interface CrmEventPayload {
  entity: CrmEntityType
  entityId: string
  action: CrmAction
  data: Record<string, unknown>
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
