---
phase: 27-action-nodes
plan: 01
subsystem: execution
tags: [http, ssrf, interpolation, zod, fetch, retry, backoff, action-handler]

requires:
  - phase: 26-execution-engine-flow-control
    provides: "Engine with action node stubs, condition evaluator with resolveFieldPath, execution types"
provides:
  - "Variable interpolation engine ({{path}} syntax) for all action handlers"
  - "Action handler registry with dispatch (registerAction/executeAction)"
  - "Zod config schemas for all 6 action types"
  - "SSRF prevention (private IP, metadata endpoint, protocol blocking)"
  - "HTTP request action handler with retry/backoff/timeout"
  - "Engine integration replacing stubs with real action dispatch"
affects: [27-action-nodes, 28-visual-editor, 29-workflow-ui]

tech-stack:
  added: []
  patterns: ["registry pattern for action handler dispatch", "separated registry.ts to break circular dependency", "fetchWithTimeout with AbortController", "exponential backoff retry loop"]

key-files:
  created:
    - src/lib/execution/actions/interpolate.ts
    - src/lib/execution/actions/types.ts
    - src/lib/execution/actions/index.ts
    - src/lib/execution/actions/registry.ts
    - src/lib/execution/actions/ssrf.ts
    - src/lib/execution/actions/http.ts
    - src/lib/execution/actions/__tests__/interpolate.test.ts
    - src/lib/execution/actions/__tests__/ssrf.test.ts
    - src/lib/execution/actions/__tests__/http.test.ts
  modified:
    - src/lib/execution/engine.ts
    - src/lib/execution/engine.test.ts

key-decisions:
  - "Separated registry.ts from index.ts to avoid circular dependency (http.ts imports registerAction, index.ts imports http.ts)"
  - "Static side-effect import for handler registration (import ./http) instead of dynamic import for deterministic loading"
  - "SSRF checks resolved IPs via dns.resolve to catch DNS rebinding; IP literals checked directly when DNS fails"
  - "Response content-type detection for JSON vs text parsing in HTTP handler"

patterns-established:
  - "Action handler registration: import registerAction from ./registry, call registerAction(type, handler) at module scope"
  - "Variable interpolation: interpolate() for strings, interpolateDeep() for nested objects, both reuse resolveFieldPath from condition-evaluator"
  - "HTTP retry: 0 to retryCount attempts with Math.pow(2, attempt-1) * 1000ms backoff between retries"

requirements-completed: [ACT-01, ACT-06]

duration: 6min
completed: 2026-03-28
---

# Phase 27 Plan 01: Action Node Foundation Summary

**Variable interpolation engine, SSRF-protected HTTP handler with retry/backoff, action registry with 6 Zod config schemas, engine dispatch integration**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T03:10:10Z
- **Completed:** 2026-03-28T03:16:43Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Variable interpolation resolves {{trigger.data.field}} and {{nodes.nodeId.output.field}} with object JSON-stringify and missing-path-to-empty-string handling
- SSRF prevention blocks private IPs (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16), IPv6 loopback/private, metadata endpoints, and non-HTTP protocols via DNS resolution
- HTTP action handler makes real requests with interpolated URL/headers/body, configurable timeout (5-120s) via AbortController, and retry with exponential backoff (1s, 2s, 4s)
- Zod schemas validate configs for all 6 action types (http_request, crm_action, email, notification, javascript_transform, webhook_response)
- Engine dispatches to real action handlers instead of returning stubs

## Task Commits

Each task was committed atomically:

1. **Task 1: Variable interpolation, config schemas, handler registry, SSRF** - `7fbc4b4` (feat)
2. **Task 2: HTTP handler with retry/backoff and engine integration** - `e58cfb4` (feat)

## Files Created/Modified
- `src/lib/execution/actions/interpolate.ts` - {{path}} variable interpolation using resolveFieldPath
- `src/lib/execution/actions/types.ts` - Zod schemas for all 6 action type configs
- `src/lib/execution/actions/registry.ts` - Handler map with registerAction/getHandler (cycle-free)
- `src/lib/execution/actions/index.ts` - executeAction dispatch + side-effect handler registration
- `src/lib/execution/actions/ssrf.ts` - SSRF prevention via DNS resolution and IP range checks
- `src/lib/execution/actions/http.ts` - HTTP request handler with retry, timeout, interpolation
- `src/lib/execution/actions/__tests__/interpolate.test.ts` - 10 interpolation tests
- `src/lib/execution/actions/__tests__/ssrf.test.ts` - 9 SSRF validation tests
- `src/lib/execution/actions/__tests__/http.test.ts` - 10 HTTP handler tests
- `src/lib/execution/engine.ts` - Replaced action stubs with executeAction dispatch
- `src/lib/execution/engine.test.ts` - Added mock for ./actions module

## Decisions Made
- Separated registry.ts from index.ts to break circular dependency (http.ts imports registerAction, index.ts imports http.ts via side-effect)
- Used static side-effect import (`import "./http"`) for deterministic handler registration instead of dynamic `import("./http")`
- SSRF validates resolved IPs via dns.resolve to catch DNS rebinding; falls back to direct IP check when DNS fails
- HTTP response parsed as JSON when content-type includes application/json, otherwise as text

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Separated registry.ts to break circular dependency**
- **Found during:** Task 2 (Engine integration)
- **Issue:** `index.ts` had circular dependency with `http.ts` -- static import of `./http` caused `Cannot access 'handlers' before initialization`
- **Fix:** Extracted handler map and registerAction into `registry.ts`; `http.ts` imports from `registry.ts`, `index.ts` imports from both
- **Files modified:** `src/lib/execution/actions/registry.ts` (new), `src/lib/execution/actions/index.ts`, `src/lib/execution/actions/http.ts`
- **Verification:** All 29 action tests pass, all 95 execution tests pass
- **Committed in:** `e58cfb4`

**2. [Rule 1 - Bug] Updated engine.test.ts to mock action dispatch**
- **Found during:** Task 2 (Engine integration)
- **Issue:** Existing engine tests used action nodes without actionType config, causing `No handler registered` errors after stub removal
- **Fix:** Added `vi.mock("./actions")` returning stub output in engine.test.ts
- **Files modified:** `src/lib/execution/engine.test.ts`
- **Verification:** All 7 engine tests pass
- **Committed in:** `e58cfb4`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Action handler registry and interpolation engine ready for Wave 2 action handlers (CRM, email, notification, JS transform, webhook response)
- All 6 Zod config schemas defined and ready for visual editor config panels (Phase 28)
- HTTP action is fully functional end-to-end with SSRF protection

---
*Phase: 27-action-nodes*
*Completed: 2026-03-28*
