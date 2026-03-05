# Custom Fields Reference

Complete reference for the Custom Fields feature in Pipelite. Custom fields allow you to extend entities with business-specific data.

## Overview

Custom fields extend the standard fields on organizations, people, deals, and activities. They let you capture data specific to your business needs without code changes.

### Key Concepts

- Custom fields are defined by administrators
- Each entity type can have different custom fields
- Multiple field types serve different data needs
- Formula fields calculate values automatically
- Custom fields appear in a dedicated section on entity pages

---

## Field Types

### Available Types

| Type | Description | Input Method |
|------|-------------|--------------|
| **Text** | Free-form text input | Text input field |
| **Number** | Numeric values | Number input |
| **Date** | Calendar dates | Date picker |
| **Boolean** | Yes/No values | Toggle switch |
| **Single-Select** | Choose one option | Dropdown |
| **Multi-Select** | Choose multiple options | Multi-select dropdown |
| **File** | File attachments | File upload |
| **URL** | Web links | URL input |
| **Lookup** | Link to other entities | Entity search |
| **Formula** | Calculated values | Automatic (read-only) |

---

## Field Type Details

### Text Fields

**Use for**: Names, descriptions, codes, notes

**Features**:
- Free-form text input
- No length limit (practically)
- Can store any characters
- Displayed as-is

**Example values**: `"Enterprise"`, `"Referral from John"`, `"VIP-2024-001"`

---

### Number Fields

**Use for**: Quantities, amounts, scores, percentages

**Features**:
- Validates numeric input only
- Supports decimals
- Can be negative (depending on use)
- Formatted per locale settings

**Example values**: `100`, `99.95`, `-5`, `0.25`

---

### Date Fields

**Use for**: Deadlines, milestones, contract dates

**Features**:
- Calendar picker interface
- Stored as ISO date (YYYY-MM-DD)
- Displayed in your locale format
- Can be cleared/emptied

**Example values**: `2024-12-31`, `2025-01-15`

---

### Boolean Fields

**Use for**: Yes/No flags, status indicators

**Features**:
- Toggle switch interface
- Values: Yes (true) / No (false)
- Default typically No/empty
- Instant save on toggle

**Example uses**: Active?, VIP customer?, Contract signed?

---

### Single-Select Fields

**Use for**: Status, priority, category, type

**Features**:
- Dropdown list of options
- Exactly one selection
- Options defined by administrator
- Cannot add new options (admin task)

**Example values**:
- Priority: Low, Medium, High, Critical
- Status: New, Active, Inactive, Archived
- Source: Website, Referral, Cold Call, Event

---

### Multi-Select Fields

**Use for**: Tags, multiple categories, features list

**Features**:
- Select multiple options
- Options shown as tags/chips
- Click to toggle each option
- Options defined by administrator

**Example values**:
- Features: API Access, SSO, Analytics, Reporting
- Interests: Product A, Product B, Service X
- Regions: North America, Europe, Asia-Pacific

---

### File Fields

**Use for**: Documents, contracts, images

**Features**:
- Upload via button or drag-drop
- File type restrictions (admin-configured)
- File size limits (admin-configured)
- Multiple files allowed (if configured)
- File preview/download available

**Supported operations**:
- Upload: Click or drag-drop
- View: Click filename to download
- Remove: Click X/delete button
- Reorder: Drag to reorder (multi-file)

---

### URL Fields

**Use for**: Website links, document links, external resources

**Features**:
- URL validation
- Auto-prefixes `https://` if missing
- Clickable link display
- Opens in new tab

**Example values**: `https://example.com`, `https://docs.company.com/contract.pdf`

---

### Lookup Fields

**Use for**: Related records, references, parent entities

**Features**:
- Search entities by name
- Links to organizations, people, deals, or activities
- Single selection
- Displays linked entity name

**Configuration**:
- Target entity type (org/person/deal/activity)
- Search fields (what to search on)

**Example uses**:
- Parent Organization (links to Organization)
- Primary Contact (links to Person)
- Related Deal (links to Deal)

---

### Formula Fields

**Use for**: Calculations, derived values, scores

**Features**:
- **Read-only**: Cannot be edited directly
- **Auto-calculated**: Updates when source fields change
- **Multiple return types**: Number, text, boolean, date
- **Error handling**: Shows error if calculation fails

**Formula Language**:

```
{field_name}           - Reference another field
+ - * /               - Arithmetic operators
( )                   - Grouping
DAYS(date1, date2)   - Days between dates
TODAY()               - Current date
IF(condition, a, b)  - Conditional
```

**Example formulas**:
- `{deal_value} * 0.1` — 10% commission
- `DAYS({close_date}, TODAY())` — Days until close
- `IF({score} > 80, "Hot", "Warm")` — Lead classification
- `{annual_revenue} / 12` — Monthly average

---

## Field Configuration (Administrator)

### Field Settings

Administrators configure:

| Setting | Description |
|---------|-------------|
| **Name** | Field display name |
| **Key** | Unique identifier (auto-generated) |
| **Entity Type** | Which entity (org/person/deal/activity) |
| **Field Type** | Data type from the list above |
| **Required** | Whether field must have a value |
| **Position** | Order in the custom fields section |

### Type-Specific Configuration

| Type | Additional Settings |
|------|---------------------|
| Single-Select | Options list, colors |
| Multi-Select | Options list, colors |
| File | Allowed file types, max size, multiple files |
| Number | Min/max values, decimal places |
| Lookup | Target entity type |
| Formula | Formula expression |

---

## Viewing Custom Fields

### Location on Entity Pages

1. Open any entity detail page (organization, person, deal, activity)
2. Scroll to the **Custom Fields** section
3. Click the section header to expand/collapse

### Section Layout

- Fields displayed in configured order
- Empty fields show placeholder text
- Formula fields shown last (separated)
- Editable fields are interactive

---

## Editing Custom Fields

### Inline Editing

Most fields support inline editing:
1. Click on the field value
2. Edit directly (or use picker)
3. Save on blur or Enter

### Immediate Save Pattern

Changes save automatically when:
- You click outside the field
- Press Enter
- Select from dropdown
- Toggle a boolean

### Validation

Fields validate on save:
- Required fields show error if empty
- Number fields reject non-numeric input
- URL fields validate format
- Lookup fields verify entity exists

---

## Custom Fields by Entity

### Organizations

Common custom fields:
- Industry (single-select)
- Company Size (single-select)
- Annual Revenue (number)
- Website (URL)
- Address (text)
- Account Tier (single-select)

### People

Common custom fields:
- Job Title (text)
- Department (single-select)
- Lead Source (single-select)
- Communication Preference (single-select)
- Birthday (date)

### Deals

Common custom fields:
- Lead Source (single-select)
- Probability (number/percentage)
- Competitor (text)
- Contract Length (number - months)
- Discount (number/percentage)
- Expected Commission (formula)

### Activities

Common custom fields:
- Priority (single-select)
- Outcome (single-select)
- Duration (number - minutes)
- Follow-up Required (boolean)

---

## Related Features

### Search & Filtering

Custom fields can be used in filters. See [Search & Filtering Reference](./search-filtering.md).

### Import/Export

Custom field values are included in imports/exports. Administrators manage this.

### API Access

Custom fields are accessible via REST API. See API documentation for details.

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Field not appearing | Check if admin created fields for this entity type |
| Can't edit field | Formula fields are read-only |
| Formula shows error | Verify all source fields have values |
| Options missing | Contact admin to add options |
| File won't upload | Check file type and size restrictions |

---

*Last updated: 2026-03-04*
