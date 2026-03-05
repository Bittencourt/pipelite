# Custom Fields Management

## Overview

Custom fields allow administrators to extend Pipelite entities with additional data fields. Each custom field captures specific information relevant to your business needs.

### Who can manage custom fields?
- **Only administrators** can create, edit, and delete custom fields
- **All users** can view and fill in custom fields (based on permissions)

### What entities support custom fields?
- **Organizations**: Company-specific data (industry, size, revenue)
- **People**: Contact-specific data (birthday, preferences, skills)
- **Deals**: Deal-specific data (probability, competitors, contract terms)
- **Activities**: Activity-specific data (duration, outcome, follow-up)

## Accessing Custom Fields

### Navigation
1. **Open** admin panel: `/admin`
2. **Click** "Custom Fields"** in the sidebar
3. **Select entity type** from tabs:
   - Organizations
   - People
   - Deals
   - Activities

### Field List View
- **Field name** and **type**
- **Required** status
- **Position** (order)
- **Configuration** (for select fields)
- **Actions**: Edit, Delete

 Reorder

## Creating Custom Fields

### Add Field Process
1. **Click** "Add Field"** button
2. **Configure field**:
   - **Name**: Field label (displayed to users)
   - **Type**: Field data type (see Field Types)
   - **Required**: Whether field is mandatory
   - **Configuration**: Type-specific settings (options, formula)
3. **Save** field

### Field Configuration

#### Basic Settings
- **Name**: Clear, descriptive label
  - **Good**: "Industry Type", "Company Size", "Annual Revenue"
  - **Bad**: "Field 1", "Custom Data"
- **Type**: See Field Types table below
- **Required**: Check if field must be filled
  - **Required fields** prevent saving without value
  - **Optional fields** can be left empty

#### Type-Specific Configuration
- **Select fields**: Define options (dropdown values)
- **Formula fields**: Enter formula expression
- **File fields**: Set size limits
- **Lookup fields**: Configure target entity

## Field Types

| Type | Use Case | Example | Configuration |
|------|---------|---------|----------------|
| **Text** | Free-form text input | Notes, Description, Address | Max length (optional) |
| **Number** | Numeric values | Employee Count, Budget, Revenue | Min/max values (optional) |
| **Date** | Date picker | Contract Start, Birthday, Deadline | Date format (optional) |
| **Boolean** | Yes/No checkbox | Active, Verified, Subscribed | Default value |
| **Single Select** | Dropdown (one option) | Priority (Low/Medium/High), Status (Open/Closed) | Options list (required) |
| **Multi Select** | Multiple checkboxes | Tags, Categories, Regions | Options list (required) |
| **File** | File attachment | Contract, Proposal, Logo | Max size, allowed types |
| **URL** | Web link | Website, LinkedIn Profile, Documentation | Auto-prefix https:// |
| **Lookup** | Reference to another entity | Primary Contact, Account Manager, Target entity (required) |
| **Formula** | Calculated value | Total Value, Days Since Contact, Completion % | Formula expression (required) |

## Field Management

### Reordering Fields
- **Drag fields** into new position
- **Order updates** automatically
- **Changes reflected** in entity forms immediately
- **Position affects**: Tab order in forms

- **Logical grouping**: Keep related fields together

### Editing Fields
- **Click field name** to edit
- **Modify settings**: Name, required, configuration
- **Save changes**: Updates field definition
- **Warning**: Changing field type may affect existing data
  - **Type changes**: May require data migration or clearing
  - **Review data**: Check before changing type
- **Backup data**: Export data before major changes

### Deleting Fields
- **Click "Delete"** from field options menu
- **Confirm deletion**: Action cannot be undone
- **Data removed**: Field values deleted from all entities
- **Warning**: Deletion is permanent
- **Consider archiving**: Hide field instead of deleting (keeps data)
- **Export first**: Download data before deleting field

## Formula Fields

### Overview
Formula fields calculate values dynamically based on other field values. They're read-only and update automatically when referenced fields change.

### Creating Formula Fields
1. **Select "Formula"** as field type
2. **Enter formula expression** in configuration
3. **Test formula**: Click "Test" to validate
4. **Save** field

### Formula Syntax

#### Basic Operations
- **Arithmetic**: `+`, `-`, `*`, `/`
- **Comparison**: `>`, `<`, `>=`, `<=`, `==`, `!=`
- **Logical**: `AND`, `OR`, `NOT`
- **Conditional**: `IF(condition, true_value, false_value)`

#### Built-in Functions
- **DATE()**: Current date
- **DAYS(date1, date2)**: Days between dates
- **ABS(number)**: Absolute value
- **ROUND(number)**: Round to integer
- **UPPER(text)**: Convert to uppercase
- **LOWER(text)**: Convert to lowercase
- **CONCAT(text1, text2)**: Join text strings

#### Referencing Fields
Use field names in curly braces:
```
{Annual Revenue} / {Employee Count}
```

Referenced fields must to exist on the same entity.

### Formula Examples

- **Deal Value**: `{Deal Amount} * {Probability % / 100`
- **Days Since Contact**: `DAYS({First Contact Date}, DATE())`
- **Full Name**: `CONCAT({First Name}, " ", {Last Name})`
- **Completion Percentage**: `{Completed Activities} / {Total Activities} * 100`

### Testing Formulas
1. **Click "Test"** button in formula editor
2. **Review result**: Shows calculated value or error
3. **Fix errors**: Adjust formula if needed
4. **Save** when formula works correctly
- **Test edge cases**: Empty values, null references
- **Test data types**: Ensure formula handles different data types

## Best Practices

### Planning Custom Fields
- **Start with essential fields**: Add only critical fields initially
- **Avoid over-customization**: Too many fields reduce usability
- **group related fields**: Keep similar information together
- **use consistent naming**: Clear, business-friendly names
- **document fields**: Add descriptions for complex fields

### Field Type Selection
- **Match business needs**: Choose type based on data characteristics
- **consider validation**: Some types have built-in validation
- **plan for growth**: Choose types that scale well
- **avoid redundant fields**: Don't duplicate information
- **use lookups**: Connect related entities (e.g., Primary Contact)

### Implementation Tips
- **Test thoroughly**: Verify fields work correctly before deploying
- **train users**: Explain new fields to team members
- **monitor usage**: Check which fields are actually used
- **iterate based on feedback**: Adjust fields based on user needs
- **remove unused fields**: Clean up fields that aren't providing value

---

*Next: [Import/Export](./import-export.md)*
