# Data Import and Export

## Overview

Pipelite supports importing data from external sources and exporting data for backup or migration. This guide covers both CSV and JSON formats for maximum flexibility.

### What you can import
- **Organizations** with optional linked people
- **People** with optional organization links
- **Deals** with pipeline, stage, and linked entities
- **Activities** with linked deals and people

### What you can export
- **All entity data** in CSV or JSON format
- **Custom field values** included
- **Related entity names** (not just IDs)
- **Full data backup** for migration

## Importing Data

### Supported Formats
- **CSV**: Comma-separated values (standard spreadsheet format)
- **JSON**: JavaScript Object Notation (structured data)
- **Pipedrive CSV**: Direct import from Pipedrive exports

### Access Import
1. **Navigate to** Admin Panel
2. **Click** "Import"** in the sidebar
3. **Select entity type**: Organizations, People, Deals, or Activities
4. **Choose format**: CSV, JSON, or Pipedrive

## CSV Import Process

### Step 1: Upload File
- **Select file** from your computer
- **Supported formats**: .csv, .txt (CSV format)
- **Maximum size**: 10MB (larger files may cause timeouts)
- **Encoding**: UTF-8 recommended
- **Requirements**: First row must contain column headers

### Step 2: Map Columns
- **Auto-mapping**: System suggests mappings based on column names
- **Manual adjustment**: Change mappings as needed
- **Required fields**: Highlighted in the interface
- **Custom fields**: Available for mapping (prefixed with "Custom:")
- **Validation**: Invalid mappings show warnings

#### Field Mapping Tips
- **Match standard fields**: Name, Email, Organization, etc.
- **Map custom fields**: Select from dropdown (e.g., "Custom: Industry")
- **Handle unmapped columns**: Choose to skip or map to notes
- **Required fields**: Must be mapped before proceeding
- **Review suggestions**: System highlights potential issues

### Step 3: Preview and Review
- **Data preview**: Shows first 10 rows as they will be imported
- **Validation warnings**: Displays potential issues:
  - **Missing organizations**: Person references non-existent organization
  - **Missing people**: Deal references non-existent person
  - **Invalid stage**: Deal references non-existent pipeline stage
  - **Duplicate emails**: Person with existing email address
- **Options**:
  - **Auto-create**: Automatically create missing organizations/people
  - **Skip**: Skip records with missing references
  - **Fallback**: Use default stage for invalid stages
- **Review carefully**: Check warnings before proceeding

### Step 4: Confirm Import
- **Summary**: Shows count of records to import
- **Options**: Review warnings, adjust settings
- **Confirm**: Click "Import" to start process
- **Progress**: Shows import progress
- **Completion**: Displays summary of imported records

## Pipedrive Compatibility

### Import from Pipedrive
Pipelite can import Pipedrive CSV exports directly:

1. **Export from Pipedrive**: Download CSV export (Organizations, Persons, or Deals)
2. **Upload to Pipelite**: Use Pipedrive format option
3. **Automatic mapping**: Fields mapped automatically
4. **Handle differences**: Pipedrive-specific fields handled

### Pipedrive Field Mapping
- **Organization fields**:
  - `Company name` → `name`
  - `Address` → `address`
  - `Owner` → `ownerId` (mapped by email)
- **Person fields**:
  - `First name` → `firstName`
  - `Last name` → `lastName`
  - `Email` → `email`
  - `Organization` → `organizationId` (mapped by name)
- **Deal fields**:
  - `Title` → `title`
  - `Value` → `value`
  - `Stage` → `stageId` (mapped by name)
  - `Organization` → `organizationId`
  - `Person` → `personId`

### Pipedrive-Specific Features
- **Custom fields**: Mapped to Pipelite custom fields
- **Notes**: Imported to notes field
- **Activity log**: Option to import as activities
- **Stage mapping**: Match Pipedrive stages to Pipelite stages

## Exporting Data

### Access Export
1. **Navigate to** Admin Panel
2. **Click** "Export"** in the sidebar
3. **Select entity type**: Organizations, People, Deals, or Activities
4. **Choose format**: CSV or JSON
5. **Apply filters** (optional):
   - Date range
   - Status
   - Pipeline (for deals)
   - Custom field values
6. **Click "Export"** to download

### Export Contents
- **Standard fields**: All default entity fields
- **Custom fields**: All custom field values
- **Related entities**: Names (not just IDs)
  - Organizations: Owner name
  - People: Organization name
  - Deals: Organization, person, pipeline, stage names
  - Activities: Deal, person names
- **Metadata**: Created/updated timestamps, IDs

### CSV Export Format
- **First row**: Column headers
- **Data rows**: Entity records
- **Encoding**: UTF-8
- **Delimiter**: Comma
- **Text qualifier**: Double quotes (for fields containing commas)
- **Date format**: ISO 8601 (YYYY-MM-DD)

### JSON Export Format
```json
[
  {
    "id": "abc123",
    "name": "Acme Corporation",
    "email": "contact@acme.com",
    "address": "123 Main St",
    "custom_fields": {
      "industry": "Technology",
      "company_size": "50-100"
    },
    "owner": "john@example.com",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-20T14:45:00Z"
  }
]
```

## Best Practices

### Before Importing
- **Start small**: Test with a small file first (5-10 records)
- **Review mapping**: Double-check field mappings
- **Handle warnings**: Address warnings before importing large files
- **Backup data**: Export existing data before major imports
- **Use auto-create carefully**: Only enable if you want to create missing entities

### Data Quality
- **Clean data**: Remove duplicates, fix formatting issues before importing
- **Validate emails**: Ensure email addresses are valid
- **Check references**: Verify referenced entities exist (or enable auto-create)
- **Review custom fields**: Ensure custom fields are created before importing

### Regular Exports
- **Schedule exports**: Regular backups of data (weekly/monthly)
- **Export before updates**: Always export before major changes
- **Store exports safely**: Keep backup files in secure location
- **Test imports**: Periodically test importing exported data to verify format
- **Document exports**: Keep log of when and what was exported

### Migration Strategy
- **Export from source**: Export data from previous system
- **Map fields**: Match source fields to Pipelite fields
- **Test import**: Import small batch to verify mapping
- **Full import**: Import complete dataset
- **Verify**: Check imported data for accuracy
- **Clean up**: Remove duplicates, fix issues as needed

## Troubleshooting

### Common Import Issues
- **"File too large"**: Split into smaller files
- **"Invalid format"**: Check CSV formatting (commas, quotes)
- **"Missing required fields"**: Ensure required fields are mapped
- **"Duplicate records"**: System skips duplicates, check warnings
- **"Import timeout"**: Try smaller batch or increase timeout

### Common Export Issues
- **"No data found"**: Check filters, verify data exists
- **"Export failed"**: Try smaller dataset, check server logs
- **"Download interrupted"**: Try again with stable connection

---

*Next: [Troubleshooting Guide](./troubleshooting.md)*
