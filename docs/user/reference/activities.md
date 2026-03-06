# Activities Reference

Complete reference for the Activities feature in Pipelite. Activities track tasks, calls, meetings, and emails for follow-ups.

## Overview

Activities are the action items in Pipelite. They represent tasks, calls, meetings, and emails that need to be completed. Activities help you stay on top of follow-ups and never miss important deadlines.

### Key Concepts

- Activities have four types: Call, Meeting, Task, Email
- Each activity has a due date and optional time
- Activities can be linked to deals for context
- Overdue activities are highlighted for attention
- Calendar view provides a timeline perspective

---

## Activity Types

### Available Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Call** | Phone conversations | Follow-up calls, check-ins |
| **Meeting** | Scheduled meetings | Demos, presentations, reviews |
| **Task** | Action items | Preparation, research, internal work |
| **Email** | Email follow-ups | Sending information, proposals |

### Type Indicators

Each type is color-coded throughout the interface:
- **Call**: Blue (#3B82F6)
- **Meeting**: Green (#10B981)
- **Task**: Yellow (#F59E0B)
- **Email**: Purple (#8B5CF6)

---

## Creating Activities

### Accessing Activities

Navigate to **Activities** in the main navigation bar.

### Create Dialog Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Type** | Yes | Call, Meeting, Task, or Email |
| **Title** | Yes | Brief description of the activity |
| **Due Date** | Yes | When the activity should be completed |
| **Due Time** | No | Specific time (useful for meetings, calls) |
| **Deal** | No | Associated deal for context |
| **Notes** | No | Detailed information about the activity |

### Title Best Practices

- **Call**: "Follow up on pricing with John"
- **Meeting**: "Demo for Acme Corp executives"
- **Task**: "Prepare proposal for Smith deal"
- **Email**: "Send case studies to contact"

---

## Activity Fields

### Standard Fields

| Field | Type | Description |
|-------|------|-------------|
| **id** | UUID | Unique identifier |
| **title** | String | Activity description |
| **typeId** | String | Activity type (call/meeting/task/email) |
| **dueDate** | Timestamp | When activity is due |
| **dealId** | UUID | Linked deal (optional) |
| **notes** | Text | Detailed information |
| **completedAt** | Timestamp | When marked complete (null if pending) |
| **ownerId** | UUID | User who owns this activity |
| **createdAt** | Timestamp | When created |
| **updatedAt** | Timestamp | When last modified |
| **deletedAt** | Timestamp | When soft-deleted (null if active) |

### Custom Fields

Activities can have custom fields for:
- Priority level
- Outcome/Result
- Duration
- Follow-up required

See [Custom Fields Reference](./custom-fields.md) for more information.

---

## List View

### Overview

The default view shows all activities in a sortable, filterable list.

### List Columns

- **Checkbox**: Mark as complete
- **Type**: Activity type icon
- **Title**: Activity description
- **Due Date**: Formatted date/time
- **Deal**: Linked deal title
- **Status**: Overdue indicator

### Overdue Highlighting

Activities past their due date:
- Appear in a special "Overdue" section at the top
- Show red highlighting in the main list
- Display relative time (e.g., "2 days overdue")

### Sorting Options

- Due date (ascending/descending)
- Type
- Creation date
- Completion status

---

## Calendar View

### Overview

Click the **Calendar** tab to see activities on a timeline.

### Calendar Features

- Activities appear as events on their due dates
- Color-coded by activity type
- Week view as default
- Navigate with arrow buttons or "Today" button

### Calendar Interactions

- **Click activity**: View details
- **Navigate weeks**: Previous/Next arrows
- **Jump to today**: "Today" button
- **Switch views**: Week/Month (if available)

---

## Filtering Activities

### Filter by Type

Use the **Type** dropdown to show:
- All types
- Calls only
- Meetings only
- Tasks only
- Emails only

### Filter by Status

- **Pending**: Not yet completed
- **Completed**: Finished activities
- **All**: Everything

### Filter by Date Range

- Overdue only
- Today
- This week
- Custom range

### URL-Based Filters

Filter selections are saved in the URL, so you can:
- Share filtered views with team members
- Bookmark specific filter combinations
- Return to your preferred view easily

---

## Completing Activities

### From List View

1. Click the checkbox in the activity row
2. Or click **Mark Complete** in the detail view
3. The `completedAt` timestamp is set
4. Activity moves to completed section

### From Deal View

1. Open deal details
2. Find activity in the Activities section
3. Click **Mark Complete**

### Completion Behavior

- `completedAt` field is set to current timestamp
- Activity no longer appears in overdue section
- Activity shows completion date in lists
- Linked deals retain activity history

---

## Deal Linking

### Why Link Activities to Deals

- Context: See why an activity was created
- History: Review all follow-ups for a deal
- Pipeline: Understand deal progress through activities

### Linking Process

1. When creating/editing, select a deal from the dropdown
2. Search by deal title or organization name
3. Activity appears on both:
   - Main activities page
   - Deal's detail view under Activities section

### Unlinking

Edit the activity and clear the deal field.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `n` | Create new activity |
| `e` | Edit selected activity |
| `d` | Delete selected activity |
| `j` | Move to next activity |
| `k` | Move to previous activity |
| `Enter` | Open selected activity |
| `Space` | Toggle completion (when selected) |

See [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) for complete list.

---

## Related Features

### Deals

Link activities to deals for context. See [Deals Reference](./deals.md).

### Custom Fields

Extend activities with custom data. See [Custom Fields Reference](./custom-fields.md).

### Search

Find activities using global search (`/` key). See [Search & Filtering Reference](./search-filtering.md).

---

## Best Practices

1. **Create immediately** — Don't rely on memory
2. **Be specific with titles** — "Call John about Q4 pricing" not "Follow up"
3. **Set realistic due dates** — Improves pipeline accuracy
4. **Link to deals** — Maintains context and history
5. **Complete when done** — Keeps pipeline current
6. **Add notes for context** — Remember important details

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Activity not showing | Check filters and completion status |
| Overdue not updating | Refresh page; check due date |
| Can't link deal | Verify deal exists and isn't deleted |
| Calendar empty | Check if activities have due dates |

---

*Last updated: 2026-03-04*
