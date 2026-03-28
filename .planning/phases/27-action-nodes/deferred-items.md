# Deferred Items - Phase 27

## Pre-existing: http.test.ts broken by crm.ts DB import chain

- **File:** src/lib/execution/actions/__tests__/http.test.ts
- **Issue:** `import "./crm"` in index.ts triggers mutations -> db import chain, causing DATABASE_URL error in tests that import from `../index`
- **Introduced by:** Plan 27-02 (crm action handler registration)
- **Fix:** Update http.test.ts to use direct registry import pattern (same as transform.test.ts and webhook-response.test.ts)
- **Priority:** Low (test isolation issue, not a runtime bug)
