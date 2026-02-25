---
status: complete
phase: 06-activities
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md, 06-04-SUMMARY.md]
started: 2026-02-25T14:45:00Z
updated: 2026-02-25T15:15:00Z
previous_session: "06-UAT.md found Type dropdown broken. Gap closure 06-04 fixed by seeding activity types in Docker PostgreSQL."
---

## Current Test

[testing complete]

## Tests

### 1. Type Dropdown Verification
expected: Click "Add Activity", then click Type dropdown. It should expand showing 4 options (Call, Meeting, Task, Email) with icons.
result: pass

### 2. Create Activity with Type
expected: Select a type (e.g., Meeting), fill in title and due date, click Create. Activity appears in list with correct type icon.
result: pass

### 3. Link Activity to Deal
expected: In create dialog, Deal dropdown shows available deals. Selecting one links the activity. List shows deal name as clickable badge.
result: pass

### 4. Edit Activity
expected: Click edit icon on activity row. Dialog opens in edit mode with values pre-filled. Change and save. Changes reflect in list.
result: pass

### 5. Delete Activity
expected: In edit dialog, click Delete. Confirmation dialog appears. Confirm. Activity removed from list.
result: pass

### 6. Toggle Completion
expected: Click status checkbox on activity row. Toggles between completed (checkmark) and pending (empty). Completed shows strikethrough.
result: pass

### 7. Overdue Highlighting
expected: Activities past due date and not completed appear at top in highlighted "Overdue" section with red styling.
result: pass

### 8. Filter by Type
expected: Use Type filter dropdown. List shows only activities matching selected types.
result: pass

### 9. Filter by Status
expected: Use Status filter (All/Pending/Done/Overdue). List shows matching activities.
result: pass

### 10. Calendar View
expected: Click Calendar tab. Week-view calendar appears with activities positioned by due date/time. Navigation visible.
result: pass

### 11. Calendar Color Coding
expected: In calendar, activities show different colors by type (Call=blue, Meeting=green, Task=amber, Email=purple).
result: pass

### 12. Calendar Edit
expected: Click activity in calendar. Edit dialog opens. Make changes and save. Calendar updates.
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
