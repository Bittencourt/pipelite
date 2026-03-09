import { v2, v1 } from "pipedrive"

// ---------------------------------------------------------------------------
// Rate Limiting with Exponential Backoff
// ---------------------------------------------------------------------------

const MAX_RETRY_ATTEMPTS = 5
const BASE_DELAY_MS = 1000 // 1 second

/**
 * Wraps an async function with retry logic for rate limiting (HTTP 429).
 * Implements exponential backoff: 1s, 2s, 4s, 8s, 16s
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      lastError = error

      // Check for rate limit (HTTP 429).
      // The Pipedrive SDK can throw in two formats:
      // 1. Axios-style Error: { response: { status: 429 } } or { status: 429 }
      // 2. SDK plain object: { success: false, errorCode: 429, error: 'request over limit' }
      const sdkError = error as { response?: { status?: number }; status?: number; errorCode?: number }
      const status =
        sdkError?.response?.status ||
        sdkError?.status ||
        sdkError?.errorCode

      if (status === 429 && attempt < maxAttempts - 1) {
        const delayMs = Math.pow(2, attempt) * BASE_DELAY_MS
        console.warn(
          `[Pipedrive API] Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        continue
      }

      // Re-throw non-rate-limit errors or final attempt
      throw error
    }
  }

  throw lastError || new Error("Max retry attempts exceeded")
}

// ---------------------------------------------------------------------------
// API Client Class
// ---------------------------------------------------------------------------

/**
 * Response wrapper for paginated v2 API responses with cursor-based pagination.
 */
interface V2PaginatedResponse<T> {
  success?: boolean
  data?: T[]
  additional_data?: {
    next_cursor?: string | null
  }
}

/**
 * Response wrapper for paginated v1 API responses with offset-based pagination.
 */
interface V1PaginatedResponse<T> {
  success?: boolean
  data?: T[]
  additional_data?: {
    pagination?: {
      start: number
      limit: number
      more_items_in_collection: boolean
    }
  }
}

/**
 * Simple response for non-paginated v1 endpoints (users, activity fields).
 */
interface V1SimpleResponse<T> {
  success?: boolean
  data?: T[]
}

const DEFAULT_PAGE_LIMIT = 100

/**
 * Pipedrive API client wrapper with rate limiting and pagination support.
 *
 * CRITICAL: API key is never logged or persisted. It's passed as a parameter
 * and stored only in memory within the Configuration object for the API calls.
 */
export class PipedriveApiClient {
  private v2Config: v2.Configuration
  private v1Config: v1.Configuration

  // v2 APIs
  private pipelinesApi: v2.PipelinesApi
  private stagesApi: v2.StagesApi
  private organizationsApi: v2.OrganizationsApi
  private personsApi: v2.PersonsApi
  private dealsApi: v2.DealsApi
  private activitiesApi: v2.ActivitiesApi

  // v1 APIs (for custom field definitions and users)
  private usersApi: v1.UsersApi
  private dealFieldsApi: v1.DealFieldsApi
  private personFieldsApi: v1.PersonFieldsApi
  private organizationFieldsApi: v1.OrganizationFieldsApi
  private activityFieldsApi: v1.ActivityFieldsApi

  /**
   * Creates a new Pipedrive API client.
   * @param apiKey - The Pipedrive API token (never stored in DB, single-use)
   */
  constructor(apiKey: string) {
    // Create configurations for v1 and v2 APIs
    this.v2Config = new v2.Configuration({
      apiKey,
      basePath: "https://api.pipedrive.com/api/v2",
    })

    this.v1Config = new v1.Configuration({
      apiKey,
      basePath: "https://api.pipedrive.com/api/v1",
    })

    // Initialize v2 APIs
    this.pipelinesApi = new v2.PipelinesApi(this.v2Config)
    this.stagesApi = new v2.StagesApi(this.v2Config)
    this.organizationsApi = new v2.OrganizationsApi(this.v2Config)
    this.personsApi = new v2.PersonsApi(this.v2Config)
    this.dealsApi = new v2.DealsApi(this.v2Config)
    this.activitiesApi = new v2.ActivitiesApi(this.v2Config)

    // Initialize v1 APIs for field definitions and users
    this.usersApi = new v1.UsersApi(this.v1Config)
    this.dealFieldsApi = new v1.DealFieldsApi(this.v1Config)
    this.personFieldsApi = new v1.PersonFieldsApi(this.v1Config)
    this.organizationFieldsApi = new v1.OrganizationFieldsApi(this.v1Config)
    this.activityFieldsApi = new v1.ActivityFieldsApi(this.v1Config)
  }

  // ---------------------------------------------------------------------------
  // Pipelines (v2 - cursor pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all pipelines with pagination and retry logic.
   * Uses v2 API with cursor-based pagination.
   */
  async fetchPipelines(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let cursor: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const request: v2.PipelinesApiGetPipelinesRequest = {
          limit: DEFAULT_PAGE_LIMIT,
          cursor,
        }
        const response = (await this.pipelinesApi.getPipelines(
          request
        )) as V2PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items via next_cursor
        if (response.additional_data?.next_cursor) {
          cursor = response.additional_data.next_cursor
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  // ---------------------------------------------------------------------------
  // Stages (v2 - cursor pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all stages with pagination, optionally filtered by pipeline.
   * Uses v2 API with cursor-based pagination.
   */
  async fetchStages(pipelineId?: number): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let cursor: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const request: v2.StagesApiGetStagesRequest = {
          limit: DEFAULT_PAGE_LIMIT,
          cursor,
          ...(pipelineId !== undefined && { pipelineId }),
        }
        const response = (await this.stagesApi.getStages(
          request
        )) as V2PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items via next_cursor
        if (response.additional_data?.next_cursor) {
          cursor = response.additional_data.next_cursor
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  // ---------------------------------------------------------------------------
  // Organizations (v2 - cursor pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all organizations with pagination and retry logic.
   * Uses v2 API with cursor-based pagination.
   */
  async fetchOrganizations(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let cursor: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const request: v2.OrganizationsApiGetOrganizationsRequest = {
          limit: DEFAULT_PAGE_LIMIT,
          cursor,
        }
        const response = (await this.organizationsApi.getOrganizations(
          request
        )) as V2PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items via next_cursor
        if (response.additional_data?.next_cursor) {
          cursor = response.additional_data.next_cursor
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  // ---------------------------------------------------------------------------
  // People / Persons (v2 - cursor pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all persons with pagination and retry logic.
   * Uses v2 API with cursor-based pagination.
   */
  async fetchPeople(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let cursor: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const request: v2.PersonsApiGetPersonsRequest = {
          limit: DEFAULT_PAGE_LIMIT,
          cursor,
        }
        const response = (await this.personsApi.getPersons(
          request
        )) as V2PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items via next_cursor
        if (response.additional_data?.next_cursor) {
          cursor = response.additional_data.next_cursor
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  // ---------------------------------------------------------------------------
  // Deals (v2 - cursor pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all deals with pagination and retry logic.
   * Uses v2 API with cursor-based pagination.
   */
  async fetchDeals(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let cursor: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const request: v2.DealsApiGetDealsRequest = {
          limit: DEFAULT_PAGE_LIMIT,
          cursor,
        }
        const response = (await this.dealsApi.getDeals(
          request
        )) as V2PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items via next_cursor
        if (response.additional_data?.next_cursor) {
          cursor = response.additional_data.next_cursor
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  // ---------------------------------------------------------------------------
  // Activities (v2 - cursor pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all activities with pagination and retry logic.
   * Uses v2 API with cursor-based pagination.
   */
  async fetchActivities(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let cursor: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const request: v2.ActivitiesApiGetActivitiesRequest = {
          limit: DEFAULT_PAGE_LIMIT,
          cursor,
        }
        const response = (await this.activitiesApi.getActivities(
          request
        )) as V2PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items via next_cursor
        if (response.additional_data?.next_cursor) {
          cursor = response.additional_data.next_cursor
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  // ---------------------------------------------------------------------------
  // Users (v1 - no pagination, returns all users)
  // ---------------------------------------------------------------------------

  /**
   * Fetches all users for owner matching.
   * Uses v1 API - returns all users in a single request (no pagination).
   */
  async fetchUsers(): Promise<unknown[]> {
    return withRetry(async () => {
      const response = (await this.usersApi.getUsers()) as V1SimpleResponse<unknown>
      return response.data || []
    })
  }

  // ---------------------------------------------------------------------------
  // Custom Field Definitions (v1 API)
  // ---------------------------------------------------------------------------

  /**
   * Fetches deal custom field definitions using v1 API.
   * Uses offset-based pagination.
   */
  async fetchDealFields(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let start = 0
      let hasMore = true

      while (hasMore) {
        const request: v1.DealFieldsApiGetDealFieldsRequest = {
          start,
          limit: DEFAULT_PAGE_LIMIT,
        }
        const response = (await this.dealFieldsApi.getDealFields(
          request
        )) as V1PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items
        const pagination = response.additional_data?.pagination
        if (pagination?.more_items_in_collection) {
          start += DEFAULT_PAGE_LIMIT
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  /**
   * Fetches person custom field definitions using v1 API.
   * Uses offset-based pagination.
   */
  async fetchPersonFields(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let start = 0
      let hasMore = true

      while (hasMore) {
        const request: v1.PersonFieldsApiGetPersonFieldsRequest = {
          start,
          limit: DEFAULT_PAGE_LIMIT,
        }
        const response = (await this.personFieldsApi.getPersonFields(
          request
        )) as V1PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items
        const pagination = response.additional_data?.pagination
        if (pagination?.more_items_in_collection) {
          start += DEFAULT_PAGE_LIMIT
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  /**
   * Fetches organization custom field definitions using v1 API.
   * Uses offset-based pagination.
   */
  async fetchOrganizationFields(): Promise<unknown[]> {
    return withRetry(async () => {
      const allItems: unknown[] = []
      let start = 0
      let hasMore = true

      while (hasMore) {
        const request: v1.OrganizationFieldsApiGetOrganizationFieldsRequest = {
          start,
          limit: DEFAULT_PAGE_LIMIT,
        }
        const response = (await this.organizationFieldsApi.getOrganizationFields(
          request
        )) as V1PaginatedResponse<unknown>

        if (response.data) {
          allItems.push(...response.data)
        }

        // Check for more items
        const pagination = response.additional_data?.pagination
        if (pagination?.more_items_in_collection) {
          start += DEFAULT_PAGE_LIMIT
        } else {
          hasMore = false
        }
      }

      return allItems
    })
  }

  /**
   * Fetches activity custom field definitions using v1 API.
   * Returns all fields in a single request (no pagination).
   */
  async fetchActivityFields(): Promise<unknown[]> {
    return withRetry(async () => {
      const response = (await this.activityFieldsApi.getActivityFields()) as V1SimpleResponse<unknown>
      return response.data || []
    })
  }

  // ---------------------------------------------------------------------------
  // Count-Only Methods (single page, no full pagination)
  // ---------------------------------------------------------------------------

  /**
   * Fetches one page of organizations (up to 500) for count estimation.
   * Returns the number of items on the first page plus a flag indicating
   * whether more pages exist. Used in fetchPipedriveCounts to avoid
   * paginating through thousands of records just to get a total.
   */
  async fetchOrganizationsCount(): Promise<{ count: number; hasMore: boolean }> {
    return withRetry(async () => {
      const request: v2.OrganizationsApiGetOrganizationsRequest = { limit: 500 }
      const response = (await this.organizationsApi.getOrganizations(
        request
      )) as V2PaginatedResponse<unknown>
      return {
        count: response.data?.length ?? 0,
        hasMore: !!response.additional_data?.next_cursor,
      }
    })
  }

  /**
   * Fetches one page of persons (up to 500) for count estimation.
   */
  async fetchPeopleCount(): Promise<{ count: number; hasMore: boolean }> {
    return withRetry(async () => {
      const request: v2.PersonsApiGetPersonsRequest = { limit: 500 }
      const response = (await this.personsApi.getPersons(
        request
      )) as V2PaginatedResponse<unknown>
      return {
        count: response.data?.length ?? 0,
        hasMore: !!response.additional_data?.next_cursor,
      }
    })
  }

  /**
   * Fetches one page of deals (up to 500) for count estimation.
   */
  async fetchDealsCount(): Promise<{ count: number; hasMore: boolean }> {
    return withRetry(async () => {
      const request: v2.DealsApiGetDealsRequest = { limit: 500 }
      const response = (await this.dealsApi.getDeals(
        request
      )) as V2PaginatedResponse<unknown>
      return {
        count: response.data?.length ?? 0,
        hasMore: !!response.additional_data?.next_cursor,
      }
    })
  }

  /**
   * Fetches one page of activities (up to 500) for count estimation.
   */
  async fetchActivitiesCount(): Promise<{ count: number; hasMore: boolean }> {
    return withRetry(async () => {
      const request: v2.ActivitiesApiGetActivitiesRequest = { limit: 500 }
      const response = (await this.activitiesApi.getActivities(
        request
      )) as V2PaginatedResponse<unknown>
      return {
        count: response.data?.length ?? 0,
        hasMore: !!response.additional_data?.next_cursor,
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Creates a new Pipedrive API client.
 *
 * @param apiKey - The Pipedrive API token (user-provided, single-use)
 * @returns A configured PipedriveApiClient instance
 *
 * @example
 * ```typescript
 * const client = createPipedriveClient(userProvidedApiKey)
 * const pipelines = await client.fetchPipelines()
 * ```
 */
export function createPipedriveClient(apiKey: string): PipedriveApiClient {
  return new PipedriveApiClient(apiKey)
}
