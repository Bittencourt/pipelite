# Webhooks

## Overview

Webhooks allow your application to receive real-time notifications when events occur in Pipelite. Instead of polling the API for changes, webhooks push data to your endpoints instantly.

**Why Use Webhooks vs Polling:**
- **Real-time:** Instant notifications when events occur
- **Efficient:** No wasted API calls checking for changes
- **Reliable:** Automatic retries if your endpoint is temporarily unavailable
- **Scalable:** Handle high-volume events without rate limiting concerns

**How Webhooks Work:**
1. You create a webhook subscription with a URL and selected events
2. When an event occurs, Pipelite sends an HTTP POST to your URL
3. Your endpoint processes the webhook and responds with 200 OK
4. If verification is enabled, you verify the signature for security

## Supported Events

| Event Name | Description | Trigger |
|------------|-------------|---------|
| `deal.created` | A new deal is created | POST /deals |
| `deal.updated` | A deal is updated | PATCH /deals/:id |
| `deal.deleted` | A deal is deleted | DELETE /deals/:id |
| `deal.stage_changed` | A deal's stage changes | PATCH /deals/:id with stage_id change |
| `activity.created` | A new activity is created | POST /activities |
| `activity.updated` | An activity is updated | PATCH /activities/:id |
| `activity.deleted` | An activity is deleted | DELETE /activities/:id |

### Stage Change Events

The `deal.stage_changed` event is triggered separately from `deal.updated` and includes additional context:

```json
{
  "event": "deal.stage_changed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "deal_abc123",
    "title": "Enterprise Deal",
    "old_stage_id": "stage_123",
    "new_stage_id": "stage_456",
    "pipeline_id": "pipe_789"
  }
}
```

## Creating Webhook Subscriptions

### Using the API

**Endpoint:** `POST /api/v1/webhooks`

**Request Body:**
```json
{
  "url": "https://your-app.com/webhooks/pipelite",
  "events": ["deal.created", "deal.updated", "deal.stage_changed"],
  "secret": "whsec_your_webhook_secret_here"
}
```

**Parameters:**
- `url` (required) — Your webhook endpoint URL (must be HTTPS)
- `events` (required) — Array of event types to subscribe to
- `secret` (optional) — Secret key for signature verification (recommended)

### cURL Example

```bash
curl -X POST \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/pipelite",
    "events": ["deal.created", "deal.stage_changed"],
    "secret": "whsec_mysecret123"
  }' \
  https://your-domain.com/api/v1/webhooks
```

**Response:**
```json
{
  "id": "wh_abc123",
  "url": "https://your-app.com/webhooks/pipelite",
  "events": ["deal.created", "deal.stage_changed"],
  "secret": "whsec_mysecret123",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**⚠️ Important:** The `secret` is only shown in the POST response. Store it securely immediately.

### JavaScript Example

```javascript
async function createWebhook(url, events, secret) {
  const response = await fetch('https://your-domain.com/api/v1/webhooks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PIPELITE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      events,
      secret
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail);
  }
  
  const webhook = await response.json();
  console.log('Webhook created:', webhook.id);
  console.log('Secret (save this):', webhook.secret);
  
  return webhook;
}

// Usage
await createWebhook(
  'https://your-app.com/webhooks/pipelite',
  ['deal.created', 'deal.stage_changed'],
  'whsec_mysecret123'
);
```

## Webhook Payload

All webhooks share a common structure:

```json
{
  "event": "deal.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    // Event-specific data
  }
}
```

**Common Fields:**
- `event` — Event type (e.g., "deal.created")
- `timestamp` — ISO 8601 timestamp when the event occurred
- `data` — Event-specific payload

### Example Payloads

#### deal.created

```json
{
  "event": "deal.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "deal_abc123",
    "title": "Enterprise Deal",
    "value": 50000,
    "currency": "USD",
    "organization_id": "org_123",
    "person_id": "person_456",
    "stage_id": "stage_789",
    "pipeline_id": "pipe_abc",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### deal.stage_changed

```json
{
  "event": "deal.stage_changed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "deal_abc123",
    "title": "Enterprise Deal",
    "old_stage_id": "stage_123",
    "new_stage_id": "stage_456",
    "pipeline_id": "pipe_789",
    "changed_at": "2024-01-15T10:30:00Z"
  }
}
```

#### activity.created

```json
{
  "event": "activity.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "act_abc123",
    "type": "call",
    "subject": "Follow-up call",
    "due_at": "2024-01-16T14:00:00Z",
    "deal_id": "deal_456",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## Signature Verification

When you provide a `secret` during webhook creation, Pipelite signs each webhook with HMAC-SHA256. This allows you to verify that webhooks are genuinely from Pipelite.

### Headers

Pipelite includes a signature in the `X-Webhook-Signature` header:

```
X-Webhook-Signature: sha256=abc123def456...
```

### JavaScript Verification

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  // Remove 'sha256=' prefix if present
  const signatureValue = signature.replace('sha256=', '');
  
  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  // Use timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signatureValue, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Express.js middleware
app.post('/webhooks/pipelite', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.PIPELITE_WEBHOOK_SECRET;
  
  // Verify signature
  const payload = JSON.parse(req.body);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  console.log('Webhook received:', payload.event);
  
  // Respond quickly (within 5 seconds)
  res.status(200).send('OK');
  
  // Process asynchronously
  processWebhook(payload);
});
```

### Python Verification

```python
import hmac
import hashlib

def verify_webhook_signature(payload, signature, secret):
    """Verify webhook signature using HMAC-SHA256"""
    # Remove 'sha256=' prefix if present
    signature_value = signature.replace('sha256=', '')
    
    # Calculate expected signature
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Use timing-safe comparison
    return hmac.compare_digest(signature_value, expected_signature)

# Flask example
@app.route('/webhooks/pipelite', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')
    secret = os.environ.get('PIPELITE_WEBHOOK_SECRET')
    
    # Verify signature
    if not verify_webhook_signature(request.data.decode(), signature, secret):
        return 'Invalid signature', 401
    
    # Process webhook
    payload = request.json
    print(f"Webhook received: {payload['event']}")
    
    return 'OK', 200
```

## Delivery and Retries

### Timeout

Your webhook endpoint must respond within **5 seconds**. After this time, the request will time out and be marked as failed.

**Best Practice:** Respond with 200 OK immediately, then process the webhook asynchronously in a background job.

```javascript
app.post('/webhooks/pipelite', async (req, res) => {
  // Verify signature first
  // ...
  
  // Respond immediately
  res.status(200).send('OK');
  
  // Process in background
  await processWebhookAsync(req.body);
});
```

### Response Requirements

Your endpoint must respond with:
- HTTP status **200** (or any 2xx status)
- Response body (can be empty)

### Retry Logic

If your endpoint returns a non-2xx status or times out, Pipelite will retry:
- **Retries:** Up to 5 attempts
- **Backoff:** Exponential backoff between retries
- **Discard:** After all retries fail, the webhook is discarded

## Testing Webhooks

### Using Webhook Testing Services

1. **Webhook.site** (https://webhook.site)
   - Get a unique test URL
   - See incoming webhooks in real-time
   - Inspect headers and payloads

2. **RequestBin** (https://requestbin.com)
   - Similar to Webhook.site
   - Good for debugging

### Local Development with ngrok

```bash
# 1. Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com

# 2. Start your local server
npm run dev  # Assuming your app runs on port 3000

# 3. Expose local server via ngrok
ngrok http 3000

# 4. Use the ngrok URL for webhooks
# Example: https://abc123.ngrok.io/webhooks/pipelite
```

**Example Setup:**
```bash
# Create webhook with ngrok URL
curl -X POST \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/webhooks/pipelite",
    "events": ["deal.created"]
  }' \
  https://your-domain.com/api/v1/webhooks
```

## Security Best Practices

### 1. Verify Signatures

**Always** verify webhook signatures to ensure they're from Pipelite:

```javascript
if (!verifyWebhookSignature(payload, signature, secret)) {
  return res.status(401).send('Invalid signature');
}
```

### 2. Use HTTPS Endpoints

Webhook URLs must use HTTPS. Never use HTTP for production webhooks.

### 3. Validate Event Types

Only process events you expect:

```javascript
const VALID_EVENTS = ['deal.created', 'deal.stage_changed'];

app.post('/webhooks/pipelite', (req, res) => {
  const { event, data } = req.body;
  
  if (!VALID_EVENTS.includes(event)) {
    console.warn(`Unexpected event type: ${event}`);
    return res.status(200).send('OK'); // Still return 200
  }
  
  // Process expected event
  processEvent(event, data);
  res.status(200).send('OK');
});
```

### 4. Idempotency

Webhooks may be delivered multiple times. Make your processing idempotent:

```javascript
async function processWebhook(payload) {
  const { event, data } = payload;
  
  // Check if already processed
  const processed = await db.webhooks.findOne({ event_id: payload.event_id });
  if (processed) {
    console.log('Webhook already processed, skipping');
    return;
  }
  
  // Process webhook
  await handleEvent(event, data);
  
  // Mark as processed
  await db.webhooks.insert({ event_id: payload.event_id, processed_at: new Date() });
}
```

### 5. Keep Secrets Secure

Store webhook secrets in environment variables, never in code:

```javascript
const WEBHOOK_SECRET = process.env.PIPELITE_WEBHOOK_SECRET;
```

## Managing Webhooks

### List Your Webhooks

```bash
curl -H "Authorization: Bearer pk_live_xxx" \
  https://your-domain.com/api/v1/webhooks
```

### Update a Webhook

```bash
curl -X PATCH \
  -H "Authorization: Bearer pk_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"events": ["deal.created", "deal.updated", "deal.deleted"]}' \
  https://your-domain.com/api/v1/webhooks/wh_abc123
```

### Delete a Webhook

```bash
curl -X DELETE \
  -H "Authorization: Bearer pk_live_xxx" \
  https://your-domain.com/api/v1/webhooks/wh_abc123
```

## Next Steps

- Review [JavaScript Examples](./examples/javascript.md) for webhook handling code
- See [Error Handling](./error-handling.md) for handling webhook failures
- Check the [OpenAPI Specification](/api/v1/docs) for webhook endpoint details
