/**
 * TypeScript type definitions for Pipedrive API v2 responses.
 *
 * These types match the Pipedrive API structure for core entities.
 * Reference: https://developers.pipedrive.com/docs/api/v2
 */

// ---------------------------------------------------------------------------
// Core Entity Types
// ---------------------------------------------------------------------------

/**
 * Pipedrive Pipeline entity.
 * @see https://developers.pipedrive.com/docs/api/v2/#!/Pipelines
 */
export interface PipedrivePipeline {
  id: number
  name: string
  active: boolean
  deal_probability: boolean
  url_title: string
  add_time?: string
  update_time?: string
}

/**
 * Pipedrive Stage entity.
 * @see https://developers.pipedrive.com/docs/api/v2/#!/Stages
 */
export interface PipedriveStage {
  id: number
  name: string
  pipeline_id: number
  order_nr: number
  active: boolean
  deal_probability: number | null
  rotten_flag: boolean
  rotten_days: number | null
  add_time?: string
  update_time?: string
}

/**
 * Pipedrive Organization entity.
 * @see https://developers.pipedrive.com/docs/api/v2/#!/Organizations
 */
export interface PipedriveOrganization {
  id: number
  name: string
  owner_id: { id: number; name: string } | null
  address: string | null
  website: string | null
  add_time?: string
  update_time?: string
  // Custom fields - Pipedrive uses field keys as property names
  [key: string]: unknown
}

/**
 * Pipedrive Person entity.
 * @see https://developers.pipedrive.com/docs/api/v2/#!/Persons
 */
export interface PipedrivePerson {
  id: number
  name: string
  first_name: string
  last_name: string
  owner_id: { id: number; name: string } | null
  org_id: { id: number; name: string } | null
  email: Array<{ value: string; primary: boolean; label?: string }>
  phone: Array<{ value: string; primary: boolean; label?: string }>
  add_time?: string
  update_time?: string
  // Custom fields - Pipedrive uses field keys as property names
  [key: string]: unknown
}

/**
 * Pipedrive Deal entity.
 * @see https://developers.pipedrive.com/docs/api/v2/#!/Deals
 */
export interface PipedriveDeal {
  id: number
  title: string
  value: number | null
  currency: string
  stage_id: number
  pipeline_id: number
  org_id: { id: number; name: string } | null
  person_id: { id: number; name: string; email: string } | null
  owner_id: { id: number; name: string } | null
  expected_close_date: string | null
  status: "open" | "won" | "lost" | "deleted"
  add_time?: string
  update_time?: string
  // Custom fields - Pipedrive uses field keys as property names
  [key: string]: unknown
}

/**
 * Pipedrive Activity entity.
 * @see https://developers.pipedrive.com/docs/api/v2/#!/Activities
 */
export interface PipedriveActivity {
  id: number
  subject: string
  type: string
  due_date: string | null
  due_time: string | null
  deal_id: number | null
  org_id: number | null
  person_id: number | null
  owner_id: number | null
  note: string | null
  done: boolean
  add_time?: string
  update_time?: string
  // Custom fields - Pipedrive uses field keys as property names
  [key: string]: unknown
}

/**
 * Pipedrive User entity.
 * @see https://developers.pipedrive.com/docs/api/v1/#!/Users
 */
export interface PipedriveUser {
  id: number
  name: string
  email: string
  active_flag: boolean
  has_pic?: boolean
  pic_hash?: string | null
}

// ---------------------------------------------------------------------------
// Custom Field Definition Types
// ---------------------------------------------------------------------------

/**
 * Pipedrive custom field definition.
 * Used for deal, person, organization, and activity custom fields.
 * @see https://developers.pipedrive.com/docs/api/v1/#!/DealFields
 */
export interface PipedriveFieldDefinition {
  id: number
  name: string
  key: string
  field_type: string
  options?: Array<{ id: number; label: string }>
  mandatory_flag: boolean
  active_flag?: boolean
  edit_flag?: boolean
  add_time?: string
  update_time?: string
  order_nr?: number
  visible_to?: string
}

// ---------------------------------------------------------------------------
// API Response Wrappers
// ---------------------------------------------------------------------------

/**
 * Generic Pipedrive API response wrapper.
 * v2 API uses cursor-based pagination.
 */
export interface PipedriveApiResponse<T> {
  success: boolean
  data: T | T[]
  additional_data?: {
    next_cursor?: string | null
  }
}

/**
 * Pipedrive v1 API response wrapper.
 * v1 API uses offset-based pagination.
 */
export interface PipedriveV1ApiResponse<T> {
  success: boolean
  data: T | T[]
  additional_data?: {
    pagination?: {
      start: number
      limit: number
      more_items_in_collection: boolean
    }
  }
}

// ---------------------------------------------------------------------------
// Import Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for Pipedrive API import.
 */
export interface PipedriveImportConfig {
  /** Pipedrive API token - never stored in DB, single-use only */
  apiKey: string
  /** Which entities to import */
  entities: {
    pipelines: boolean
    customFields: boolean
    organizations: boolean
    people: boolean
    deals: boolean
    activities: boolean
  }
}

// ---------------------------------------------------------------------------
// Custom Field Type Mapping
// ---------------------------------------------------------------------------

/**
 * Mapping from Pipedrive field types to Pipelite field types.
 *
 * Pipedrive types that don't map cleanly are marked as null (unsupported).
 */
export const PIPEDRIVE_FIELD_TYPE_MAP: Record<string, string | null> = {
  // Direct mappings
  text: "text",
  varchar: "text",
  varchar_auto: "text", // Autocomplete text
  int: "number",
  double: "number",
  date: "date",
  boolean: "boolean",

  // Dropdown → select
  enum: "single_select",
  set: "multi_select", // Multi-value enum

  // Supported with conversion
  phone: "text",
  email: "text",
  url: "url",

  // Unsupported - flag for manual review
  monetary: null, // Currency+amount combo
  user: null, // User reference
  org: null, // Organization reference
  people: null, // Person reference
  time: null, // Time-only field
  timerange: null, // Time range
  daterange: null, // Date range
  address: null, // Complex address object
}

/**
 * Get the Pipelite field type for a Pipedrive field type.
 * Returns null for unsupported types.
 */
export function mapPipedriveFieldType(pipedriveType: string): string | null {
  return PIPEDRIVE_FIELD_TYPE_MAP[pipedriveType] ?? null
}

/**
 * Check if a Pipedrive field type is supported for import.
 */
export function isPipedriveFieldTypeSupported(pipedriveType: string): boolean {
  return pipedriveType in PIPEDRIVE_FIELD_TYPE_MAP && PIPEDRIVE_FIELD_TYPE_MAP[pipedriveType] !== null
}
