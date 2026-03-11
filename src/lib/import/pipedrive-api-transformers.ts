/**
 * Data transformers from Pipedrive API format to Pipelite internal format.
 *
 * These functions transform Pipedrive API entities into objects ready for
 * database insertion. ID maps are used to convert Pipedrive numeric IDs
 * to Pipelite UUIDs.
 *
 * @see pipedrive-api-types.ts for source types
 * @see pipedrive-mapping.ts for field mapping utilities
 */

import type {
  PipedrivePipeline,
  PipedriveStage,
  PipedriveOrganization,
  PipedrivePerson,
  PipedriveDeal,
  PipedriveActivity,
  PipedriveFieldDefinition,
} from "./pipedrive-api-types"

// ---------------------------------------------------------------------------
// Type Definitions for Transformed Data
// ---------------------------------------------------------------------------

/**
 * Pipeline data ready for insertion (minus generated ID).
 */
export interface NewPipelineData {
  name: string
  isDefault: number
  ownerId: string
}

/**
 * Stage data ready for insertion (minus generated ID).
 */
export interface NewStageData {
  pipelineId: string
  name: string
  description: string | null
  color: string
  type: "open" | "won" | "lost"
  position: number
}

/**
 * Organization data ready for insertion (minus generated ID).
 */
export interface NewOrganizationData {
  name: string
  website: string | null
  industry: string | null
  notes: string | null
  ownerId: string
  defaultCurrency: string
  customFields: Record<string, unknown>
}

/**
 * Person data ready for insertion (minus generated ID).
 */
export interface NewPersonData {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
  organizationId: string | null
  ownerId: string
  customFields: Record<string, unknown>
}

/**
 * Deal data ready for insertion (minus generated ID).
 */
export interface NewDealData {
  title: string
  value: string | null
  stageId: string
  organizationId: string | null
  personId: string | null
  ownerId: string
  position: string
  expectedCloseDate: Date | null
  notes: string | null
  customFields: Record<string, unknown>
}

/**
 * Activity data ready for insertion (minus generated ID).
 */
export interface NewActivityData {
  title: string
  typeName: string
  dealId: string | null
  ownerId: string
  dueDate: Date
  completedAt: Date | null
  notes: string | null
  customFields: Record<string, unknown>
}

/**
 * Custom field definition data ready for insertion (minus generated ID).
 */
export interface NewCustomFieldData {
  entityType: "organization" | "person" | "deal" | "activity"
  name: string
  type: string
  config: { options: string[] } | null
  required: boolean
  position: string
  showInList: boolean
}

// ---------------------------------------------------------------------------
// (Standard field sets removed: v2 API nests custom fields under entity.custom_fields,
//  so there is no need to filter standard fields from a flat entity object.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pipeline Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive Pipeline to Pipelite format.
 *
 * @param p - The Pipedrive pipeline object
 * @param ownerId - The Pipelite user ID to set as owner
 * @returns Pipeline data ready for insertion
 */
export function transformPipedrivePipeline(
  p: PipedrivePipeline,
  ownerId: string
): NewPipelineData {
  return {
    name: p.name,
    isDefault: p.active ? 1 : 0,
    ownerId,
  }
}

// ---------------------------------------------------------------------------
// Stage Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive Stage to Pipelite format.
 *
 * @param s - The Pipedrive stage object
 * @param pipelineIdMap - Map from Pipedrive pipeline ID to Pipelite pipeline UUID
 * @returns Stage data ready for insertion, or null if pipeline not found in map
 */
export function transformPipedriveStage(
  s: PipedriveStage,
  pipelineIdMap: Map<number, string>
): NewStageData | null {
  const pipelineId = pipelineIdMap.get(s.pipeline_id)
  if (!pipelineId) {
    return null
  }

  // Determine stage type based on rotten_flag and deal_probability
  // In Pipedrive, won/lost stages are typically identified differently
  // For now, default to 'open' - the import wizard will handle terminal stages
  let type: "open" | "won" | "lost" = "open"

  return {
    pipelineId,
    name: s.name,
    description: null,
    color: getDefaultStageColor(s.order_nr),
    type,
    position: s.order_nr,
  }
}

/**
 * Get a default color for a stage based on its position.
 */
function getDefaultStageColor(position: number): string {
  const colors = ["blue", "green", "yellow", "purple", "pink", "indigo", "cyan", "orange"]
  return colors[position % colors.length] || "blue"
}

// ---------------------------------------------------------------------------
// Organization Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive Organization to Pipelite format.
 *
 * @param o - The Pipedrive organization object
 * @param ownerId - The Pipelite user ID to set as owner
 * @param fieldDefinitions - Optional field definitions for extracting custom fields
 * @returns Organization data ready for insertion
 */
export function transformPipedriveOrganization(
  o: PipedriveOrganization,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewOrganizationData {
  // v2 API: custom fields are in a nested custom_fields sub-object
  const customFields = fieldDefinitions
    ? extractCustomFieldValues(o.custom_fields ?? {}, fieldDefinitions)
    : {}

  // v2 API: address is an object with street/city/etc sub-fields
  const addressStr = o.address?.value || null

  return {
    name: o.name,
    website: o.website || null,
    industry: null, // Pipedrive doesn't have a standard industry field
    notes: addressStr, // Map address to notes
    ownerId,
    defaultCurrency: "USD",
    customFields,
  }
}

// ---------------------------------------------------------------------------
// Person Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive Person to Pipelite format.
 *
 * @param p - The Pipedrive person object
 * @param orgIdMap - Map from Pipedrive org ID to Pipelite organization UUID
 * @param ownerId - The Pipelite user ID to set as owner
 * @param fieldDefinitions - Optional field definitions for extracting custom fields
 * @returns Person data ready for insertion
 */
export function transformPipedrivePerson(
  p: PipedrivePerson,
  orgIdMap: Map<number, string>,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewPersonData {
  // v2 API: email/phone arrays are named 'emails'/'phones' (plural)
  const primaryEmail = p.emails?.find((e) => e.primary)?.value || p.emails?.[0]?.value || null
  const primaryPhone = p.phones?.find((ph) => ph.primary)?.value || p.phones?.[0]?.value || null

  // v2 API: org_id is a plain number (not an object)
  const organizationId = p.org_id ? orgIdMap.get(p.org_id) || null : null

  // v2 API: custom fields are in a nested custom_fields sub-object
  const customFields = fieldDefinitions
    ? extractCustomFieldValues(p.custom_fields ?? {}, fieldDefinitions)
    : {}

  return {
    firstName: p.first_name || extractFirstName(p.name),
    lastName: p.last_name || extractLastName(p.name),
    email: primaryEmail,
    phone: primaryPhone,
    notes: null,
    organizationId,
    ownerId,
    customFields,
  }
}

/**
 * Extract first name from a full name.
 */
function extractFirstName(fullName: string): string {
  if (!fullName) return ""
  const parts = fullName.trim().split(/\s+/)
  return parts[0] || ""
}

/**
 * Extract last name from a full name.
 */
function extractLastName(fullName: string): string {
  if (!fullName) return ""
  const parts = fullName.trim().split(/\s+/)
  return parts.slice(1).join(" ") || ""
}

// ---------------------------------------------------------------------------
// Deal Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive Deal to Pipelite format.
 *
 * @param d - The Pipedrive deal object
 * @param stageIdMap - Map from Pipedrive stage ID to Pipelite stage UUID
 * @param orgIdMap - Map from Pipedrive org ID to Pipelite organization UUID
 * @param personIdMap - Map from Pipedrive person ID to Pipelite person UUID
 * @param ownerId - The Pipelite user ID to set as owner
 * @param fieldDefinitions - Optional field definitions for extracting custom fields
 * @returns Deal data ready for insertion, or null if stage not found in map
 */
export function transformPipedriveDeal(
  d: PipedriveDeal,
  stageIdMap: Map<number, string>,
  orgIdMap: Map<number, string>,
  personIdMap: Map<number, string>,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewDealData | null {
  const stageId = stageIdMap.get(d.stage_id)
  if (!stageId) {
    return null
  }

  // v2 API: org_id and person_id are plain numbers (not objects)
  const organizationId = d.org_id ? orgIdMap.get(d.org_id) || null : null
  const personId = d.person_id ? personIdMap.get(d.person_id) || null : null

  // Parse expected close date
  const expectedCloseDate = d.expected_close_date
    ? parseDate(d.expected_close_date)
    : null

  // v2 API: custom fields are in a nested custom_fields sub-object
  const customFields = fieldDefinitions
    ? extractCustomFieldValues(d.custom_fields ?? {}, fieldDefinitions)
    : {}

  return {
    title: d.title,
    value: d.value != null ? String(d.value) : null,
    stageId,
    organizationId,
    personId,
    ownerId,
    position: "10000", // Default position, will be ordered by stage
    expectedCloseDate,
    notes: null,
    customFields,
  }
}

/**
 * Normalize various date string formats to ISO format (YYYY-MM-DD).
 */
function normalizeDateString(dateStr: string): string {
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10)
  }
  // MM/DD/YYYY
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdyMatch) {
    return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, "0")}-${mdyMatch[2].padStart(2, "0")}`
  }
  // DD.MM.YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`
  }
  // Fall through - return as-is
  return dateStr
}

/**
 * Parse a date string to a Date object.
 * Handles ISO format (YYYY-MM-DD) and other common formats.
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null

  // Try ISO format first
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`)
  }

  // Try normalized date
  const normalized = normalizeDateString(dateStr)
  const normalizedMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (normalizedMatch) {
    return new Date(`${normalizedMatch[1]}-${normalizedMatch[2]}-${normalizedMatch[3]}T00:00:00Z`)
  }

  return null
}

// ---------------------------------------------------------------------------
// Activity Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive Activity to Pipelite format.
 *
 * @param a - The Pipedrive activity object
 * @param dealIdMap - Map from Pipedrive deal ID to Pipelite deal UUID
 * @param ownerId - The Pipelite user ID to set as owner
 * @param fieldDefinitions - Optional field definitions for extracting custom fields
 * @returns Activity data ready for insertion
 */
export function transformPipedriveActivity(
  a: PipedriveActivity,
  dealIdMap: Map<number, string>,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewActivityData {
  // Get deal ID from map
  const dealId = a.deal_id ? dealIdMap.get(a.deal_id) || null : null

  // Parse due date (required) - default to today if not provided or parsing fails
  const parsedDueDate = a.due_date ? parseDate(a.due_date) : null
  const dueDate = parsedDueDate ?? new Date()

  // Set completedAt if activity is done
  const completedAt = a.done ? new Date() : null

  // v2 API: activities do not have a custom_fields sub-object in v2
  const customFields: Record<string, unknown> = {}

  return {
    title: a.subject || "Untitled Activity",
    typeName: mapActivityType(a.type),
    dealId,
    ownerId,
    dueDate,
    completedAt,
    notes: a.note || null,
    customFields,
  }
}

/**
 * Map Pipedrive activity type to Pipelite activity type name.
 */
function mapActivityType(pipedriveType: string): string {
  const typeMap: Record<string, string> = {
    call: "call",
    meeting: "meeting",
    task: "task",
    email: "email",
  }

  return typeMap[pipedriveType?.toLowerCase()] || "task"
}

// ---------------------------------------------------------------------------
// Custom Field Transformer
// ---------------------------------------------------------------------------

/**
 * Transform a Pipedrive custom field definition to Pipelite format.
 *
 * @param f - The Pipedrive field definition
 * @param entityType - The entity type this field belongs to
 * @returns Custom field data ready for insertion, or null if type is unsupported
 */
export function transformPipedriveCustomField(
  f: PipedriveFieldDefinition,
  entityType: "deal" | "person" | "organization" | "activity"
): NewCustomFieldData | null {
  // Only import user-created custom fields; built-in system fields have edit_flag: false
  if (!f.edit_flag) {
    return null
  }

  // Map field type
  const pipeliteType = mapPipedriveFieldTypeInternal(f.field_type)
  if (!pipeliteType) {
    return null // Unsupported field type
  }

  // Build config for select fields
  let config: { options: string[] } | null = null
  if ((pipeliteType === "single_select" || pipeliteType === "multi_select") && f.options) {
    config = {
      options: f.options.map((opt) => opt.label),
    }
  }

  return {
    entityType,
    name: f.name,
    type: pipeliteType,
    config,
    required: f.mandatory_flag || false,
    position: String(f.order_nr || 10000),
    showInList: false,
  }
}

/**
 * Internal version of mapPipedriveFieldType to avoid circular import.
 * Maps Pipedrive field types to Pipelite field types.
 */
function mapPipedriveFieldTypeInternal(pipedriveType: string): string | null {
  const typeMap: Record<string, string | null> = {
    // Direct mappings
    text: "text",
    varchar: "text",
    varchar_auto: "text",
    int: "number",
    double: "number",
    date: "date",
    boolean: "boolean",

    // Dropdown → select
    enum: "single_select",
    set: "multi_select",

    // Supported with conversion
    phone: "text",
    email: "text",
    url: "url",

    // Unsupported
    monetary: null,
    user: null,
    org: null,
    people: null,
    time: null,
    timerange: null,
    daterange: null,
    address: null,
  }

  return typeMap[pipedriveType] ?? null
}

// ---------------------------------------------------------------------------
// Custom Field Value Extractor
// ---------------------------------------------------------------------------

/**
 * Extract custom field values from a Pipedrive entity's custom_fields sub-object.
 *
 * In the Pipedrive v2 API, all custom field values are nested under a
 * `custom_fields` property on each entity (not flat on the entity itself).
 * Each key is a randomly generated 40-character hash matching `field.key`
 * in the field definitions.
 *
 * The output uses the Pipelite field name as the key (matching the convention
 * used by the custom fields UI and custom-fields.ts), NOT the Pipedrive hash key.
 *
 * For enum (single_select) fields the Pipedrive v2 API returns the selected
 * option's numeric ID, not its label. For set (multi_select) fields it returns
 * a comma-separated string of numeric option IDs. Both cases are resolved to
 * human-readable label strings using the options array on the field definition.
 *
 * @param customFieldsObj - The entity's custom_fields sub-object (e.g. entity.custom_fields ?? {})
 * @param fieldDefinitions - The custom field definitions for this entity type
 * @returns Object containing custom field values keyed by field name, with non-null values only
 */
export function extractCustomFieldValues(
  customFieldsObj: Record<string, unknown>,
  fieldDefinitions: PipedriveFieldDefinition[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Build lookup structures from field definitions
  const keyToField = new Map(fieldDefinitions.map((f) => [f.key, f]))

  for (const [key, value] of Object.entries(customFieldsObj)) {
    // Skip if not a known custom field key
    const field = keyToField.get(key)
    if (!field) continue

    // Skip null/undefined values
    if (value === null || value === undefined) continue

    // Resolve enum/set option IDs to human-readable labels
    const resolvedValue = resolveSelectFieldValue(value, field)

    // Store by field name (Pipelite convention) rather than Pipedrive hash key
    result[field.name] = resolvedValue
  }

  return result
}

/**
 * Resolve a Pipedrive select field value from option ID(s) to label string(s).
 *
 * Pipedrive v2 API returns:
 *   - enum (single_select): a single numeric option ID (bare number, e.g. 1787)
 *   - set (multi_select): an array of numeric option IDs (e.g. [3433, 3434])
 *
 * Older v1-style responses may return set values as comma-separated strings
 * (e.g. "3433,3434"), so both forms are handled.
 *
 * If the field has no options defined, or the ID is not found, the raw value
 * is returned unchanged so data is not silently lost.
 *
 * @param value - The raw value from the Pipedrive API
 * @param field - The Pipedrive field definition (may contain an options array)
 * @returns The resolved label string, string[] of labels for set fields, or the original value
 */
function resolveSelectFieldValue(
  value: unknown,
  field: PipedriveFieldDefinition
): unknown {
  const fieldType = field.field_type
  if (fieldType !== "enum" && fieldType !== "set") {
    return value
  }

  if (!field.options || field.options.length === 0) {
    return value
  }

  // Build a numeric-id → label map for this field
  const idToLabel = new Map(field.options.map((opt) => [opt.id, opt.label]))

  if (fieldType === "enum") {
    // API returns the option ID as a number or numeric string
    const optionId = typeof value === "number" ? value : Number(value)
    if (!isNaN(optionId) && idToLabel.has(optionId)) {
      return idToLabel.get(optionId)
    }
    return value
  }

  // fieldType === "set": Pipedrive v2 API returns an array of numeric option IDs
  // (e.g. [3433, 3434]).  Older integrations or the v1 API may return a
  // comma-separated string instead (e.g. "3433,3434"), so we handle both forms.
  let idParts: Array<string | number>

  if (Array.isArray(value)) {
    // v2 API: array of numbers (or possibly strings)
    idParts = value as Array<string | number>
  } else if (typeof value === "string") {
    // Legacy / v1 API: comma-separated numeric string
    idParts = value.split(",").map((p) => p.trim())
  } else {
    // Unknown shape — return as-is so data is not silently lost
    return value
  }

  const labels = idParts
    .map((part) => {
      const optionId = typeof part === "number" ? part : Number(part)
      if (!isNaN(optionId) && idToLabel.has(optionId)) {
        return idToLabel.get(optionId) as string
      }
      return String(part) // Fall back to raw fragment if ID not found
    })
    .filter(Boolean)

  // Return string[] so the multi_select component and validateFieldValues
  // both receive the correct format (string[]) rather than a comma-joined string.
  return labels
}

// ---------------------------------------------------------------------------
// Batch Transformers
// ---------------------------------------------------------------------------

/**
 * Transform an array of Pipedrive pipelines.
 */
export function transformPipedrivePipelines(
  pipelines: PipedrivePipeline[],
  ownerId: string
): NewPipelineData[] {
  return pipelines.map((p) => transformPipedrivePipeline(p, ownerId))
}

/**
 * Transform an array of Pipedrive stages.
 * Filters out stages whose pipeline is not in the map.
 */
export function transformPipedriveStages(
  stages: PipedriveStage[],
  pipelineIdMap: Map<number, string>
): NewStageData[] {
  return stages
    .map((s) => transformPipedriveStage(s, pipelineIdMap))
    .filter((s): s is NewStageData => s !== null)
}

/**
 * Transform an array of Pipedrive organizations.
 */
export function transformPipedriveOrganizations(
  organizations: PipedriveOrganization[],
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewOrganizationData[] {
  return organizations.map((o) =>
    transformPipedriveOrganization(o, ownerId, fieldDefinitions)
  )
}

/**
 * Transform an array of Pipedrive persons.
 */
export function transformPipedrivePeople(
  people: PipedrivePerson[],
  orgIdMap: Map<number, string>,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewPersonData[] {
  return people.map((p) =>
    transformPipedrivePerson(p, orgIdMap, ownerId, fieldDefinitions)
  )
}

/**
 * Transform an array of Pipedrive deals.
 * Filters out deals whose stage is not in the map.
 */
export function transformPipedriveDeals(
  deals: PipedriveDeal[],
  stageIdMap: Map<number, string>,
  orgIdMap: Map<number, string>,
  personIdMap: Map<number, string>,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewDealData[] {
  return deals
    .map((d) =>
      transformPipedriveDeal(d, stageIdMap, orgIdMap, personIdMap, ownerId, fieldDefinitions)
    )
    .filter((d): d is NewDealData => d !== null)
}

/**
 * Transform an array of Pipedrive activities.
 */
export function transformPipedriveActivities(
  activities: PipedriveActivity[],
  dealIdMap: Map<number, string>,
  ownerId: string,
  fieldDefinitions?: PipedriveFieldDefinition[]
): NewActivityData[] {
  return activities.map((a) =>
    transformPipedriveActivity(a, dealIdMap, ownerId, fieldDefinitions)
  )
}

/**
 * Transform an array of Pipedrive custom field definitions.
 * Filters out unsupported field types.
 */
export function transformPipedriveCustomFields(
  fields: PipedriveFieldDefinition[],
  entityType: "deal" | "person" | "organization" | "activity"
): NewCustomFieldData[] {
  return fields
    .map((f) => transformPipedriveCustomField(f, entityType))
    .filter((f): f is NewCustomFieldData => f !== null)
}
