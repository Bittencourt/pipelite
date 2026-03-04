# People Reference

Complete reference for the People (Contacts) feature in Pipelite. People represent individual contacts within organizations.

## Overview

People are individual contacts in Pipelite. They represent the human connections within organizations — the people you talk to, email, and build relationships with.

### Key Concepts

- People are contacts associated with (or independent of) organizations
- Each person can be linked to one organization
- People can be associated with multiple deals
- Activities can be linked to people through deals

---

## Creating People

### Accessing People

Navigate to **People** in the main navigation bar or press `Alt + 3`.

### Create Dialog Fields

| Field | Required | Description |
|-------|----------|-------------|
| **First Name** | Yes | Person's first name |
| **Last Name** | Yes | Person's last name |
| **Email** | No | Email address |
| **Phone** | No | Phone number |
| **Organization** | No | Associated organization |
| **Notes** | No | Free-text notes about the person |

### Name Requirements

- First name and last name are both required
- Display name combines both: "First Last"
- People can share email addresses (no unique constraint)

---

## Person Fields

### Standard Fields

| Field | Type | Description |
|-------|------|-------------|
| **id** | UUID | Unique identifier |
| **firstName** | String | Person's first name |
| **lastName** | String | Person's last name |
| **email** | String | Email address (optional) |
| **phone** | String | Phone number (optional) |
| **organizationId** | UUID | Linked organization (optional) |
| **notes** | Text | Additional notes |
| **ownerId** | UUID | User who owns this record |
| **createdAt** | Timestamp | When the person was created |
| **updatedAt** | Timestamp | When last modified |
| **deletedAt** | Timestamp | When soft-deleted (null if active) |

### Organization Relationship

- People can exist without an organization (independent contacts)
- When linked, the organization name appears in the person list
- Organization link can be changed or removed at any time
- Deleting an organization doesn't delete linked people

### Custom Fields

People can have custom fields configured by administrators. Common examples:
- Job title
- Department
- Lead source
- Communication preference
- Birthday

See [Custom Fields Reference](./custom-fields.md) for more information.

---

## Managing People

### List View

The people list displays all active contacts with:

- Person name
- Email address
- Phone number
- Organization name (if linked)
- Owner name
- Creation date

#### List Features

- **Sorting**: Click column headers to sort
- **Pagination**: Navigate through large datasets
- **Organization filter**: Filter by linked organization
- **Search**: Use global search (`/` key) to find people

### Detail View

Click any person to open the detail panel showing:

1. **Basic Information**: Name, email, phone, notes
2. **Organization**: Linked organization (if any)
3. **Linked Deals**: Deals associated with this person
4. **Custom Fields**: Person-specific custom data
5. **Activities**: Recent activities related to this person

### Editing People

1. Open the person detail view
2. Click **Edit** button
3. Modify fields as needed
4. Click **Save Changes**

### Deleting People

1. Open the person detail view
2. Click **Delete** button
3. Confirm the deletion in the dialog

**Note**: Deletion is soft-delete. The person is marked as deleted but retained for data integrity.

---

## Person-Organization Relationship

### Linking to Organizations

1. When creating a person, select an organization from the dropdown
2. Or edit an existing person and add/change the organization
3. The organization is linked via the relationship field

### Unlinking from Organizations

1. Edit the person
2. Clear the organization field
3. Save changes

The person becomes independent but retains all other data.

### Viewing from Organization

When viewing an organization's detail page:
- All linked people appear in the "People" section
- Click any person name to navigate to their detail view

---

## Related Features

### Organizations

People are often linked to organizations. Each person belongs to at most one organization.

See [Organizations Reference](./organizations.md) for details.

### Deals

Deals can be linked to people, representing the contact involved in the opportunity.

See [Deals Reference](./deals.md) for details.

### Activities

Activities can reference people through linked deals.

See [Activities Reference](./activities.md) for details.

### Import/Export

Administrators can bulk import people data via CSV.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + 3` | Navigate to People |
| `n` | Create new person (when on people page) |
| `e` | Edit selected person |
| `d` | Delete selected person |
| `j` | Move to next person in list |
| `k` | Move to previous person in list |
| `Enter` | Open selected person |

See [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) for complete list.

---

## Best Practices

1. **Complete profiles** — Add email and phone when available
2. **Link to organizations** — Provides context and navigation
3. **Use consistent naming** — Helps with search and display
4. **Add notes for context** — Remember important details about contacts
5. **Keep data current** — Update when contact information changes

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Person appears twice | Check if duplicate; merge by reassigning deals, then delete |
| Organization not showing | Verify organization exists and isn't deleted |
| Email already exists | Multiple people can share emails — this is allowed |
| Can't find person | Use global search (`/` key) with partial name |

---

*Last updated: 2026-03-04*
