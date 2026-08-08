# Workflows Reference

Complete reference for the Workflows feature in Pipelite. Workflows automate actions based on CRM events, schedules, webhooks, or manual triggers.

## Overview

Workflows are server-side automation rules that react to events in your CRM and perform actions automatically. Use them to send emails when deals are created, notify team members when stages change, make HTTP requests to external services, and more.

### Key Concepts

- Workflows consist of a **trigger** (what starts it) and **nodes** (what it does)
- Nodes form a linear or branching chain — each node runs after the previous one completes
- **Condition nodes** split the flow into Yes/No branches based on field comparisons
- **Delay nodes** pause execution for a configured duration before continuing
- **Action nodes** perform work: HTTP requests, CRM mutations, emails, notifications, JavaScript transforms
- Workflows can be enabled/disabled without deleting them
- The **visual editor** provides a drag-and-drop canvas for building workflows

---

## Accessing Workflows

Navigate to **Workflows** in the main navigation. The workflow list shows all workflows with their status (active/inactive) and trigger type.

---

## Creating a Workflow

1. Click **New Workflow** on the workflow list page
2. The visual editor opens with a **Trigger** node at the top
3. Click the trigger node to configure what starts the workflow
4. Click the **+** button below the trigger to add your first action node
5. Configure each node in the side panel that opens when you click it
6. Set the workflow name and toggle **Active** in the top toolbar
7. Click **Save** to persist the workflow

---

## Triggers

Triggers define what causes a workflow to run. Each workflow can have one or more triggers.

### CRM Event Trigger

Fires when a CRM entity is created, updated, or deleted.

| Setting | Description |
|---------|-------------|
| **Entity** | Which entity type: Deal, Person, Organization, or Activity |
| **Action** | What happened: Created, Updated, Deleted, or Stage Changed (deals only) |
| **Field Filters** | Optional — only fire when specific fields changed (e.g., "status", "value") |
| **From Stage / To Stage** | For stage_changed actions — filter by specific stage transitions |

**Available trigger data:**
- `trigger.data.entity` — the full entity object
- `trigger.data.changes` — which fields changed (for updates)
- `trigger.data.old_stage_id` / `trigger.data.new_stage_id` — for stage changes

### Schedule Trigger

Fires on a recurring schedule.

| Setting | Description |
|---------|-------------|
| **Mode** | Interval (every N minutes) or Cron expression |
| **Interval** | Minutes between runs (minimum: 1) |
| **Cron Expression** | Standard cron syntax (e.g., `0 9 * * 1` for every Monday at 9am) |

### Webhook Trigger

Fires when an external system sends an HTTP POST to a unique URL.

| Setting | Description |
|---------|-------------|
| **Webhook URL** | Auto-generated URL: `/api/webhooks/in/{workflowId}/{secret}` |
| **Response Status** | HTTP status code to return (default: 200) |
| **Response Body** | Optional custom response body |

The webhook URL is shown after saving. Share it with the external service that should trigger this workflow.

### Manual Trigger

Fires when triggered manually via the UI or REST API. Useful for testing or on-demand automation.

---

## Node Types

### Action Nodes

Action nodes perform work. Click an action node to configure it in the side panel.

#### HTTP Request

Make HTTP requests to external services.

| Field | Description |
|-------|-------------|
| **URL** | Request URL (supports `{{variables}}`) |
| **Method** | GET, POST, PUT, PATCH, or DELETE |
| **Headers** | Key-value pairs (supports `{{variables}}`) |
| **Body** | Request body for POST/PUT/PATCH (supports `{{variables}}`) |
| **Retry Count** | Number of retries on failure (0-3) |

**Output data:** `output.statusCode`, `output.headers`, `output.body`

#### CRM Action

Create or update CRM entities from workflow data.

| Field | Description |
|-------|-------------|
| **Entity Type** | Deal, Person, Organization, or Activity |
| **Operation** | Create or Update |
| **Field Mappings** | Map workflow variables to entity fields |

#### Email

Send emails using the configured email provider (Resend).

| Field | Description |
|-------|-------------|
| **To** | Recipient email address (supports `{{variables}}`) |
| **Subject** | Email subject line (supports `{{variables}}`) |
| **Body** | Email body content (supports `{{variables}}`) |

#### Notification

Send in-app notifications to team members.

| Field | Description |
|-------|-------------|
| **Title** | Notification title (supports `{{variables}}`) |
| **Message** | Notification message (supports `{{variables}}`) |

#### JavaScript Transform

Run custom JavaScript code in a sandboxed environment (QuickJS).

| Field | Description |
|-------|-------------|
| **Code** | JavaScript code to execute |

The code receives `input` (data from previous nodes) and must return an object. The return value becomes the node's output.

#### Webhook Response

Send a custom HTTP response back to the caller of an inbound webhook trigger. Only usable in workflows with a webhook trigger.

| Field | Description |
|-------|-------------|
| **Status Code** | HTTP response status code |
| **Body** | Response body (supports `{{variables}}`) |

### Condition Nodes

Condition nodes evaluate field comparisons and branch the flow into **Yes** (true) and **No** (false) paths.

| Setting | Description |
|---------|-------------|
| **Field Path** | The variable path to compare (e.g., `trigger.data.entity.value`) |
| **Operator** | Comparison operator (see table below) |
| **Value** | The value to compare against |
| **Logic** | AND/OR when combining multiple conditions |

#### Available Operators

| Operator | Description |
|----------|-------------|
| equals | Exact match |
| not_equals | Not an exact match |
| contains | String contains substring |
| not_contains | String does not contain substring |
| greater_than | Numeric greater than |
| less_than | Numeric less than |
| greater_than_or_equals | Numeric greater than or equal |
| less_than_or_equals | Numeric less than or equal |
| is_empty | Value is null, undefined, or empty string |
| is_not_empty | Value exists and is not empty |
| starts_with | String starts with prefix |
| ends_with | String ends with suffix |
| matches_regex | Matches regular expression |
| in_list | Value is in a comma-separated list |
| not_in_list | Value is not in a comma-separated list |

### Delay Nodes

Delay nodes pause workflow execution for a configured duration.

| Setting | Description |
|---------|-------------|
| **Mode** | Fixed duration, Until specific time, or From field value |
| **Duration** | Number of time units to wait (fixed mode) |
| **Unit** | Minutes, Hours, or Days |

After the delay completes, execution continues with the next node.

---

## Variable Picker

When configuring node fields that support `{{variables}}`, type `{{` to open the autocomplete dropdown.

### How It Works

1. Type `{{` in any template-enabled field (URL, body, subject, etc.)
2. A dropdown appears showing available variables grouped by source
3. Use arrow keys to navigate, type to filter
4. Press Enter to insert the selected variable (e.g., `{{trigger.data.entity.title}}`)

### Variable Sources

- **Trigger** — Data from the trigger event (entity fields, changes, timestamps)
- **Previous Nodes** — Output data from nodes that executed before the current one

Variables respect execution order — you can only reference data from nodes that run before the current node in the flow.

---

## Visual Editor

### Canvas

The workflow canvas displays nodes in a top-to-bottom layout:
- **Trigger node** (blue) at the top
- **Action nodes** (green) below
- **Condition nodes** (amber) with branching Yes/No paths
- **Delay nodes** (purple) for wait steps

### Adding Nodes

- Click the **+** button on edges between nodes to insert a new node
- Click the **+** button below the last node in a chain to append
- Select a node type from the type picker grid

### Removing Nodes

- Hover over a node and click the trash icon
- Or select the node and click Delete in the side panel
- Surrounding nodes automatically reconnect

### Reordering Nodes

- Select a node to open the side panel
- Use the Up/Down arrows in the side panel header to move the node within its linear segment

### Toolbar

The top toolbar contains:
- **Workflow name** — editable text field
- **Active toggle** — enable/disable the workflow
- **Save button** — persist all changes to the database

---

## REST API

Workflows are fully accessible via the REST API. See the [API Documentation](../../api/index.md) for details.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/workflows` | GET | List all workflows |
| `/api/v1/workflows` | POST | Create a new workflow |
| `/api/v1/workflows/:id` | GET | Get a specific workflow |
| `/api/v1/workflows/:id` | PUT | Update a workflow |
| `/api/v1/workflows/:id` | DELETE | Delete a workflow |
| `/api/v1/workflows/:id/run` | POST | Trigger a manual run |

---

*Last updated: 2026-03-28*
