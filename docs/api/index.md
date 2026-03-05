# Pipelite REST API

## Overview

The Pipelite REST API provides full CRUD (Create, Read, Update, Delete) access to all your CRM entities. Build integrations, automate workflows, and sync data with external systems.

**What the API Provides:**
- Full CRUD operations on all entities (organizations, people, deals, activities, pipelines, stages, custom fields, webhooks)
- Pagination for list endpoints
- Expandable resources for fetching related data
- Webhook notifications for real-time event handling
- RFC 7807 Problem Details for structured error responses

**Base URL:** `https://your-domain.com/api/v1`

**API Versioning:** Currently v1. Future breaking changes will use v2, v3, etc.

**Rate Limiting:** API requests are rate-limited to ensure fair usage. See [Error Handling](./error-handling.md#rate-limiting) for details on handling rate limits.

## Quick Start

### Get Your API Key

1. Navigate to **Settings > API Keys** in your Pipelite dashboard
2. Click **Generate New Key**
3. Copy the key immediately (it's shown only once!)
4. Store it securely in your application's environment variables

### Make Your First Request

```bash
curl -H "Authorization: Bearer pk_live_your_api_key_here" \
  https://your-domain.com/api/v1/organizations
```

### Parse the Response (JavaScript)

```javascript
const response = await fetch('https://your-domain.com/api/v1/organizations', {
  headers: {
    'Authorization': 'Bearer pk_live_your_api_key_here'
  }
});

const data = await response.json();
console.log(data);
// { data: [...], meta: { total: 10, offset: 0, limit: 50 } }
```

## Documentation Sections

- **[Authentication Guide](./authentication.md)** - How to authenticate API requests
- **[Pagination Guide](./pagination.md)** - How to paginate through large result sets
- **[Webhooks Guide](./webhooks.md)** - Set up real-time event notifications
- **[Error Handling](./error-handling.md)** - Handle errors and rate limits
- **[cURL Examples](./examples/curl.md)** - Command-line examples for all endpoints
- **[JavaScript Examples](./examples/javascript.md)** - Production-ready JavaScript code samples

## OpenAPI Specification

For the complete, authoritative API reference, see the **[OpenAPI Specification](/api/v1/docs)**. This provides:
- Full endpoint documentation
- Request/response schemas
- Authentication details
- Error types

## Available Endpoints

| Entity | Endpoints | Description |
|--------|-----------|-------------|
| **Organizations** | `/organizations` | Manage companies and accounts |
| **People** | `/people` | Manage contacts and leads |
| **Deals** | `/deals` | Manage deals and opportunities |
| **Activities** | `/activities` | Manage calls, meetings, tasks, emails |
| **Pipelines** | `/pipelines` | Manage sales pipelines |
| **Stages** | `/stages` | Manage pipeline stages |
| **Custom Fields** | `/custom-fields` | Manage custom field definitions |
| **Webhooks** | `/webhooks` | Manage webhook subscriptions |

### Common Operations

All entities support standard CRUD operations:

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| List | GET | `/entities` | List entities with pagination |
| Get | GET | `/entities/:id` | Retrieve a single entity |
| Create | POST | `/entities` | Create a new entity |
| Update | PATCH | `/entities/:id` | Update an entity (partial update) |
| Delete | DELETE | `/entities/:id` | Delete an entity |

**Note:** Replace `/entities` with the actual endpoint path (e.g., `/organizations`, `/people`, etc.)

## Next Steps

1. Read the [Authentication Guide](./authentication.md) to understand API key usage
2. Review [Pagination](./pagination.md) to handle large data sets
3. Explore [cURL Examples](./examples/curl.md) or [JavaScript Examples](./examples/javascript.md)
4. Set up [Webhooks](./webhooks.md) for real-time notifications
