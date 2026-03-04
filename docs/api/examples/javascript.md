# JavaScript Examples

## Overview

This guide provides production-ready JavaScript examples for integrating with the Pipelite API. Examples use the native `fetch` API and modern async/await patterns.

**Technologies:**
- JavaScript (ES6+)
- fetch API
- async/await
- Node.js

**Pattern:** All examples follow these principles:
- Comprehensive error handling
- Type safety with JSDoc comments
- Production-ready code
- Reusable client pattern

## Setup

### Environment Variables

```bash
# .env
PIPELITE_API_KEY=pk_live_your_api_key_here
PIPELITE_API_BASE=https://your-domain.com/api/v1
```

### Basic Client

```javascript
// pipelite-client.js

/**
 * Pipelite API Client
 * Production-ready client with error handling and retries
 */
class PipeliteClient {
  constructor(apiKey, apiBase = 'https://your-domain.com/api/v1') {
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make authenticated API request
   * @private
   */
  async request(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers
      }
    });

    // Handle successful responses
    if (response.ok) {
      // 204 No Content
      if (response.status === 204) {
        return null;
      }
      return response.json();
    }

    // Handle errors
    const error = await response.json();
    
    // Parse error type
    const errorType = error.type.split('/').pop();
    
    switch (errorType) {
      case 'UNAUTHORIZED':
        throw new Error('Invalid API key. Check your credentials.');
      
      case 'RATE_LIMIT_EXCEEDED':
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError('Rate limit exceeded', retryAfter);
      
      case 'VALIDATION_ERROR':
        const messages = error.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        throw new ValidationError(messages || error.detail, error.errors);
      
      default:
        throw new APIError(error.title, error.status, error.detail);
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    const searchParams = new URLSearchParams(params);
    const url = params ? `${endpoint}?${searchParams}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * PATCH request
   */
  async patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
}

// Custom error classes
class APIError extends Error {
  constructor(title, status, detail) {
    super(detail);
    this.name = 'APIError';
    this.title = title;
    this.status = status;
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = parseInt(retryAfter) || 60;
  }
}

class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// Export client
module.exports = { PipeliteClient, APIError, RateLimitError, ValidationError };
```

## Organizations

### List Organizations

```javascript
/**
 * List all organizations with pagination
 */
async function listOrganizations(client, offset = 0, limit = 50) {
  const response = await client.get('/organizations', { offset, limit });
  return response;
}

// Usage
const client = new PipeliteClient(process.env.PIPELITE_API_KEY);

try {
  const { data, meta } = await listOrganizations(client, 0, 50);
  console.log(`Fetched ${data.length} organizations`);
  console.log(`Total: ${meta.total}`);
} catch (error) {
  console.error('Error:', error.message);
}
```

### Get Single Organization

```javascript
/**
 * Get organization by ID
 */
async function getOrganization(client, orgId) {
  return client.get(`/organizations/${orgId}`);
}

// Usage
const org = await getOrganization(client, 'org_abc123');
console.log('Organization:', org.name);
```

### Create Organization

```javascript
/**
 * Create new organization
 */
async function createOrganization(client, orgData) {
  return client.post('/organizations', orgData);
}

// Usage
const newOrg = await createOrganization(client, {
  name: 'Acme Corporation',
  website: 'https://acme.com',
  notes: 'Enterprise customer'
});

console.log('Created organization:', newOrg.id);
```

### Update Organization

```javascript
/**
 * Update organization (partial update)
 */
async function updateOrganization(client, orgId, updates) {
  return client.patch(`/organizations/${orgId}`, updates);
}

// Usage
const updated = await updateOrganization(client, 'org_abc123', {
  name: 'Acme Corporation Updated',
  notes: 'Updated notes'
});
```

### Delete Organization

```javascript
/**
 * Delete organization
 */
async function deleteOrganization(client, orgId) {
  await client.delete(`/organizations/${orgId}`);
  return true;
}

// Usage
await deleteOrganization(client, 'org_abc123');
console.log('Organization deleted');
```

## Pagination

### Get All Organizations

```javascript
/**
 * Fetch all organizations with automatic pagination
 */
async function getAllOrganizations(client, limit = 50) {
  let allOrgs = [];
  let offset = 0;
  let total = null;

  while (true) {
    const { data, meta } = await client.get('/organizations', { offset, limit });
    
    allOrgs = allOrgs.concat(data);
    
    // Set total on first request
    if (total === null) {
      total = meta.total;
    }
    
    // Check if we've fetched all items
    if (offset + limit >= total) {
      break;
    }
    
    offset += limit;
  }

  return allOrgs;
}

// Usage
const allOrganizations = await getAllOrganizations(client);
console.log(`Fetched ${allOrganizations.length} organizations`);
```

### Pagination Helper

```javascript
/**
 * Paginated result wrapper
 */
class PaginatedResult {
  constructor(items, meta) {
    this.items = items;
    this.total = meta.total;
    this.offset = meta.offset;
    this.limit = meta.limit;
    this.hasMore = meta.offset + meta.limit < meta.total;
  }

  get currentPage() {
    return Math.floor(this.offset / this.limit) + 1;
  }

  get totalPages() {
    return Math.ceil(this.total / this.limit);
  }
}

/**
 * Get organizations with pagination metadata
 */
async function getOrganizationsPage(client, page = 1, perPage = 50) {
  const offset = (page - 1) * perPage;
  const { data, meta } = await client.get('/organizations', { offset, limit: perPage });
  
  return new PaginatedResult(data, meta);
}

// Usage
const result = await getOrganizationsPage(client, 1, 50);
console.log(`Page ${result.currentPage} of ${result.totalPages}`);
console.log(`Has more: ${result.hasMore}`);

result.items.forEach(org => {
  console.log(`- ${org.name}`);
});
```

## Error Handling

### With Retry Logic

```javascript
/**
 * Fetch with automatic retry for transient errors
 */
async function fetchWithRetry(client, endpoint, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.request(endpoint, options);
    } catch (error) {
      // Retry on rate limits
      if (error instanceof RateLimitError) {
        if (attempt < maxRetries - 1) {
          console.log(`Rate limited. Waiting ${error.retryAfter}s...`);
          await new Promise(r => setTimeout(r, error.retryAfter * 1000));
          continue;
        }
      }
      
      // Retry on server errors
      if (error instanceof APIError && error.status >= 500) {
        if (attempt < maxRetries - 1) {
          const backoff = Math.pow(2, attempt) * 1000;
          console.log(`Server error. Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
      
      // Don't retry client errors
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Usage
try {
  const organizations = await fetchWithRetry(
    client,
    '/organizations',
    { method: 'GET' },
    3
  );
} catch (error) {
  console.error('Failed after retries:', error.message);
}
```

### Error Logging

```javascript
/**
 * Error handler with logging
 */
async function handleAPIError(error, context = {}) {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    context,
    error: {
      name: error.name,
      message: error.message
    }
  };

  if (error instanceof ValidationError) {
    errorInfo.error.type = 'validation';
    errorInfo.error.fields = error.errors;
    console.error('Validation Error:', errorInfo);
    return { success: false, error: errorInfo };
  }

  if (error instanceof RateLimitError) {
    errorInfo.error.type = 'rate_limit';
    errorInfo.error.retryAfter = error.retryAfter;
    console.error('Rate Limit:', errorInfo);
    return { success: false, error: errorInfo };
  }

  if (error instanceof APIError) {
    errorInfo.error.type = 'api';
    errorInfo.error.status = error.status;
    errorInfo.error.title = error.title;
    console.error('API Error:', errorInfo);
    return { success: false, error: errorInfo };
  }

  // Unknown error
  errorInfo.error.type = 'unknown';
  console.error('Unknown Error:', errorInfo);
  return { success: false, error: errorInfo };
}

// Usage
try {
  const org = await createOrganization(client, { name: 'Test' });
  return { success: true, data: org };
} catch (error) {
  return handleAPIError(error, { operation: 'createOrganization' });
}
```

## Webhooks

### Webhook Handler (Express.js)

```javascript
const crypto = require('crypto');
const express = require('express');

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature, secret) {
  const signatureValue = signature.replace('sha256=', '');
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signatureValue, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Express middleware for webhook handling
 */
app.post('/webhooks/pipelite', 
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const secret = process.env.PIPELITE_WEBHOOK_SECRET;
    
    // Parse payload
    const payload = JSON.parse(req.body);
    
    // Verify signature
    if (!verifyWebhookSignature(payload, signature, secret)) {
      console.error('Invalid webhook signature');
      return res.status(401).send('Invalid signature');
    }
    
    // Respond quickly (within 5 seconds)
    res.status(200).send('OK');
    
    // Process asynchronously
    processWebhookAsync(payload).catch(error => {
      console.error('Webhook processing error:', error);
    });
  }
);

/**
 * Process webhook events
 */
async function processWebhookAsync(payload) {
  const { event, timestamp, data } = payload;
  
  console.log(`Processing webhook: ${event} at ${timestamp}`);
  
  switch (event) {
    case 'deal.created':
      await handleDealCreated(data);
      break;
    
    case 'deal.stage_changed':
      await handleDealStageChanged(data);
      break;
    
    case 'activity.created':
      await handleActivityCreated(data);
      break;
    
    default:
      console.warn(`Unhandled event type: ${event}`);
  }
}

async function handleDealCreated(deal) {
  console.log('New deal created:', deal.id, deal.title);
  // Your business logic here
}

async function handleDealStageChanged(deal) {
  console.log('Deal stage changed:', deal.id);
  console.log(`From ${deal.old_stage_id} to ${deal.new_stage_id}`);
  // Your business logic here
}
```

### Idempotent Webhook Processing

```javascript
/**
 * Idempotent webhook processor
 */
class WebhookProcessor {
  constructor(db) {
    this.db = db;
  }

  async process(payload) {
    const eventId = `${payload.event}-${payload.timestamp}`;
    
    // Check if already processed
    const processed = await this.db.webhooks.findOne({ event_id: eventId });
    if (processed) {
      console.log('Webhook already processed, skipping');
      return;
    }
    
    // Process webhook
    await this.handleEvent(payload.event, payload.data);
    
    // Mark as processed
    await this.db.webhooks.insert({
      event_id: eventId,
      processed_at: new Date()
    });
  }

  async handleEvent(event, data) {
    // Your event handling logic
  }
}
```

## Batch Operations

### Batch Create Organizations

```javascript
/**
 * Create multiple organizations
 */
async function batchCreateOrganizations(client, organizations, batchSize = 10) {
  const results = {
    success: [],
    failed: []
  };

  for (let i = 0; i < organizations.length; i += batchSize) {
    const batch = organizations.slice(i, i + batchSize);
    
    const promises = batch.map(async (org) => {
      try {
        const created = await createOrganization(client, org);
        return { success: true, data: created };
      } catch (error) {
        return { success: false, error: error.message, data: org };
      }
    });

    const batchResults = await Promise.all(promises);
    
    batchResults.forEach(result => {
      if (result.success) {
        results.success.push(result.data);
      } else {
        results.failed.push(result);
      }
    });

    // Small delay between batches to avoid rate limits
    if (i + batchSize < organizations.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return results;
}

// Usage
const organizations = [
  { name: 'Company 1', website: 'https://company1.com' },
  { name: 'Company 2', website: 'https://company2.com' },
  { name: 'Company 3', website: 'https://company3.com' }
];

const results = await batchCreateOrganizations(client, organizations, 10);
console.log(`Created ${results.success.length} organizations`);
console.log(`Failed ${results.failed.length} organizations`);
```

## Rate Limiting

### Proactive Rate Limiting

```javascript
/**
 * Rate-limited API client
 */
class RateLimitedClient extends PipeliteClient {
  constructor(apiKey, apiBase, requestsPerMinute = 100) {
    super(apiKey, apiBase);
    this.requestTimes = [];
    this.rateLimit = requestsPerMinute;
  }

  async request(endpoint, options = {}) {
    // Clean old requests
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(
      time => now - time < 60000
    );

    // Check if we're at the limit
    if (this.requestTimes.length >= this.rateLimit) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = 60000 - (now - oldestRequest);
      console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
    }

    // Make request
    this.requestTimes.push(Date.now());
    return super.request(endpoint, options);
  }
}

// Usage
const rateLimitedClient = new RateLimitedClient(
  process.env.PIPELITE_API_KEY,
  'https://your-domain.com/api/v1',
  100 // requests per minute
);
```

## Custom Fields

### Create with Custom Fields

```javascript
/**
 * Create organization with custom fields
 */
async function createOrganizationWithCustomFields(
  client,
  name,
  customFields = {}
) {
  return client.post('/organizations', {
    name,
    custom_fields: customFields
  });
}

// Usage
const org = await createOrganizationWithCustomFields(
  client,
  'Acme Corp',
  {
    industry: 'Technology',
    employee_count: 500,
    annual_revenue: 10000000
  }
);
```

### Update Custom Fields

```javascript
/**
 * Update only custom fields (preserve other data)
 */
async function updateCustomFields(client, orgId, customFields) {
  return client.patch(`/organizations/${orgId}`, {
    custom_fields: customFields
  });
}

// Usage
await updateCustomFields(client, 'org_abc123', {
  industry: 'Software',
  last_contact_date: '2024-01-15'
});
```

## Complete Example

### Full Integration Script

```javascript
// sync-organizations.js

require('dotenv').config();
const { PipeliteClient } = require('./pipelite-client');

async function main() {
  const client = new PipeliteClient(process.env.PIPELITE_API_KEY);

  try {
    // Fetch all organizations
    console.log('Fetching organizations...');
    const organizations = await getAllOrganizations(client);
    console.log(`Found ${organizations.length} organizations`);

    // Process each organization
    for (const org of organizations) {
      console.log(`Processing: ${org.name}`);
      
      // Your business logic here
      // e.g., sync to external system, update local database, etc.
    }

    console.log('Sync complete!');
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exit(1);
  }
}

async function getAllOrganizations(client) {
  let allOrgs = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const { data, meta } = await client.get('/organizations', { offset, limit });
    allOrgs = allOrgs.concat(data);
    
    if (offset + limit >= meta.total) break;
    offset += limit;
  }

  return allOrgs;
}

main();
```

## Best Practices

### 1. Use Environment Variables

```javascript
// ✅ GOOD: Store credentials securely
const client = new PipeliteClient(process.env.PIPELITE_API_KEY);

// ❌ BAD: Hardcode credentials
const client = new PipeliteClient('pk_live_xxx');
```

### 2. Handle All Error Types

```javascript
try {
  const org = await createOrganization(client, data);
} catch (error) {
  if (error instanceof ValidationError) {
    // Show validation errors to user
    showFormErrors(error.errors);
  } else if (error instanceof RateLimitError) {
    // Wait and retry
    await waitAndRetry(error.retryAfter);
  } else if (error instanceof APIError) {
    // Log and notify
    logError(error);
    notifyUser('API Error', error.message);
  } else {
    // Unknown error
    throw error;
  }
}
```

### 3. Implement Retries

```javascript
// Use fetchWithRetry for transient errors
const data = await fetchWithRetry(
  client,
  '/organizations',
  { method: 'GET' },
  3 // max retries
);
```

### 4. Use Type Safety

```javascript
// JSDoc for type hints
/**
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name
 * @property {string} [website]
 * @property {string} [notes]
 */

/**
 * @param {PipeliteClient} client
 * @param {string} orgId
 * @returns {Promise<Organization>}
 */
async function getOrganization(client, orgId) {
  return client.get(`/organizations/${orgId}`);
}
```

## Next Steps

- Review [Error Handling](../error-handling.md) for comprehensive error strategies
- Learn about [Webhooks](../webhooks.md) for real-time integrations
- Check [Pagination](../pagination.md) for handling large data sets
