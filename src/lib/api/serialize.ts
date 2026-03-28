import { organizations } from "@/db/schema/organizations"
import { people } from "@/db/schema/people"
import { deals } from "@/db/schema/deals"
import { activities } from "@/db/schema/activities"
import { pipelines, stages } from "@/db/schema/pipelines"
import { customFieldDefinitions } from "@/db/schema/custom-fields"
import { workflows, workflowRuns, workflowRunSteps, workflowTemplates } from "@/db/schema/workflows"

type Organization = typeof organizations.$inferSelect
type Person = typeof people.$inferSelect
type Deal = typeof deals.$inferSelect
type Activity = typeof activities.$inferSelect
type Pipeline = typeof pipelines.$inferSelect
type Stage = typeof stages.$inferSelect
type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect
type Workflow = typeof workflows.$inferSelect
type WorkflowRun = typeof workflowRuns.$inferSelect
type WorkflowRunStep = typeof workflowRunSteps.$inferSelect
type WorkflowTemplate = typeof workflowTemplates.$inferSelect

/**
 * Convert Date to ISO string, handling null
 */
function toIsoString(date: Date | null | undefined): string | null {
  if (!date) return null
  return date.toISOString()
}

/**
 * Serialize organization to snake_case API format
 */
export function serializeOrganization(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    website: org.website,
    industry: org.industry,
    notes: org.notes,
    owner_id: org.ownerId,
    custom_fields: org.customFields,
    created_at: toIsoString(org.createdAt),
    updated_at: toIsoString(org.updatedAt),
  }
}

/**
 * Serialize person to snake_case API format
 * Includes computed fullName from firstName + lastName
 */
export function serializePerson(person: Person) {
  return {
    id: person.id,
    first_name: person.firstName,
    last_name: person.lastName,
    full_name: `${person.firstName} ${person.lastName}`,
    email: person.email,
    phone: person.phone,
    notes: person.notes,
    organization_id: person.organizationId,
    owner_id: person.ownerId,
    custom_fields: person.customFields,
    created_at: toIsoString(person.createdAt),
    updated_at: toIsoString(person.updatedAt),
  }
}

/**
 * Serialize deal to snake_case API format
 * Includes value as number (from string)
 */
export function serializeDeal(deal: Deal) {
  return {
    id: deal.id,
    title: deal.title,
    value: deal.value ? parseFloat(deal.value) : null,
    stage_id: deal.stageId,
    organization_id: deal.organizationId,
    person_id: deal.personId,
    owner_id: deal.ownerId,
    position: deal.position ? parseFloat(deal.position) : null,
    expected_close_date: toIsoString(deal.expectedCloseDate),
    notes: deal.notes,
    custom_fields: deal.customFields,
    created_at: toIsoString(deal.createdAt),
    updated_at: toIsoString(deal.updatedAt),
  }
}

/**
 * Serialize activity to snake_case API format
 * Includes dueAt and completedAt as ISO strings
 */
export function serializeActivity(activity: Activity) {
  return {
    id: activity.id,
    title: activity.title,
    type_id: activity.typeId,
    deal_id: activity.dealId,
    owner_id: activity.ownerId,
    due_at: toIsoString(activity.dueDate),
    completed_at: toIsoString(activity.completedAt),
    notes: activity.notes,
    custom_fields: activity.customFields,
    created_at: toIsoString(activity.createdAt),
    updated_at: toIsoString(activity.updatedAt),
  }
}

/**
 * Serialize pipeline to snake_case API format
 */
export function serializePipeline(pipeline: Pipeline) {
  return {
    id: pipeline.id,
    name: pipeline.name,
    is_default: pipeline.isDefault === 1,
    owner_id: pipeline.ownerId,
    created_at: toIsoString(pipeline.createdAt),
    updated_at: toIsoString(pipeline.updatedAt),
  }
}

/**
 * Serialize stage to snake_case API format
 */
export function serializeStage(stage: Stage) {
  return {
    id: stage.id,
    pipeline_id: stage.pipelineId,
    name: stage.name,
    description: stage.description,
    color: stage.color,
    type: stage.type,
    position: stage.position,
    created_at: toIsoString(stage.createdAt),
    updated_at: toIsoString(stage.updatedAt),
  }
}

/**
 * Serialize custom field definition to snake_case API format
 */
export function serializeCustomFieldDefinition(cfd: CustomFieldDefinition) {
  return {
    id: cfd.id,
    entity_type: cfd.entityType,
    name: cfd.name,
    type: cfd.type,
    config: cfd.config,
    required: cfd.required,
    position: cfd.position ? parseFloat(cfd.position) : null,
    show_in_list: cfd.showInList,
    created_at: toIsoString(cfd.createdAt),
    updated_at: toIsoString(cfd.updatedAt),
  }
}

/**
 * Serialize workflow to snake_case API format
 * Includes full trigger and nodes graph
 */
export function serializeWorkflow(workflow: Workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    triggers: workflow.triggers,
    nodes: workflow.nodes,
    active: workflow.active,
    created_by: workflow.createdBy,
    created_at: toIsoString(workflow.createdAt),
    updated_at: toIsoString(workflow.updatedAt),
  }
}

/**
 * Serialize workflow run to snake_case API format
 */
export function serializeRun(run: WorkflowRun) {
  return {
    id: run.id,
    workflow_id: run.workflowId,
    status: run.status,
    trigger_data: run.triggerData,
    error: run.error,
    depth: run.depth,
    current_node_id: run.currentNodeId,
    started_at: toIsoString(run.startedAt),
    completed_at: toIsoString(run.completedAt),
    created_at: toIsoString(run.createdAt),
  }
}

/**
 * Serialize workflow run step to snake_case API format
 */
export function serializeRunStep(step: WorkflowRunStep) {
  return {
    id: step.id,
    run_id: step.runId,
    node_id: step.nodeId,
    status: step.status,
    input: step.input,
    output: step.output,
    error: step.error,
    resume_at: toIsoString(step.resumeAt),
    started_at: toIsoString(step.startedAt),
    completed_at: toIsoString(step.completedAt),
    created_at: toIsoString(step.createdAt),
  }
}

/**
 * Serialize workflow template to snake_case API format
 */
export function serializeWorkflowTemplate(template: WorkflowTemplate) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    trigger: template.trigger,
    nodes: template.nodes,
    created_at: toIsoString(template.createdAt),
  }
}
