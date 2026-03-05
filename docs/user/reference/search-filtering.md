# Search & Filtering Reference

Complete reference for the Search and Filtering features in Pipelite. Find anything quickly and filter lists to show exactly what you need.

## Overview

Pipelite provides powerful search and filtering capabilities to help you find records quickly and focus on relevant data. Global search finds across all entity types, while list filters help narrow down results.

### Key Concepts

- Global search finds across all entities
- Keyboard shortcut `/` focuses search instantly
- Results are grouped by entity type
- Filters are saved in URLs for sharing
- Filter states persist during session

---

## Global Search

### Accessing Search

- Press `/` key from anywhere in the application
- Or click the search icon in the navigation header
- Search input appears in the header area

### Search Behavior

1. Type your search query (minimum 2 characters to trigger search)
2. Results appear in a dropdown below the input
3. Results are grouped by entity type
4. Matched text is highlighted in yellow

### Search Scope

Global search finds matches in:

| Entity | Fields Searched |
|--------|-----------------|
| **Organizations** | Name |
| **People** | First name, Last name, Email |
| **Deals** | Title |
| **Activities** | Title |

### Search Results

Results are displayed in a dropdown with:
- Entity icon (type indicator)
- Entity name/title
- Matched text (highlighted)
- Related info (organization, stage)

![Global search dropdown](../images/global-search.png)

### Keyboard Navigation in Search

| Key | Action |
|-----|--------|
| `/` | Open search / focus input |
| `↓` / `↑` | Navigate results |
| `Enter` | Select result |
| `Escape` | Close search |

### Result Limit

Search returns up to 5 results per entity type, ensuring fast response times while showing comprehensive coverage.

---

## Filtering Lists

### Available Filter Locations

Lists support filtering in these areas:
- **Activities**: Filter by type, status, date range
- **Deals**: Filter by pipeline, stage

### Activities Filtering

#### Filter by Type

Select from the Type dropdown:
- All Types
- Calls
- Meetings
- Tasks
- Emails

#### Filter by Status

Toggle between:
- **Pending**: Activities not yet completed
- **Completed**: Finished activities
- **All**: Everything

#### Filter by Date Range

Date filter options:
- **Overdue**: Past due date, not completed
- **Today**: Due today
- **This Week**: Due within current week
- **Custom Range**: Select specific dates

#### Overdue Section

Overdue activities automatically appear in a highlighted section at the top of the list, ensuring critical follow-ups aren't missed.

### Deals Filtering

#### Filter by Pipeline

If multiple pipelines exist:
1. Use the pipeline selector in the header
2. Select the pipeline to view
3. Kanban board updates to show that pipeline's deals

#### Filter by Stage

Currently, deals are viewed via the kanban board organized by stage. Additional filtering options may be available based on configuration.

---

## URL-Based Filters

### How It Works

Filter selections are saved in the URL:

```
/activities?type=call&status=pending&date=this_week
/deals?pipeline=uuid-here
```

### Benefits

1. **Shareable Links**: Send filtered views to team members
2. **Bookmarks**: Save common filter combinations
3. **Back Button**: Return to previous filter state
4. **Direct Navigation**: Type URL with parameters

### URL Parameters

| Page | Parameter | Values |
|------|-----------|--------|
| Activities | `type` | call, meeting, task, email |
| Activities | `status` | pending, completed, all |
| Activities | `overdue` | true, false |
| Deals | `pipeline` | Pipeline UUID |

---

## Search Tips

### Effective Queries

- **Partial matches work**: "Acme" finds "Acme Corporation"
- **Case-insensitive**: "john" finds "John Smith"
- **Email search**: Search by domain ("@company.com")
- **Multiple words**: Searches each word separately

### When to Use Search

| Need | Approach |
|------|----------|
| Find specific record | Global search (`/`) |
| Browse filtered list | Use list filters |
| Find related records | Navigate from detail pages |
| Recent items | Check recent activity |

---

## Search Debouncing

Search uses 300ms debouncing to balance:
- Responsiveness (results appear quickly)
- Server load (not querying on every keystroke)
- User experience (no flickering results)

Type steadily — results appear after you pause briefly.

---

## Match Highlighting

### How It Works

- Matching text has yellow background
- Highlights appear in dropdown results
- Makes it easy to identify why a result matched

### Example

Search: "john"

Results show:
- **John** Smith (match in first name)
- Mary **John**son (match in last name)
- **john**@company.com (match in email)

---

## Related Features

### Keyboard Shortcuts

Search has dedicated shortcuts. See [Keyboard Shortcuts Reference](./keyboard-shortcuts.md).

### Organizations/People/Deals/Activities

Search finds across all entities. See individual reference docs:
- [Organizations Reference](./organizations.md)
- [People Reference](./people.md)
- [Deals Reference](./deals.md)
- [Activities Reference](./activities.md)

---

## Common Issues

| Issue | Solution |
|-------|----------|
| No results found | Check spelling; try partial matches |
| Search too slow | Wait for debounce; check network |
| Results not relevant | Try more specific query |
| Can't find record | Record may be deleted; check with admin |
| Filter won't apply | Clear filters and try again |

---

## Best Practices

1. **Use keyboard shortcut** — `/` is faster than clicking
2. **Type partial names** — Often sufficient to find results
3. **Use filters for lists** — Better than search for browsing
4. **Share filtered URLs** — Help teammates see same view
5. **Clear filters when done** — Avoid confusion later

---

*Last updated: 2026-03-04*
