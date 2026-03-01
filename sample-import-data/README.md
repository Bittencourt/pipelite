# Sample Import Data

Files for testing the Phase 9 Import/Export feature.

## Generic CSV Import (`/import`)

| File | Entity | Rows | Error rows |
|------|--------|------|------------|
| `organizations.csv` | Organization | 9 | 1 (missing name) |
| `people.csv` | Person | 8 | 1 (invalid email) |
| `deals.csv` | Deal | 7 | 1 (missing title) |
| `activities.csv` | Activity | 8 | 1 (missing title) |

### What to look for

- **organizations.csv** — row with blank `name` should be highlighted red in preview
- **people.csv** — "New Startup Co" org doesn't exist → warning dialog + auto-create; "Acme Corp" should fuzzy-match to "Acme Corporation"
- **deals.csv** — "Brand New Company" org doesn't exist → auto-create with `[Imported]` flag
- **activities.csv** — last row has no title → shown as error

## JSON Import (`/import` — upload JSON file)

| File | Entity | Notes |
|------|--------|-------|
| `organizations-export.json` | Organization | Uses export metadata format — entity type should be auto-detected |

Upload `organizations-export.json` in the standard import wizard. The wizard should recognize the `entityType: "organization"` metadata and pre-select Organization.

## Pipedrive Import (`/import/pipedrive`)

| File | Entity | Notes |
|------|--------|-------|
| `pipedrive-organizations.csv` | Organization | Pipedrive column names (`label`, `owner_name`, `add_time`, etc.) |
| `pipedrive-people.csv` | Person | `name` (combined), `org_name` for org link |
| `pipedrive-deals.csv` | Deal | `stage_name`, `org_name`, `person_email`, `expected_close_date` |

The Pipedrive wizard should auto-suggest correct mappings for all columns it recognizes, and mark extra Pipedrive-specific columns (like `currency`, `status`, `owner_name`) as unmapped/ignored.

## Export test

Go to `/admin/export`, export any entity as JSON, then re-import that JSON file at `/import` to verify round-trip.
