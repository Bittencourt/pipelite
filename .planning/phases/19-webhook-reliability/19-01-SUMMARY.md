---
phase: 19-webhook-reliability
plan: 01
subsystem: api
tags: [webhooks, cron, retry, backoff, drizzle, instrumentation]

requires:
  - phase: 18-db-infrastructure
    provides: webhook_deliveries table with status/retry/nextAttemptAt columns
provides:
  - Durable DB-backed webhook delivery via triggerWebhook INSERT
  - Cron processor route with 4xx fail-fast and 5xx backoff+jitter
  - Self-scheduling webhook processor started on boot
  - Auto-cleanup of old delivery records (30 days)
affects: [19-webhook-reliability, 22-bulk-operations]

tech-stack:
  added: []
  patterns: [instrumentation.ts hook for background processing, setTimeout-chained polling loop, internal route auth via X-Internal-Secret]

key-files:
  created:
    - src/app/api/internal/webhooks/process/route.ts
    - src/lib/webhook-processor.ts
    - instrumentation.ts
  modified:
    - src/lib/api/webhooks/deliver.ts
    - src/db/schema/_relations.ts
    - .env.example

key-decisions:
  - "Delivery rows inserted in batch per triggerWebhook call for efficiency"
  - "Sequential processing of deliveries (for-of loop) to avoid overwhelming endpoints"
  - "setTimeout chaining prevents tick overlap without setInterval drift"

patterns-established:
  - "Internal API routes: authenticate with X-Internal-Secret header against env var"
  - "Background processing: instrumentation.ts + self-scheduling fetch loop"

requirements-completed: [WHOOK-01]

duration: 2min
completed: 2026-03-22
---

# Phase 19 Plan 01: Webhook Reliability - Durable Delivery Summary

**DB-backed webhook delivery with cron processor, 4xx fail-fast, 5xx exponential backoff+jitter, and 30-day auto-cleanup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T16:30:23Z
- **Completed:** 2026-03-22T16:32:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Rewrote triggerWebhook to INSERT into webhook_deliveries instead of in-memory setTimeout retries
- Created cron processor with correct 4xx/5xx handling, jitter-adjusted backoff, and 30-day cleanup
- Added Next.js instrumentation hook for automatic processor startup on boot

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite deliver.ts and add relations** - `1a45da3` (feat)
2. **Task 2: Create cron processor and self-scheduling startup hook** - `e7a89c2` (feat)

## Files Created/Modified
- `src/lib/api/webhooks/deliver.ts` - Rewritten to INSERT pending deliveries instead of HTTP calls
- `src/app/api/internal/webhooks/process/route.ts` - Cron processor with delivery, retry, and cleanup logic
- `src/lib/webhook-processor.ts` - Self-scheduling setTimeout-chained polling loop
- `instrumentation.ts` - Next.js hook to start processor on Node.js runtime
- `src/db/schema/_relations.ts` - Added webhookDeliveries relations
- `.env.example` - Added INTERNAL_SECRET documentation

## Decisions Made
- Batch INSERT for all matching subscriptions per triggerWebhook call (single DB round-trip)
- Sequential delivery processing (for-of) to avoid overwhelming external endpoints
- setTimeout chaining instead of setInterval to prevent tick overlap
- 5-second initial delay before first processor tick to let server finish booting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
Users must set `INTERNAL_SECRET` environment variable for the webhook processor to authenticate with the cron route. Generate with `openssl rand -base64 32`.

## Next Phase Readiness
- Delivery infrastructure complete; plans 19-02 (admin UI) and 19-03 (delivery history + DLQ) can proceed
- All 27 existing triggerWebhook callers work unchanged (same function signature)

---
*Phase: 19-webhook-reliability*
*Completed: 2026-03-22*
