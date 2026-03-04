# Error Handling

## Overview

The Pipelite API uses **RFC 7807 Problem Details** format for error responses. This provides a consistent, machine-readable structure for API errors.

**Key Principles:**
- All errors use standard HTTP status codes
- Error responses include structured details
- Error types are URI identifiers for programmatic handling
- Human-readable messages are always included

## Error Response Format

All error responses follow the RFC 7807 Problem Details format:

```json
{
  "type": "https://api.pipelite.app/errors/VALIDATION_ERROR",
  "title": "Validation Error",
  "status": 422,
  "detail": "The request body contains invalid fields",
  "instance": "/api/v1/organizations",
  "errors": [
    {
      "field": "name",
      "message": "Name is required"
    }
  ]
}
```

**Standard Fields:**
- `type` — URI identifier for the error type (machine-readable)
- `title` — Short, human-readable error title
- `status` — HTTP status code
- `detail` — Detailed error message
- `instance` — Request path that caused the error
- `errors` — Array of field-specific validation errors (optional)

## Common HTTP Status Codes

| Code | Meaning | Example Cause |
|------|---------|---------------|
| **200** | OK | Successful GET, PATCH |
| **201** | Created | Successful POST |
| **204** | No Content | Successful DELETE |
| **400** | Bad Request | Malformed JSON, invalid request syntax |
| **401** | Unauthorized | Missing or invalid API key |
| **403** | Forbidden | Valid key, insufficient permissions |
| **404** | Not Found | Entity doesn't exist |
| **409** | Conflict | Duplicate entry, constraint violation |
| **422** | Unprocessable Entity | Validation failure |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server-side error |

## Error Types

Pipelite uses specific error type URIs for programmatic error handling:

| Error Type | Status | Description |
|------------|--------|-------------|
| `INVALID_INPUT` | 400 | Request body is malformed or invalid |
| `UNAUTHORIZED` | 401 | API key is missing, invalid, or expired |
| `FORBIDDEN` | 403 | Valid API key but insufficient permissions |
| `NOT_FOUND` | 404 | Requested resource doesn't exist |
| `CONFLICT` | 409 | Resource conflict (duplicate, constraint violation) |
| `VALIDATION_ERROR` | 422 | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded, retry later |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Error Type URIs

Error types are full URIs that can be used for identification:

```
https://api.pipelite.app/errors/UNAUTHORIZED
https://api.pipelite.app/errors/VALIDATION_ERROR
https://api.pipelite.app/errors/RATE_LIMIT_EXCEEDED
```

## Handling Errors

### cURL Example

cURL doesn't throw errors on HTTP failures. Check both the exit code and response body:

```bash
#!/bin/bash
response=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer invalid_key" \
  https://your-domain.com/api/v1/organizations)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -ge 400 ]; then
  echo "Error: HTTP $http_code"
  echo "$body" | jq -r '.detail'
  exit 1
fi

echo "Success:"
echo "$body" | jq '.'
```

### JavaScript Example

```javascript
async function fetchWithErrorHandling(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${process.env.PIPELITE_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  // Success responses
  if (response.ok) {
    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }
    return response.json();
  }
  
  // Error responses
  const error = await response.json();
  
  // Handle specific error types
  switch (error.type) {
    case 'https://api.pipelite.app/errors/UNAUTHORIZED':
      throw new Error('Invalid API key. Check your credentials.');
    
    case 'https://api.pipelite.app/errors/VALIDATION_ERROR':
      const messages = error.errors.map(e => `${e.field}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${messages}`);
    
    case 'https://api.pipelite.app/errors/RATE_LIMIT_EXCEEDED':
      throw new Error('Rate limit exceeded. Please retry later.');
    
    default:
      throw new Error(error.detail || error.title);
  }
}

// Usage
try {
  const organizations = await fetchWithErrorHandling(
    'https://your-domain.com/api/v1/organizations'
  );
  console.log(organizations);
} catch (error) {
  console.error('API Error:', error.message);
}
```

## Common Error Scenarios

### 400 Bad Request

**Cause:** Malformed JSON, invalid syntax

```json
{
  "type": "https://api.pipelite.app/errors/INVALID_INPUT",
  "title": "Invalid Input",
  "status": 400,
  "detail": "Request body is not valid JSON"
}
```

**Solution:** Validate JSON syntax before sending

### 401 Unauthorized

**Cause:** Missing or invalid API key

```json
{
  "type": "https://api.pipelite.app/errors/UNAUTHORIZED",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid API key"
}
```

**Solution:** Check API key format and validity

### 404 Not Found

**Cause:** Entity doesn't exist

```json
{
  "type": "https://api.pipelite.app/errors/NOT_FOUND",
  "title": "Not Found",
  "status": 404,
  "detail": "Organization with ID 'org_invalid' not found"
}
```

**Solution:** Verify entity ID exists

### 422 Validation Error

**Cause:** Request validation failed

```json
{
  "type": "https://api.pipelite.app/errors/VALIDATION_ERROR",
  "title": "Validation Error",
  "status": 422,
  "detail": "Request validation failed",
  "errors": [
    {
      "field": "name",
      "message": "Name is required"
    },
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

**Solution:** Fix validation errors listed in `errors` array

### 409 Conflict

**Cause:** Duplicate entry or constraint violation

```json
{
  "type": "https://api.pipelite.app/errors/CONFLICT",
  "title": "Conflict",
  "status": 409,
  "detail": "Organization with this name already exists"
}
```

**Solution:** Check for duplicates before creating

## Rate Limiting

### Limits

Rate limits vary by endpoint:

| Endpoint | Limit | Window |
|----------|-------|--------|
| General endpoints | 100 requests | 1 minute |
| Authentication | 10 requests | 1 minute |

### Rate Limit Headers

Responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705331400
```

- `X-RateLimit-Limit` — Maximum requests per window
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets

### Rate Limit Error

When you exceed the rate limit:

```json
{
  "type": "https://api.pipelite.app/errors/RATE_LIMIT_EXCEEDED",
  "title": "Rate Limit Exceeded",
  "status": 429,
  "detail": "Rate limit exceeded. Please retry after 30 seconds"
}
```

**Headers:**
```
Retry-After: 30
```

### Handling Rate Limits

#### Exponential Backoff

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.ok) {
      return response.status === 204 ? null : response.json();
    }
    
    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
      
      console.log(`Rate limited. Retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, Math.max(retryAfter * 1000, backoff)));
      continue;
    }
    
    // Other errors
    const error = await response.json();
    throw new Error(error.detail);
  }
  
  throw new Error('Max retries exceeded');
}

// Usage
try {
  const data = await fetchWithRetry(
    'https://your-domain.com/api/v1/organizations',
    { headers: { 'Authorization': `Bearer ${API_KEY}` } }
  );
} catch (error) {
  console.error('Failed after retries:', error.message);
}
```

#### Proactive Rate Limit Checking

```javascript
class RateLimitedClient {
  constructor(apiKey, requestsPerMinute = 100) {
    this.apiKey = apiKey;
    this.requestTimes = [];
    this.rateLimit = requestsPerMinute;
  }
  
  async fetch(url, options = {}) {
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
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }
    
    return response.status === 204 ? null : response.json();
  }
}

// Usage
const client = new RateLimitedClient(process.env.PIPELITE_API_KEY, 100);
const organizations = await client.fetch('https://your-domain.com/api/v1/organizations');
```

## Best Practices

### 1. Always Handle Errors

```javascript
// ❌ BAD: No error handling
const response = await fetch(url);
const data = await response.json();

// ✅ GOOD: Proper error handling
const response = await fetch(url);
if (!response.ok) {
  const error = await response.json();
  console.error('API Error:', error.title, error.detail);
  throw new Error(error.detail);
}
const data = await response.json();
```

### 2. Log Error Details

```javascript
try {
  const data = await fetchWithErrorHandling(url, options);
} catch (error) {
  // Log full error for debugging
  console.error('API Error:', {
    url,
    status: error.status,
    type: error.type,
    detail: error.detail
  });
  
  // Re-throw with user-friendly message
  throw new Error('Failed to fetch data. Please try again.');
}
```

### 3. Implement Retries for Transient Errors

```javascript
async function fetchWithAutoRetry(url, options) {
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.ok) {
      return response.json();
    }
    
    // Only retry on server errors and rate limits
    if (response.status >= 500 || response.status === 429) {
      const backoff = Math.pow(2, i) * 1000;
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    
    // Don't retry client errors
    const error = await response.json();
    throw new Error(error.detail);
  }
}
```

### 4. Validate Before Sending

Reduce validation errors by validating client-side:

```javascript
function validateOrganization(data) {
  const errors = [];
  
  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  }
  
  if (data.email && !isValidEmail(data.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }
  
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

// Usage
try {
  validateOrganization(orgData);
  await createOrganization(orgData);
} catch (error) {
  if (error instanceof ValidationError) {
    // Show validation errors to user
    displayErrors(error.errors);
  }
}
```

## Next Steps

- Review [cURL Examples](./examples/curl.md) for error handling in bash
- See [JavaScript Examples](./examples/javascript.md) for production error handling
- Check [Pagination](./pagination.md) for handling large data sets
