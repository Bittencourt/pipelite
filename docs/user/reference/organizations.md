# Organizations Reference

Complete reference for the Organizations feature in Pipelite. Organizations represent companies, accounts, or entities you do business with.

## Overview

Organizations are one of the core entities in Pipelite. They represent companies, businesses, or accounts that you're tracking. Organizations can have associated people (contacts), deals, and activities.

### Key Concepts

- Organizations are independent entities owned by users
- Each organization can have multiple people (contacts) associated with it
- Deals and activities can be linked to organizations
- Custom fields extend organization data with business-specific information

---

## Creating Organizations

### Accessing Organizations

Navigate to **Organizations** in the main navigation bar or press `Alt + 2`.

### Create Dialog Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Organization name (company, account name) |
| **Notes** | No | Free-text notes about the organization |

### Creation Methods

1. **Direct Creation**: Click **New Organization** button
2. **From Person Dialog**: Create organization while adding a person
3. **Import**: Bulk import via CSV file (admin feature)

---

## Organization Fields

### Standard Fields

| Field | Type | Description |
|-------|------|-------------|
| **id** | UUID | Unique identifier |
| **name** | String | Organization name |
| **notes** | Text | Additional notes and context |
| **ownerId** | UUID | User who owns this record |
| **createdAt** | Timestamp | When the organization was created |
| **updatedAt** | Timestamp | When last modified |
| **deletedAt** | Timestamp | When soft-deleted (null if active) |

### Custom Fields

Organizations can have custom fields configured by administrators. Common examples:
- Industry
- Company size
- Annual revenue
- Website URL
- Address
- Account status

See [Custom Fields Reference](./custom-fields.md) for more information.

---

## Managing Organizations

### List View

The organizations list displays all active organizations with:

- Organization name
- Number of associated people
- Number of associated deals
- Owner name
- Creation date

#### List Features

- **Sorting**: Click column headers to sort
- **Pagination**: Navigate through large datasets
- **Search**: Use global search (`/` key) to find organizations

### Detail View

Click any organization to open the detail panel showing:

1. **Basic Information**: Name, notes, timestamps
2. **Linked People**: All contacts associated with this organization
3. **Linked Deals**: All deals for this organization
4. **Custom Fields**: Organization-specific custom data
5. **Activities**: Recent activities related to this organization

### Editing Organizations

1. Open the organization detail view
2. Click **Edit** button
3. Modify fields as needed
4. Click **Save Changes**

### Deleting Organizations

1. Open the organization detail view
2. Click **Delete** button
3. Confirm the deletion in the dialog

**Note**: Deletion is soft-delete. The organization is marked as deleted but retained in the database for data integrity.

---

## Related Features

### People

Organizations are often linked to people (contacts). Each person can belong to one organization.

See [People Reference](./people.md) for details.

### Deals

Deals represent sales opportunities and can be linked to organizations.

See [Deals Reference](./deals.md) for details.

### Activities

Activities (calls, meetings, tasks, emails) can be associated with organizations through linked deals.

See [Activities Reference](./activities.md) for details.

### Custom Fields

Extend organizations with custom data fields specific to your business needs.

See [Custom Fields Reference](./custom-fields.md) for details.

### Import/Export

Administrators can bulk import and export organization data.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + 2` | Navigate to Organizations |
| `n` | Create new organization (when on organizations page) |
| `e` | Edit selected organization |
| `d` | Delete selected organization |
| `j` | Move to next organization in list |
| `k` | Move to previous organization in list |
| `Enter` | Open selected organization |

See [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) for complete list.

---

## Best Practices

1. **Keep names consistent** — Use official company names for easy searching
2. **Add notes for context** — Include relevant business context
3. **Link people promptly** — Associate contacts as soon as they're identified
4. **Use custom fields** — Capture business-specific data
5. **Regular cleanup** — Archive or delete inactive organizations

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Duplicate organizations | Merge by reassigning people/deals, then delete |
| Missing custom field data | Check with administrator about field configuration |
| Can't find organization | Use global search (`/` key) with partial name |
| Organization not in dropdown | Verify it wasn't soft-deleted |

---

*Last updated: 2026-03-04*
