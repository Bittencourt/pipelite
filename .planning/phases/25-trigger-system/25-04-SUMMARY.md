---
phase: 25-trigger-system
plan: 04
subsystem: api, triggers
tags: [webhook, crypto, timingSafeEqual, manual-trigger, api-endpoint, secret-regeneration]

# Dependency graph
requires:
  - phase: 25-trigger-system
    provides: TriggerEnvelope, createWorkflowRun, trigger Zod schemas, workflows schema with triggers array
provides:
  - Inbound webhook route (POST /api/webhooks/in/{workflowId}/{secret})
  - REST API trigger endpoint (POST /api/v1/workflows/{id}/run)
  - Manual trigger mutation (triggerManualRun)
  - Webhook secret generation and timing-safe verification utilities
  - Webhook secret regeneration server action
affects: [25-ui-trigger-config, 26-execution-engine, 27-action-nodes]

# Tech tracking
tech-stack:
  added: []
  patterns: [timing-safe-secret-verification, secret-in-url-auth, trigger-envelope-creation]

key-files:
  created:
    - src/lib/triggers/webhook-secret.ts
    - src/lib/triggers/manual-trigger.ts
    - src/lib/triggers/manual-trigger.test.ts
    - src/app/api/webhooks/in/[workflowId]/[secret]/route.ts
    - src/app/api/v1/workflows/[id]/run/route.ts
  modified:
    - src/lib/mutations/workflows.ts

key-decisions:
  - "Secret in URL path as sole authentication for inbound webhooks (no header auth required)"
  - "All invalid states (bad secret, inactive workflow, no webhook trigger) return 404 for zero information leakage"
  - "Authorization check on regenerateWebhookSecret ensures only workflow creator can invalidate URLs"

patterns-established:
  - "Inbound webhook pattern: secret-in-URL auth with timing-safe comparison, 404 for all error states"
  - "Manual trigger pattern: triggerManualRun creates TriggerEnvelope with optional entity data"

requirements-completed: [TRIG-05, TRIG-03, API-02]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 25 Plan 04: Webhook Receiver & Manual Trigger Summary

**Inbound webhook endpoint with timing-safe secret verification, REST API trigger endpoint with API auth, manual trigger mutation, and webhook secret regeneration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T00:43:49Z
- **Completed:** 2026-03-28T00:45:47Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Inbound webhook route accepting POST at /api/webhooks/in/{workflowId}/{secret} with timing-safe secret verification
- REST API trigger endpoint POST /api/v1/workflows/{id}/run with Bearer token auth via withApiAuth
- Manual trigger mutation creating runs with trigger_type "manual" and optional entity data
- Webhook secret regeneration server action that updates both webhookSecret column and triggers JSONB array

## Task Commits

Each task was committed atomically:

1. **Task 1: Webhook secret utilities and manual trigger mutation** - `9cc2b7a` (feat, TDD)
2. **Task 2: Inbound webhook route, API trigger endpoint, and secret regeneration** - `7d7b3c5` (feat)

## Files Created/Modified
- `src/lib/triggers/webhook-secret.ts` - Secret generation (crypto.randomBytes) and timing-safe verification (timingSafeEqual)
- `src/lib/triggers/manual-trigger.ts` - triggerManualRun mutation with optional entity data in envelope
- `src/lib/triggers/manual-trigger.test.ts` - 10 tests covering secret utils and manual trigger
- `src/app/api/webhooks/in/[workflowId]/[secret]/route.ts` - Public inbound webhook endpoint (no auth middleware)
- `src/app/api/v1/workflows/[id]/run/route.ts` - REST API trigger endpoint with withApiAuth
- `src/lib/mutations/workflows.ts` - Added regenerateWebhookSecret server action with authorization

## Decisions Made
- Used secret-in-URL path as sole authentication for inbound webhooks -- callers need no special headers
- All error states (invalid secret, inactive workflow, missing webhook trigger, nonexistent workflow) return 404 to prevent information leakage
- Authorization check on regenerateWebhookSecret ensures only the workflow creator can regenerate (and thereby invalidate old URLs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four trigger types now have their execution entry points: CRM event listener (25-02), schedule poller (25-03), webhook receiver (25-04 -- this plan), manual trigger (25-04 -- this plan)
- Webhook secret utilities ready for use by trigger configuration UI
- API trigger endpoint ready for external API consumers

---
*Phase: 25-trigger-system*
*Completed: 2026-03-28*
