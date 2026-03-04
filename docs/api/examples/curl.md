# cURL Examples

## Overview

cURL is a command-line tool for making HTTP requests. It's perfect for testing the Pipelite API, debugging integrations, and writing automation scripts.

**Why Use cURL:**
- Quick testing without writing code
- Available on all platforms
- Great for debugging authentication and responses
- Easy to script and automate

**Common cURL Options:**

| Option | Description |
|--------|-------------|
| `-X METHOD` | HTTP method (GET, POST, PATCH, DELETE) |
| `-H "Header: Value"` | Add request header |
| `-d 'data'` | Request body data |
| `-s` | Silent mode (no progress) |
| `-w "\n%{http_code}"` | Show HTTP status code at end |

## Setup

### Store Your API Key

```bash
# Store API key as environment variable
export PIPELITE_API_KEY="pk_live_your_api_key_here"
export API_BASE="https://your-domain.com/api/v1"
```

### Common Headers

```bash
# Authorization header
-H "Authorization: Bearer $PIPELITE_API_KEY"

# Content type for POST/PATCH
-H "Content-Type: application/json"
```

## Authentication

### Test Authentication

```bash
# Test if your API key works
curl -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations
```

**Expected:** Returns list of organizations with 200 status

### Invalid API Key

```bash
# Test with invalid key (should return 401)
curl -H "Authorization: Bearer invalid_key" \
  $API_BASE/organizations
```

**Expected:** Returns 401 Unauthorized error

## Organizations

### List All Organizations

```bash
# List all organizations (default pagination)
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations | jq '.'

# List with pagination
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/organizations?offset=0&limit=50" | jq '.'

# Get specific page
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/organizations?offset=50&limit=50" | jq '.'
```

### Get Single Organization

```bash
# Get organization by ID
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations/org_abc123 | jq '.'
```

### Create Organization

```bash
# Create new organization
curl -X POST \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "website": "https://acme.com",
    "notes": "Enterprise customer"
  }' \
  $API_BASE/organizations | jq '.'
```

### Update Organization

```bash
# Update organization (PATCH for partial update)
curl -X PATCH \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation Updated",
    "notes": "Updated notes"
  }' \
  $API_BASE/organizations/org_abc123 | jq '.'
```

### Delete Organization

```bash
# Delete organization
curl -X DELETE \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations/org_abc123

# Check response code
curl -s -w "\nHTTP Status: %{http_code}\n" \
  -X DELETE \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations/org_abc123
```

## People

### List People

```bash
# List all people
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/people | jq '.'

# Filter by organization
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/people?organization_id=org_abc123" | jq '.'
```

### Create Person

```bash
# Create new person
curl -X POST \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@acme.com",
    "organization_id": "org_abc123"
  }' \
  $API_BASE/people | jq '.'
```

### Update Person

```bash
# Update person
curl -X PATCH \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe.updated@acme.com",
    "phone": "+1-555-123-4567"
  }' \
  $API_BASE/people/person_xyz789 | jq '.'
```

## Deals

### List Deals

```bash
# List all deals
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/deals | jq '.'

# Filter by pipeline
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/deals?pipeline_id=pipe_abc123" | jq '.'

# Filter by stage
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/deals?stage_id=stage_456" | jq '.'
```

### Create Deal

```bash
# Create new deal
curl -X POST \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Enterprise License Deal",
    "value": 50000,
    "currency": "USD",
    "organization_id": "org_abc123",
    "person_id": "person_xyz789",
    "stage_id": "stage_456"
  }' \
  $API_BASE/deals | jq '.'
```

### Update Deal Stage

```bash
# Move deal to different stage
curl -X PATCH \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "stage_id": "stage_789"
  }' \
  $API_BASE/deals/deal_def456 | jq '.'
```

## Activities

### List Activities

```bash
# List all activities
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/activities | jq '.'

# Filter by deal
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/activities?deal_id=deal_def456" | jq '.'
```

### Create Activity

```bash
# Create new activity
curl -X POST \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "call",
    "subject": "Follow-up call",
    "due_at": "2024-01-20T14:00:00Z",
    "deal_id": "deal_def456"
  }' \
  $API_BASE/activities | jq '.'
```

### Mark Activity Complete

```bash
# Mark activity as done
curl -X PATCH \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "completed_at": "2024-01-18T15:30:00Z"
  }' \
  $API_BASE/activities/act_abc123 | jq '.'
```

## Pipelines and Stages

### List Pipelines

```bash
# List all pipelines
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/pipelines | jq '.'
```

### List Stages

```bash
# List stages for a pipeline
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  "$API_BASE/stages?pipeline_id=pipe_abc123" | jq '.'
```

## Webhooks

### Create Webhook

```bash
# Create webhook subscription
curl -X POST \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/pipelite",
    "events": ["deal.created", "deal.stage_changed"],
    "secret": "whsec_mysecret123"
  }' \
  $API_BASE/webhooks | jq '.'
```

### List Webhooks

```bash
# List all webhooks
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/webhooks | jq '.'
```

### Delete Webhook

```bash
# Delete webhook
curl -X DELETE \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/webhooks/wh_abc123
```

## Pagination

### Iterate Through All Pages

```bash
#!/bin/bash
# Script to fetch all organizations

offset=0
limit=50
total=0

while true; do
  response=$(curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
    "$API_BASE/organizations?offset=$offset&limit=$limit")
  
  # Get items count
  count=$(echo "$response" | jq '.data | length')
  
  # Break if no more items
  if [ "$count" -eq 0 ]; then
    break
  fi
  
  # Process items
  echo "$response" | jq -c '.data[]'
  
  # Update counters
  total=$((total + count))
  offset=$((offset + limit))
  
  # Get total from first request
  if [ "$offset" -eq "$limit" ]; then
    total=$(echo "$response" | jq -r '.meta.total')
  fi
done

echo "Total organizations fetched: $total"
```

## Error Handling

### Capture Status Code and Body

```bash
#!/bin/bash
# Capture both HTTP status and response body

response=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: $http_code"
echo "Response Body:"
echo "$body" | jq '.'

if [ "$http_code" -ge 400 ]; then
  echo "Error occurred:"
  echo "$body" | jq -r '.detail'
fi
```

### Handle Authentication Errors

```bash
#!/bin/bash
# Check if API key is valid

response=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations)

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 401 ]; then
  echo "Error: Invalid API key"
  echo "Please check your PIPELITE_API_KEY environment variable"
  exit 1
fi
```

### Handle Rate Limiting

```bash
#!/bin/bash
# Simple rate limit handling

retry_after=0

while true; do
  response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $PIPELITE_API_KEY" \
    -D headers.txt \
    $API_BASE/organizations)
  
  http_code=$(echo "$response" | tail -n1)
  
  if [ "$http_code" -eq 429 ]; then
    retry_after=$(grep -i "Retry-After" headers.txt | cut -d' ' -f2 | tr -d '\r')
    echo "Rate limited. Waiting ${retry_after} seconds..."
    sleep $retry_after
    continue
  fi
  
  break
done

echo "$response" | sed '$d' | jq '.'
```

## Custom Fields

### Create with Custom Fields

```bash
# Create organization with custom field values
curl -X POST \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "custom_fields": {
      "industry": "Technology",
      "employee_count": 500
    }
  }' \
  $API_BASE/organizations | jq '.'
```

### Update Custom Fields

```bash
# Update custom field values
curl -X PATCH \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "custom_fields": {
      "industry": "Software",
      "revenue": 10000000
    }
  }' \
  $API_BASE/organizations/org_abc123 | jq '.'
```

## Bulk Operations

### Batch Create Organizations

```bash
#!/bin/bash
# Create multiple organizations from JSON file

cat organizations.json | jq -c '.[]' | while read org; do
  curl -s -X POST \
    -H "Authorization: Bearer $PIPELITE_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$org" \
    $API_BASE/organizations > /dev/null
  
  echo "Created: $(echo $org | jq -r '.name')"
  sleep 0.1  # Small delay to avoid rate limits
done
```

## Testing and Debugging

### Verbose Output

```bash
# Show request and response details
curl -v \
  -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations
```

### Pretty Print JSON

```bash
# Use jq for formatted output
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations | jq '.'

# Extract specific fields
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations | jq '.data[] | {id, name}'
```

### Save Response to File

```bash
# Save response to file
curl -s -H "Authorization: Bearer $PIPELITE_API_KEY" \
  $API_BASE/organizations -o response.json

# Then process with jq
cat response.json | jq '.'
```

## Best Practices

### 1. Use Environment Variables

```bash
# ✅ GOOD: Store sensitive data in env vars
curl -H "Authorization: Bearer $PIPELITE_API_KEY" $API_BASE/organizations

# ❌ BAD: Hardcode API keys
curl -H "Authorization: Bearer pk_live_xxx" https://...
```

### 2. Check Status Codes

```bash
# Always check HTTP status
response=$(curl -s -w "\n%{http_code}" ...)
http_code=$(echo "$response" | tail -n1)
```

### 3. Use jq for JSON Processing

```bash
# Extract and format data
curl -s ... | jq '.data[] | select(.name | contains("Acme"))'
```

### 4. Handle Errors Gracefully

```bash
# Check for errors before processing
if [ "$http_code" -ge 400 ]; then
  echo "Error: $(echo "$body" | jq -r '.detail')"
  exit 1
fi
```

## Next Steps

- Review [JavaScript Examples](./javascript.md) for production code
- Learn about [Pagination](../pagination.md) for handling large data sets
- Set up [Webhooks](../webhooks.md) for real-time notifications
