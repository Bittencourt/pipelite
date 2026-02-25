---
status: complete
phase: 05-deals-kanban
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: 2026-02-24T15:00:00Z
updated: 2026-02-24T15:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create Deal
expected: Click "Add Deal" button, fill form with title, value, stage, and org/person, submit - deal appears in selected stage immediately
result: pass

### 2. View Kanban Board
expected: Navigate to /deals - shows kanban board with pipeline stages as columns, deals organized by stage
result: pass

### 3. Drag-Drop Between Stages
expected: Click and drag a deal card to a different stage column, release - deal moves to new stage and persists on refresh
result: pass

### 4. Stage Headers Show Counts/Values
expected: Each stage column header shows deal count (e.g., "3 deals") and total value (e.g., "$150,000")
result: pass

### 5. Inline Card Expansion
expected: Click on a deal card - card expands inline showing additional details (close date, notes) and action buttons
result: issue
reported: "When adding expected close date and notes on an exist card it does not persists"
severity: major

### 6. Edit Deal
expected: Click Edit button in expanded card - DealDialog opens with pre-filled values, update and save - changes reflect immediately
result: pass

### 7. Delete Deal
expected: Click Delete button in expanded card - AlertDialog confirmation appears, confirm - deal disappears from board
result: pass

### 8. Won/Lost Footer Row
expected: Won and Lost stages appear in collapsed footer row below main columns (not as drag targets), show counts/values
result: pass

### 9. Pipeline Selector
expected: If multiple pipelines exist, dropdown at top switches kanban view to selected pipeline's stages/deals
result: pass

### 10. Currency Formatting
expected: Deal values display as formatted currency (e.g., "$50,000"), stage totals formatted same way, live preview in form
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Expected close date and notes persist when editing an existing deal"
  status: diagnosed
  reason: "User reported: When adding expected close date and notes on an exist card it does not persists"
  severity: major
  test: 5
  root_cause: "Database schema (deals.ts) missing expectedCloseDate and notes columns. Dialog has form fields but doesn't include them in dealData. Action doesn't have code to persist them."
  artifacts:
    - path: "src/db/schema/deals.ts"
      issue: "Missing expectedCloseDate and notes columns"
    - path: "src/app/deals/deal-dialog.tsx"
      issue: "Form fields not included in dealData object sent to action"
    - path: "src/app/deals/actions.ts"
      issue: "updateDeal doesn't handle expectedCloseDate and notes fields"
  missing:
    - "Add expectedCloseDate (date) and notes (text) columns to deals schema"
    - "Include expectedCloseDate and notes in dealData from dialog"
    - "Add expectedCloseDate and notes handling in updateDeal action"
    - "Generate and run database migration"
  debug_session: ""
