---
status: complete
phase: 03-people
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md
started: 2026-02-22T23:10:00Z
updated: 2026-02-22T23:22:00Z
---

## Current Test

[testing complete]

## Tests

### 1. People list page
expected: Navigate to /people. A page loads showing a data table with columns: Name (as a clickable link), Email, Phone, Organization, Owner, Created, and Actions. If no people exist yet, see an empty table with an "Add Person" button.
result: pass

### 2. People nav link
expected: The navigation header shows a "People" link with a user/contacts icon. Clicking it navigates to /people.
result: pass

### 3. Dashboard People card
expected: On the home page (/), the "People" card is a clickable link. Clicking it navigates to /people.
result: pass

### 4. Create person
expected: On /people, click "Add Person". A dialog opens with fields: First Name (required), Last Name (required), Email (optional), Phone (optional), Organization dropdown (optional, lists existing orgs), and Notes (optional). Fill in at least first/last name and submit. The dialog closes, a success toast appears, and the new person appears in the list.
result: pass

### 5. Person detail page
expected: Click a person's name link in the list. A detail page opens at /people/[id] showing all their fields: full name, email, phone, organization (as a clickable link if set), owner, and creation date. Edit and Delete buttons are visible.
result: pass

### 6. Edit person
expected: From the person detail page (or list actions), click Edit. The dialog opens pre-filled with the person's existing data including their selected organization. Change a field (e.g., email or organization) and save. The dialog closes with a success toast, and the updated data appears on the detail page or list.
result: pass

### 7. Delete person
expected: From the person detail page or list actions, click Delete. A confirmation dialog appears showing the person's name and asking to confirm. Confirm the deletion. The person is removed from the list (soft deleted). If on the detail page, you are redirected to /people.
result: pass

### 8. Linked people on org detail
expected: Navigate to an organization's detail page (/organizations/[id]). Below the org details card, there is a "People" section. If any people are linked to that org, they appear as a list with their name as a clickable link to their detail page. If no people are linked, the section shows an empty state message.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
