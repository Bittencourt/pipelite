# API Authentication

## Overview

The Pipelite API uses **Bearer token authentication** with API keys. Every API request must include an API key in the `Authorization` header.

**How API Key Auth Works:**
- API keys are generated in your Pipelite dashboard
- Each request includes the key in the `Authorization` header
- The server validates the key and identifies your account
- Keys can be revoked and regenerated at any time

**Bearer Token Format:**
```
Authorization: Bearer pk_live_yxxxxxxxxxxxxxxxxxxxx
```

**Key Format:**
- Live keys: `pk_live_xxxxxxxxxxxxxxxxxxxx`
- Test keys: `pk_test_xxxxxxxxxxxxxxxxxxxx`

## Getting Your API Key

### Navigate to Settings

1. Log in to your Pipelite dashboard
2. Go to **Settings > API Keys**
3. Click **Generate New Key**
4. Enter a descriptive name (e.g., "Integration - Zapier")

### Generate and Store

1. Click **Generate**
2. **Copy the key immediately** — it's shown only once for security
3. Store it in your application's environment variables

**⚠️ Security:** Never commit API keys to version control. Use environment variables or a secrets manager.

## Using Your API Key

### Authorization Header Format

Every API request must include the `Authorization` header with the `Bearer` prefix:

```
Authorization: Bearer pk_live_your_api_key_here
```

**⚠️ Common Mistake:** Forgetting the "Bearer " prefix will result in a 401 Unauthorized error.

### cURL Example

```bash
curl -H "Authorization: Bearer pk_live_your_api_key_here" \
  https://your-domain.com/api/v1/organizations
```

### JavaScript (fetch) Example

```javascript
const API_KEY = process.env.PIPELITE_API_KEY;
const API_BASE = 'https://your-domain.com/api/v1';

const response = await fetch(`${API_BASE}/organizations`, {
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

if (!response.ok) {
  throw new Error(`API Error: ${response.status}`);
}

const data = await response.json();
```

### JavaScript (Axios) Example

```javascript
import axios from 'axios';

const client = axios.create({
  baseURL: 'https://your-domain.com/api/v1',
  headers: {
    'Authorization': `Bearer ${process.env.PIPELITE_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Now all requests include the auth header automatically
const { data } = await client.get('/organizations');
```

## API Key Security

### Keep Keys Secret

- **Never** commit API keys to version control (Git, etc.)
- **Never** expose keys in client-side JavaScript (browsers)
- **Always** use environment variables in production

### Use Environment Variables

```bash
# .env
PIPELITE_API_KEY=pk_live_your_api_key_here
```

```javascript
const API_KEY = process.env.PIPELITE_API_KEY;
```

### Rotate Keys If Compromised

If you suspect an API key has been exposed:

1. **Immediately** regenerate the key in Settings > API Keys
2. Update your application with the new key
3. The old key is invalidated instantly

### Regeneration Invalidates Old Key

When you regenerate an API key:
- The old key stops working **immediately**
- Update all integrations before regenerating
- Consider having multiple keys for different integrations

## Test vs Live Keys

### Test Keys (`pk_test_*`)

- Use for development and testing
- Safe to include in documentation
- May have relaxed rate limits

### Live Keys (`pk_live_*`)

- Use for production
- **Never** share or commit
- Standard rate limits apply

## Error Responses

### 401 Unauthorized

**Causes:**
- Missing `Authorization` header
- Invalid API key format
- Expired or revoked API key
- Missing "Bearer " prefix

**Example Error:**
```json
{
  "type": "https://api.pipelite.app/errors/UNAUTHORIZED",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid API key"
}
```

### 403 Forbidden

**Causes:**
- Valid API key, but insufficient permissions
- Key doesn't have access to this resource

**Example Error:**
```json
{
  "type": "https://api.pipelite.app/errors/FORBIDDEN",
  "title": "Forbidden",
  "status": 403,
  "detail": "Insufficient permissions for this operation"
}
```

For complete error handling documentation, see [Error Handling](./error-handling.md).

## Best Practices

1. **Use environment variables** — Never hardcode API keys
2. **Handle auth errors gracefully** — Catch 401 errors and alert your team
3. **Rotate keys periodically** — Even if not compromised, regular rotation is good practice
4. **Use separate keys** — Different keys for different integrations makes rotation easier
5. **Monitor key usage** — Check your dashboard for unusual API activity

## Next Steps

- Review [cURL Examples](./examples/curl.md) for command-line testing
- See [JavaScript Examples](./examples/javascript.md) for production code
- Learn about [Pagination](./pagination.md) for handling large data sets
