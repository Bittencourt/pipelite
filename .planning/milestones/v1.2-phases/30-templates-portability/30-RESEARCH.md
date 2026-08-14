# Phase 30: Templates & Portability - Research

**Researched:** 2026-03-28
**Domain:** Workflow templates (HTTP node-level + workflow-level), JSON import/export, REST API for templates
**Confidence:** HIGH

## Summary

Phase 30 adds three layers of templating plus JSON portability to the workflow system. The first layer is HTTP node templates (built-in static + user-saved custom) that pre-fill HTTP config forms. The second layer is workflow starter templates that create pre-populated workflows from the "Create Workflow" dialog. The third layer is JSON export/import for transferring workflows between Pipelite instances. All decisions are locked via CONTEXT.md with clear implementation specifics.

The codebase already has all the infrastructure needed: the `http-config.tsx` form to extend, the `editor-store.ts` Zustand store with `updateNodeConfig`, the `createWorkflow` server action/mutation, the toolbar component, the `NewWorkflowButton` component, and the REST API patterns. A `workflowTemplates` table already exists in schema but is unused and uses singular `trigger` column -- this needs a migration or the new `http_templates` table (D-06) is a separate concern. The existing `workflowTemplates` table could potentially be repurposed for the API-04 requirement.

**Primary recommendation:** Build in four clear waves: (1) static template data files + DB table/migration for custom HTTP templates, (2) HTTP template selector + save-as-template UI in http-config, (3) workflow create dialog with starter templates, (4) JSON export/import in toolbar + template REST API.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Top dropdown in HTTP config form -- "Load from template" selector above the Method field
- **D-02:** Selecting a template silently overwrites all HTTP fields (method, URL, headers, body, timeout, retry) -- no confirmation dialog
- **D-03:** Built-in templates stored as a static TS file (e.g. `lib/templates/http-templates.ts`) -- no DB needed
- **D-04:** Selecting "None" clears template selection, fields remain as-is (user can manually reset)
- **D-05:** "Save as template" button at the bottom of the HTTP config form -- opens a dialog for name + optional description
- **D-06:** User-created templates stored in a new `http_templates` DB table (id, name, description, config JSON, created_by, timestamps)
- **D-07:** Templates are shared across the workspace -- all users see all saved templates
- **D-08:** Edit/delete permissions: creator + admin users can modify; all users can use
- **D-09:** Custom templates appear alongside built-in ones in the dropdown, separated by group headings ("Built-in" / "Custom")
- **D-10:** Accessible from the "Create Workflow" dialog -- "Blank workflow" button at top, then template cards below a separator
- **D-11:** Four starter templates ship with v1: Scheduled API Sync, Webhook Notifier, Data Pipeline, Email Digest
- **D-12:** Templates stored as a static TS file -- same pattern as HTTP templates
- **D-13:** Each template card shows name + short description; selecting one creates a new workflow pre-populated with the template's triggers, nodes, and edges
- **D-14:** Export and Import buttons in the workflow editor toolbar (top bar, right side)
- **D-15:** Export includes: triggers, nodes, edges, workflow metadata (name, description), schema version marker (`pipelite/v1`), custom field reference mappings
- **D-16:** Secrets are stripped on export -- values matching API key/token/password patterns replaced with `{{PLACEHOLDER}}` variables
- **D-17:** Import always creates a new workflow -- fresh ID generated, name gets "(Imported)" suffix if it conflicts with existing
- **D-18:** Export downloads a `.json` file; Import opens a file picker for `.json` files
- **D-19:** Import validates the JSON against the schema version before creating the workflow

### Claude's Discretion
- Exact secret detection heuristics (header keys like Authorization, common patterns)
- HTTP template dropdown styling and grouping visual treatment
- Workflow template card layout within the create dialog
- Error messages for invalid import files
- How custom field refs are resolved on import (prompt user or skip)

### Deferred Ideas (OUT OF SCOPE)
- Admin UI for managing built-in templates -- future enhancement
- Template versioning / update notifications -- future
- Template marketplace / sharing between instances -- out of scope
- Saving full workflows as user templates (beyond import/export) -- could be added later
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TMPL-01 | User can use built-in HTTP templates for common services (Planka, Apprise, Slack, Discord, Tally, Typeform) | Static TS file with HTTP config objects; Select dropdown with grouped items in http-config.tsx |
| TMPL-02 | User can create and save custom HTTP templates for reuse | New `http_templates` DB table + migration; server actions for CRUD; dialog in http-config.tsx |
| TMPL-03 | User can start a new workflow from built-in workflow templates (5-10) | Static TS file with trigger+nodes arrays; Dialog replacing NewWorkflowButton; createWorkflow action |
| TMPL-04 | User can import/export workflows as JSON | Client-side export serialization + file download; file input + validation + createWorkflow for import |
| API-04 | User can manage workflow templates via REST API (list, get, create, delete) | New API route `/api/v1/workflow-templates`; reuses existing `workflowTemplates` table or new table |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16 | App framework, server actions, API routes | Already in use |
| Drizzle ORM | latest | DB schema, migrations, queries | Already in use |
| Zod | latest | Schema validation for import/export, API payloads | Already in use |
| shadcn/ui | latest | Select, Dialog, AlertDialog, Button, Input, Textarea | Already in use |
| Zustand | latest | Editor store for export serialization | Already in use |
| sonner | latest | Toast notifications | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | latest | Icons (Download, Upload, Bookmark, FileText, Trash2) | Template UI buttons and cards |

### Alternatives Considered
No alternatives needed -- all implementation uses existing stack.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/templates/
│   ├── http-templates.ts          # Built-in HTTP templates (static, D-03)
│   └── workflow-templates.ts      # Built-in workflow starter templates (static, D-12)
├── lib/mutations/
│   └── http-templates.ts          # CRUD mutations for custom HTTP templates (D-06)
├── lib/workflows/
│   └── export-import.ts           # Export serialization, import validation, secret stripping
├── db/schema/
│   └── http-templates.ts          # New table schema (D-06)
├── app/workflows/
│   ├── new-workflow-button.tsx     # Refactored → opens CreateWorkflowDialog
│   ├── create-workflow-dialog.tsx  # New: template gallery + blank workflow (D-10)
│   └── actions.ts                 # Extended: createWorkflowFromTemplate, import actions
├── app/workflows/[id]/edit/
│   ├── components/toolbar.tsx      # Extended: Export + Import buttons (D-14)
│   └── components/config-forms/
│       └── http-config.tsx         # Extended: template selector + save-as-template (D-01, D-05)
└── app/api/v1/
    └── workflow-templates/
        ├── route.ts               # GET (list), POST (create) — API-04
        └── [id]/route.ts          # GET (detail), DELETE — API-04
```

### Pattern 1: Static Template Files
**What:** Built-in templates as typed const arrays exported from TS files
**When to use:** D-03, D-12 -- templates that ship with the application
**Example:**
```typescript
// src/lib/templates/http-templates.ts
export interface HttpTemplate {
  id: string
  name: string
  description: string
  config: {
    method: string
    url: string
    headers: Record<string, string>
    body: string
    timeout: number
    retryCount: number
  }
}

export const builtInHttpTemplates: HttpTemplate[] = [
  {
    id: "slack-webhook",
    name: "Slack Webhook",
    config: {
      method: "POST",
      url: "https://hooks.slack.com/services/{{WEBHOOK_URL}}",
      headers: { "Content-Type": "application/json" },
      body: '{"text": "{{message}}"}',
      timeout: 30,
      retryCount: 1,
    },
  },
  // ... more templates
]
```

### Pattern 2: Server Action + Mutation for Custom Templates
**What:** Follow the established `{ success: true/false, error/id }` pattern for template CRUD
**When to use:** D-06 -- custom HTTP template save/delete
**Example:**
```typescript
// src/lib/mutations/http-templates.ts
export async function createHttpTemplate(input: {
  name: string
  description?: string
  config: Record<string, unknown>
  createdBy: string
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  // Insert into http_templates table
}
```

### Pattern 3: Client-Side Export with Secret Stripping
**What:** Serialize workflow from Zustand store, strip secrets, trigger file download
**When to use:** D-14 through D-18 -- export functionality
**Example:**
```typescript
// src/lib/workflows/export-import.ts
const SECRET_HEADER_KEYS = /^(authorization|bearer|token|api[-_]?key|secret|x-api[-_]?key|password)/i

export function stripSecrets(headers: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    cleaned[key] = SECRET_HEADER_KEYS.test(key) ? "{{PLACEHOLDER}}" : value
  }
  return cleaned
}

export interface WorkflowExport {
  schemaVersion: "pipelite/v1"
  name: string
  description: string | null
  triggers: TriggerConfig[]
  nodes: WorkflowNode[]
}
```

### Pattern 4: File Download via Blob URL
**What:** Create a JSON blob, generate object URL, trigger download via anchor click
**When to use:** D-18 -- export downloads a .json file
**Example:**
```typescript
function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Anti-Patterns to Avoid
- **Don't store built-in templates in the DB:** They are static, versioned with code (D-03, D-12)
- **Don't use a separate page for template management:** Inline management via the Select dropdown (CONTEXT.md defers admin UI)
- **Don't prompt for confirmation on template apply:** D-02 explicitly says silent overwrite
- **Don't modify existing workflow on import:** D-17 says always create new workflow

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File download | Custom download API endpoint | Blob URL + anchor click | Pure client-side, no server needed |
| JSON validation | Manual field checking | Zod schema parse | Already used everywhere, catches edge cases |
| UUID generation | Custom ID generation | `crypto.randomUUID()` | Already used in all DB schemas via `$defaultFn` |
| Toast notifications | Custom notification system | sonner `toast()` | Already integrated throughout |
| Select with groups | Custom dropdown | shadcn Select + SelectGroup + SelectLabel | Already available components |

**Key insight:** Every building block already exists in the codebase. This phase is assembly and integration, not framework building.

## Common Pitfalls

### Pitfall 1: Template Selector Triggering Auto-Save
**What goes wrong:** Selecting a template calls `updateNodeConfig` which sets `dirty: true`, potentially triggering unwanted saves
**Why it happens:** The store marks any config change as dirty
**How to avoid:** This is actually correct behavior -- template load IS a config change. But be aware that the user needs to explicitly save. No additional handling needed.
**Warning signs:** If auto-save were implemented, template selection would immediately persist

### Pitfall 2: Header Key Collision in Template Apply
**What goes wrong:** Template headers overwrite existing headers, but if user had custom headers, they're lost
**Why it happens:** D-02 says overwrite ALL fields silently
**How to avoid:** This is the intended behavior per D-02. Document it clearly in the template apply function. The update call should set headers to the template's headers object, not merge.
**Warning signs:** Users complaining about lost headers after template apply

### Pitfall 3: Import Name Conflict Detection
**What goes wrong:** The "(Imported)" suffix logic needs to check existing workflow names
**Why it happens:** D-17 says add suffix "if it conflicts with existing"
**How to avoid:** Query existing workflows by name before creating. If name exists, append "(Imported)". If that also exists, append "(Imported 2)" etc., or just always append "(Imported)" since exact same names are unlikely.
**Warning signs:** Duplicate names without suffixes

### Pitfall 4: Secret Stripping False Positives
**What goes wrong:** Stripping values from headers that aren't actually secrets
**Why it happens:** Overly broad regex matching
**How to avoid:** Match on header KEY names (Authorization, Token, API-Key, Secret, etc.) not values. The key names are the reliable indicator. Per D-16 and Claude's Discretion on heuristics.
**Warning signs:** Non-secret header values getting replaced with `{{PLACEHOLDER}}`

### Pitfall 5: Existing workflowTemplates Table Mismatch
**What goes wrong:** The existing `workflowTemplates` table has a singular `trigger` column (not `triggers` array), and is unused
**Why it happens:** It was created early but never populated or used
**How to avoid:** For API-04, either migrate the existing table to match the current workflow shape (triggers array) or create a clear distinction. The existing table could serve API-04 (workflow templates management). The new `http_templates` table (D-06) is a separate concern for HTTP node templates.
**Warning signs:** Schema mismatch between workflowTemplates.trigger (singular) and workflows.triggers (plural array)

### Pitfall 6: Import Validation Edge Cases
**What goes wrong:** Imported JSON has valid structure but references node types or action types that don't exist
**Why it happens:** Export from a newer/different Pipelite version
**How to avoid:** Validate schema version first (D-19 -- `pipelite/v1`), then validate that node types and action types are in the known set. Unknown types should fail validation rather than create broken workflows.
**Warning signs:** Imported workflows with nodes that error on execution

## Code Examples

### HTTP Template Data Structure (TMPL-01)
```typescript
// src/lib/templates/http-templates.ts
export interface HttpTemplateConfig {
  method: string
  url: string
  headers: Record<string, string>
  body: string
  timeout: number
  retryCount: number
}

export interface HttpTemplate {
  id: string
  name: string
  description: string
  service: string  // grouping key
  config: HttpTemplateConfig
}

// 6 services per TMPL-01: Planka, Apprise, Slack, Discord, Tally, Typeform
export const builtInHttpTemplates: HttpTemplate[] = [
  {
    id: "slack-post-message",
    name: "Slack - Post Message",
    description: "Send a message to a Slack channel via webhook",
    service: "Slack",
    config: {
      method: "POST",
      url: "https://hooks.slack.com/services/{{WEBHOOK_PATH}}",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "{{message}}" }, null, 2),
      timeout: 30,
      retryCount: 1,
    },
  },
  {
    id: "discord-webhook",
    name: "Discord - Send Webhook",
    description: "Send a message to a Discord channel via webhook",
    service: "Discord",
    config: {
      method: "POST",
      url: "https://discord.com/api/webhooks/{{WEBHOOK_ID}}/{{WEBHOOK_TOKEN}}",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "{{message}}" }, null, 2),
      timeout: 30,
      retryCount: 1,
    },
  },
  // Planka, Apprise, Tally, Typeform follow same pattern
]
```

### DB Schema for Custom HTTP Templates (TMPL-02)
```typescript
// src/db/schema/http-templates.ts
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core"
import { users } from "./users"

export const httpTemplates = pgTable("http_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export type HttpTemplateRecord = typeof httpTemplates.$inferSelect
```

### Workflow Export Schema (TMPL-04)
```typescript
// src/lib/workflows/export-import.ts
import { z } from "zod"

export const workflowExportSchema = z.object({
  schemaVersion: z.literal("pipelite/v1"),
  name: z.string(),
  description: z.string().nullable(),
  triggers: z.array(z.record(z.string(), z.unknown())),
  nodes: z.array(z.record(z.string(), z.unknown())),
})

export type WorkflowExport = z.infer<typeof workflowExportSchema>
```

### Template Apply in HTTP Config (D-01, D-02)
```typescript
// Inside http-config.tsx
const handleTemplateSelect = (templateId: string) => {
  if (!templateId) return // "None" selected

  const allTemplates = [...builtInHttpTemplates, ...customTemplates]
  const template = allTemplates.find(t => t.id === templateId)
  if (!template) return

  // D-02: silently overwrite ALL HTTP fields
  updateNodeConfig(nodeId, {
    method: template.config.method,
    url: template.config.url,
    headers: template.config.headers,
    body: template.config.body,
    timeout: template.config.timeout,
    retryCount: template.config.retryCount,
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| workflowTemplates.trigger (singular) | workflows.triggers (plural array) | Phase 25 migration | New tables should use triggers array format |
| Direct createWorkflow call | NewWorkflowButton component | Phase 28 | Must be refactored to open dialog instead of direct create |

**Deprecated/outdated:**
- `workflowTemplates` table: Has singular `trigger` column, needs attention for API-04. Consider migrating to `triggers` (array) or adding a new column.

## Open Questions

1. **workflowTemplates table reuse for API-04**
   - What we know: Table exists with `trigger` (singular JSONB object) and `nodes` columns. API-04 needs CRUD for workflow templates.
   - What's unclear: Should we migrate the existing table to use `triggers` (plural array) to match the workflows table shape, or keep it as-is?
   - Recommendation: Migrate the existing `workflowTemplates` table to use `triggers` (plural array) for consistency. Add `createdBy` and `updatedAt` columns for proper CRUD. This serves API-04 and D-11 (though D-12 says static file for built-in, the API manages user-created workflow templates if needed later).

2. **Custom field reference mappings on export (D-15)**
   - What we know: D-15 mentions "custom field reference mappings" in export
   - What's unclear: How exactly to represent custom field references when the importing instance has different custom field definitions
   - Recommendation: Export custom field IDs as-is (they are UUIDs). On import, custom field references may break -- this is expected. Per Claude's Discretion, skip resolution silently (fields with unknown IDs are simply non-functional until reconfigured). Add a warning in the import success toast if custom field references are detected.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (latest) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TMPL-01 | Built-in HTTP templates have valid structure | unit | `npx vitest run src/lib/templates/http-templates.test.ts -x` | No -- Wave 0 |
| TMPL-02 | Custom HTTP template CRUD mutations work | unit | `npx vitest run src/lib/mutations/http-templates.test.ts -x` | No -- Wave 0 |
| TMPL-03 | Workflow starter templates produce valid workflows | unit | `npx vitest run src/lib/templates/workflow-templates.test.ts -x` | No -- Wave 0 |
| TMPL-04 | Export serialization strips secrets, import validates schema | unit | `npx vitest run src/lib/workflows/export-import.test.ts -x` | No -- Wave 0 |
| API-04 | Template REST API routes respond correctly | unit | `npx vitest run src/app/api/v1/workflow-templates/__tests__/routes.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/templates/http-templates.test.ts` -- covers TMPL-01 (template structure validation)
- [ ] `src/lib/mutations/http-templates.test.ts` -- covers TMPL-02 (CRUD operations)
- [ ] `src/lib/templates/workflow-templates.test.ts` -- covers TMPL-03 (template structure + resulting workflow shape)
- [ ] `src/lib/workflows/export-import.test.ts` -- covers TMPL-04 (export schema, secret stripping, import validation)
- [ ] `src/app/api/v1/workflow-templates/__tests__/routes.test.ts` -- covers API-04 (REST endpoints)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/app/workflows/[id]/edit/components/config-forms/http-config.tsx` -- current HTTP form structure
- Codebase analysis: `src/db/schema/workflows.ts` -- existing table schemas including workflowTemplates
- Codebase analysis: `src/app/workflows/[id]/edit/lib/editor-store.ts` -- Zustand store with updateNodeConfig
- Codebase analysis: `src/app/workflows/[id]/edit/components/toolbar.tsx` -- current toolbar layout
- Codebase analysis: `src/app/workflows/new-workflow-button.tsx` -- current create flow
- Codebase analysis: `src/lib/mutations/workflows.ts` -- mutation patterns
- Codebase analysis: `src/app/api/v1/workflows/route.ts` -- API route patterns
- Codebase analysis: `src/lib/api/serialize.ts` -- serialization patterns
- UI spec: `.planning/phases/30-templates-portability/30-UI-SPEC.md` -- full design contract

### Secondary (MEDIUM confidence)
- Service API docs (Slack webhooks, Discord webhooks, Planka API, Apprise API) -- used for template content accuracy. Standard webhook patterns are well-documented.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- follows established patterns (static files, mutations, server actions, API routes)
- Pitfalls: HIGH -- identified from direct codebase analysis (schema mismatch, store behavior, naming conflicts)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- no external dependencies, all internal patterns)
