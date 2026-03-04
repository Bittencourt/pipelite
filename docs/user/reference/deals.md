# Deals Reference

Complete reference for the Deals feature in Pipelite. Deals represent sales opportunities tracked through your pipeline stages.

## Overview

Deals are the core revenue-tracking entity in Pipelite. They represent sales opportunities that move through pipeline stages from initial contact to closed (won or lost).

### Key Concepts

- Deals exist within pipeline stages
- Each deal must be linked to an organization and/or person
- Deals can have activities (calls, meetings, tasks) associated with them
- Deal values contribute to pipeline forecasting
- Custom fields extend deals with business-specific data

---

## Creating Deals

### Accessing Deals

Navigate to **Deals** in the main navigation bar or press `Alt + 4`.

### Create Dialog Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Title** | Yes | Deal name/description |
| **Value** | No | Potential deal value in your currency |
| **Organization** | Yes* | Associated organization |
| **Person** | Yes* | Contact person |
| **Stage** | Yes | Starting pipeline stage |
| **Expected Close Date** | No | Anticipated closing date |
| **Notes** | No | Additional deal information |

*At least one of Organization or Person must be selected.

### Value Formatting

- Values are displayed in your configured currency
- Number formatting follows your locale settings
- Values are stored as numbers for calculations

---

## Deal Fields

### Standard Fields

| Field | Type | Description |
|-------|------|-------------|
| **id** | UUID | Unique identifier |
| **title** | String | Deal name/title |
| **value** | Number | Deal value (optional) |
| **stageId** | UUID | Current pipeline stage |
| **organizationId** | UUID | Linked organization |
| **personId** | UUID | Linked person |
| **expectedCloseDate** | Date | Anticipated close date |
| **notes** | Text | Additional notes |
| **position** | Number | Sort position within stage |
| **ownerId** | UUID | User who owns this deal |
| **createdAt** | Timestamp | When created |
| **updatedAt** | Timestamp | When last modified |
| **deletedAt** | Timestamp | When soft-deleted (null if active) |

### Custom Fields

Deals commonly have custom fields for:
- Lead source
- Probability percentage
- Competitor information
- Product/service type
- Contract length
- Discount percentage

See [Custom Fields Reference](./custom-fields.md) for more information.

---

## Kanban Board View

### Overview

The kanban board is the primary view for managing deals:

- **Columns** represent pipeline stages
- **Cards** represent individual deals
- **Drag and drop** moves deals between stages
- **Terminal stages** (Won/Lost) appear in a collapsed footer

### Kanban Navigation

| Control | Action |
|---------|--------|
| Horizontal scroll | View all stages |
| Click card | Open deal details |
| Drag card | Move to different stage |

### Keyboard Navigation in Kanban

| Shortcut | Action |
|----------|--------|
| `h` | Move selection left (previous stage) |
| `l` | Move selection right (next stage) |
| `j` | Move selection down (next deal in stage) |
| `k` | Move selection up (previous deal in stage) |
| `Enter` | Open selected deal |
| `n` | Create new deal |
| `e` | Edit selected deal |

### Stage Columns

- Shows stage name and deal count
- Total value displayed at bottom
- Won/Lost stages in special footer row
- Empty stages still visible for navigation

### Deal Cards

Each card displays:
- Deal title
- Organization name
- Deal value
- Contact person (if linked)
- Visual selection indicator (when using keyboard nav)

---

## Stage Movement

### Via Drag and Drop

1. Click and hold a deal card
2. Drag to the target stage column
3. Release to drop
4. Position saves automatically

### Via Edit Dialog

1. Open deal details
2. Click **Edit**
3. Select new stage from dropdown
4. Save changes

### Via Keyboard

1. Select a deal using `j/k` keys
2. Press `h` or `l` to move to adjacent stage
3. Press `Enter` to confirm

### Terminal Stages

- **Won**: Successfully closed deals
- **Lost**: Deals that didn't close
- Moving to these stages marks the deal as closed
- Closed deals can be reopened by moving to active stage

---

## Deal Detail View

Click any deal card to open the detail panel:

### Information Shown

1. **Basic Info**
   - Title, value, stage
   - Expected close date
   - Creation/update timestamps

2. **Relationships**
   - Linked organization
   - Linked person

3. **Custom Fields**
   - All custom field values for this deal
   - Formula field calculations

4. **Activities**
   - All activities linked to this deal
   - Create new activities directly

5. **Notes**
   - Free-text notes field

### Actions Available

- **Edit**: Modify deal details
- **Delete**: Remove the deal
- **Add Activity**: Create linked activity

---

## Related Features

### Pipelines and Stages

Deals exist within pipeline stages. See [Pipelines & Kanban Reference](./pipelines-kanban.md) for details.

### Organizations

Deals are linked to organizations. See [Organizations Reference](./organizations.md) for details.

### People

Deals can be linked to contacts. See [People Reference](./people.md) for details.

### Activities

Track follow-ups through activities. See [Activities Reference](./activities.md) for details.

### Custom Fields

Extend deals with custom data. See [Custom Fields Reference](./custom-fields.md) for details.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + 4` | Navigate to Deals |
| `n` | Create new deal |
| `e` | Edit selected deal |
| `d` | Delete selected deal |
| `h/l` | Move between stages (kanban) |
| `j/k` | Move between deals (kanban/list) |
| `Enter` | Open selected deal |

See [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) for complete list.

---

## Best Practices

1. **Descriptive titles** — Include company and opportunity type
2. **Keep values updated** — Improves forecasting accuracy
3. **Always link contacts** — Maintains relationship context
4. **Use activities** — Never lose track of next steps
5. **Update stages promptly** — Keeps pipeline accurate

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Deal not in kanban | Check stage assignment and filters |
| Can't drag to stage | Verify stage exists and isn't terminal |
| Value formatting wrong | Check locale/currency settings |
| Missing from forecasts | Ensure stage isn't Won/Lost |

---

*Last updated: 2026-03-04*
