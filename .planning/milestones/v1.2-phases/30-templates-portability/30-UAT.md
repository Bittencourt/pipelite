---
status: complete
phase: 30-templates-portability
source: [30-01-SUMMARY.md, 30-02-SUMMARY.md, 30-03-SUMMARY.md]
started: 2026-03-28T20:45:00Z
updated: 2026-03-28T21:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create Workflow Dialog with Templates
expected: Click "New Workflow" on the workflows page. A dialog opens showing "Create Workflow" title, a "Blank Workflow" card at top, a separator "Or start from a template", and 4 template cards in a 2-column grid: Scheduled API Sync, Webhook Notifier, Data Pipeline, Email Digest.
result: pass

### 2. Create Workflow from Template
expected: In the create dialog, click one of the template cards (e.g. "Webhook Notifier"). A loading spinner appears, then you're navigated to the workflow editor with the workflow pre-populated with the template's name, trigger, and nodes.
result: pass

### 3. HTTP Template Selector in Config Form
expected: Open a workflow editor, add/select an HTTP action node. Above the Method field, there's a "Template" dropdown with placeholder "Load from template...". Clicking it shows a "Built-in" group with 6 templates: Slack, Discord, Planka, Apprise, Tally, Typeform.
result: pass

### 4. Apply HTTP Template
expected: Select a built-in template (e.g. "Slack Post Message") from the dropdown. All HTTP config fields (method, URL, headers, body, timeout, retry count) are silently overwritten with the template's values. A "Template loaded" toast appears.
result: pass

### 5. Save as HTTP Template
expected: After configuring an HTTP node, click "Save as Template" button below the retry count field. A dialog opens titled "Save as HTTP Template" with name and description fields. Enter a name and click "Save Template". A "Template saved" toast appears.
result: pass

### 6. Custom Template in Dropdown
expected: After saving a custom template, the template dropdown now shows a "Custom" group below "Built-in" with your saved template. Selecting it applies its config just like built-in templates.
result: pass

### 7. Delete Custom Template
expected: Below the template dropdown, click "Manage custom templates" to expand a list of your custom templates with trash icons. Click the trash icon, confirm in the dialog "Delete template...? This cannot be undone." The template is removed and a toast confirms deletion.
result: pass

### 8. Export Workflow as JSON
expected: In the workflow editor toolbar, click "Export JSON". A .json file downloads with the workflow name as filename. Opening the file shows `schemaVersion: "pipelite/v1"`, workflow name, triggers, and nodes. Any Authorization/token headers have values replaced with `{{PLACEHOLDER}}`.
result: pass

### 9. Import Workflow from JSON
expected: In the workflow editor toolbar, click "Import JSON". A file picker opens for .json files. Select a previously exported workflow file. A "Workflow imported successfully" toast appears and you're navigated to the new workflow's editor. If the name conflicts, " (Imported)" is appended.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
