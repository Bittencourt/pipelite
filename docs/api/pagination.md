# API Pagination

## Overview

The Pipelite API uses **offset-based pagination** for list endpoints. This allows you to retrieve large data sets in manageable chunks without overwhelming your application or the API.

**Why Pagination Exists:**
- Prevents timeouts on large data sets
- Reduces memory usage on both client and server
- Improves response times
- Allows for progressive loading in UIs

**Defaults:**
- Default limit: **50 items per page**
- Maximum limit: **100 items per page**

## Pagination Parameters

All list endpoints accept these query parameters:

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `offset` | integer | 0 | — | Number of items to skip |
| `limit` | integer | 50 | 100 | Maximum number of items to return |

### Example Request

```bash
# Get first page (items 1-50)
curl -H "Authorization: Bearer pk_live_xxx" \
  "https://your-domain.com/api/v1/organizations?offset=0&limit=50"

# Get second page (items 51-100)
curl -H "Authorization: Bearer pk_live_xxx" \
  "https://your-domain.com/api/v1/organizations?offset=50&limit=50"

# Get items 201-250
curl -H "Authorization: Bearer pk_live_xxx" \
  "https://your-domain.com/api/v1/organizations?offset=200&limit=50"
```

## Response Format

Paginated responses include a `meta` object with pagination information:

```json
{
  "data": [
    {
      "id": "org_abc123",
      "name": "Acme Corporation",
      "created_at": "2024-01-15T10:30:00Z"
    },
    // ... more items
  ],
  "meta": {
    "total": 247,
    "offset": 0,
    "limit": 50
  }
}
```

**Meta Fields:**
- `total` — Total number of items available
- `offset` — Current offset (items skipped)
- `limit` — Current limit (items returned per page)

## Iterating Through Pages

### cURL Example

```bash
#!/bin/bash
API_KEY="pk_live_xxx"
BASE_URL="https://your-domain.com/api/v1"
LIMIT=50
OFFSET=0

while true; do
  response=$(curl -s -H "Authorization: Bearer $API_KEY" \
    "${BASE_URL}/organizations?offset=${OFFSET}&limit=${LIMIT}")
  
  # Extract items
  items=$(echo "$response" | jq -r '.data[]')
  
  # Break if no more items
  if [ -z "$items" ]; then
    break
  fi
  
  # Process items
  echo "$items" | jq -c '.'
  
  # Get total and check if we've fetched all
  total=$(echo "$response" | jq -r '.meta.total')
  if [ $((OFFSET + LIMIT)) -ge $total ]; then
    break
  fi
  
  # Move to next page
  OFFSET=$((OFFSET + LIMIT))
done
```

### JavaScript Example

```javascript
async function getAllOrganizations() {
  const API_KEY = process.env.PIPELITE_API_KEY;
  const API_BASE = 'https://your-domain.com/api/v1';
  const LIMIT = 50;
  
  let allOrgs = [];
  let offset = 0;
  let total = null;
  
  while (true) {
    const response = await fetch(
      `${API_BASE}/organizations?offset=${offset}&limit=${LIMIT}`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }
    
    const { data, meta } = await response.json();
    
    // Add items to our collection
    allOrgs = allOrgs.concat(data);
    
    // Set total on first request
    if (total === null) {
      total = meta.total;
    }
    
    // Check if we've fetched all items
    if (offset + LIMIT >= total) {
      break;
    }
    
    // Move to next page
    offset += LIMIT;
  }
  
  return allOrgs;
}

// Usage
const allOrganizations = await getAllOrganizations();
console.log(`Fetched ${allOrganizations.length} organizations`);
```

### Using Pagination Metadata

```javascript
async function getOrganizationsPage(page = 1, perPage = 50) {
  const offset = (page - 1) * perPage;
  
  const response = await fetch(
    `https://your-domain.com/api/v1/organizations?offset=${offset}&limit=${perPage}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.PIPELITE_API_KEY}`
      }
    }
  );
  
  const { data, meta } = await response.json();
  
  return {
    items: data,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(meta.total / perPage),
      totalItems: meta.total,
      hasMore: offset + perPage < meta.total
    }
  };
}

// Usage
const result = await getOrganizationsPage(1, 50);
console.log(`Page ${result.pagination.currentPage} of ${result.pagination.totalPages}`);
```

## Performance Tips

### 1. Use Appropriate Page Sizes

**Too small (10 items):**
- More API requests needed
- Higher overhead
- Slower overall

**Too large (100 items):**
- Larger response payloads
- More memory usage
- May hit timeouts

**Recommended:**
- Default: **50 items** (API default)
- Small devices/low bandwidth: **25 items**
- Bulk processing: **100 items** (maximum)

### 2. Don't Fetch All Data If You Don't Need It

```javascript
// ❌ BAD: Fetching everything when you only need first 100
const allOrgs = await getAllOrganizations();
const firstHundred = allOrgs.slice(0, 100);

// ✅ GOOD: Only fetch what you need
const response = await fetch(
  `${API_BASE}/organizations?offset=0&limit=100`,
  { headers: { 'Authorization': `Bearer ${API_KEY}` } }
);
const { data: firstHundred } = await response.json();
```

### 3. Use Filters to Reduce Result Sets

Many endpoints support filtering. Use filters to narrow down results before pagination:

```bash
# Filter organizations by name
curl "https://your-domain.com/api/v1/organizations?name=Acme&limit=10"

# Filter deals by stage
curl "https://your-domain.com/api/v1/deals?stage_id=stage_123&limit=50"
```

### 4. Implement Concurrent Requests (Advanced)

For bulk operations, fetch multiple pages concurrently:

```javascript
async function getAllOrganizationsConcurrent(concurrency = 5) {
  const API_BASE = 'https://your-domain.com/api/v1';
  const LIMIT = 50;
  
  // First, get total count
  const firstResponse = await fetch(
    `${API_BASE}/organizations?offset=0&limit=1`,
    { headers: { 'Authorization': `Bearer ${process.env.PIPELITE_API_KEY}` } }
  );
  const { meta } = await firstResponse.json();
  const totalPages = Math.ceil(meta.total / LIMIT);
  
  // Create array of page offsets
  const offsets = Array.from({ length: totalPages }, (_, i) => i * LIMIT);
  
  // Fetch pages with concurrency limit
  const allOrgs = [];
  for (let i = 0; i < offsets.length; i += concurrency) {
    const batch = offsets.slice(i, i + concurrency);
    
    const responses = await Promise.all(
      batch.map(offset =>
        fetch(`${API_BASE}/organizations?offset=${offset}&limit=${LIMIT}`, {
          headers: { 'Authorization': `Bearer ${process.env.PIPELITE_API_KEY}` }
        }).then(r => r.json())
      )
    );
    
    responses.forEach(({ data }) => allOrgs.push(...data));
  }
  
  return allOrgs;
}
```

## Next Steps

- Learn about [Webhooks](./webhooks.md) for real-time notifications
- See [JavaScript Examples](./examples/javascript.md) for more code samples
- Review [Error Handling](./error-handling.md) for handling pagination errors
