# Pipelines & Kanban Reference

Complete reference for the Pipelines and Kanban Board features in Pipelite. Pipelines define your sales process stages; Kanban boards visualize deals through those stages.

## Overview

Pipelines define the stages a deal moves through from creation to close. The Kanban board provides a visual representation of all deals organized by their current stage.

### Key Concepts

- Pipelines contain ordered stages
- Each stage represents a step in your sales process
- Deals move between stages as they progress
- Special "Won" and "Lost" stages mark closed deals
- Kanban board shows deals as cards in stage columns

---

## Pipeline Structure

### Pipeline Components

A pipeline consists of:

1. **Active Stages**: The main progression steps (e.g., "New", "Qualified", "Proposal")
2. **Won Stage**: Successfully closed deals (terminal)
3. **Lost Stage**: Deals that didn't close (terminal)

### Stage Properties

| Property | Description |
|----------|-------------|
| **Name** | Stage display name |
| **Color** | Visual indicator for the stage |
| **Position** | Order in the pipeline (left to right) |
| **Pipeline** | Which pipeline the stage belongs to |
| **Is Won?** | Whether this is the "Won" terminal stage |
| **Is Lost?** | Whether this is the "Lost" terminal stage |

### Terminal Stages

Each pipeline has exactly one Won and one Lost stage:
- **Won**: Deals that successfully closed
- **Lost**: Deals that didn't close
- These stages appear in a collapsed footer in the kanban view
- Moving a deal to Won/Lost marks it as closed

---

## Default Pipeline

Pipelite creates a default pipeline during setup:

| Stage | Description |
|-------|-------------|
| New | Newly created deals |
| Contacted | Initial contact made |
| Qualified | Lead qualified |
| Proposal | Proposal sent |
| Negotiation | Terms being negotiated |
| Won | Deal closed successfully |
| Lost | Deal did not close |

Administrators can customize stages at any time.

---

## Kanban Board

### Overview

The kanban board is the primary interface for viewing and managing deals:

- **Columns** = Stages (left to right, in order)
- **Cards** = Individual deals
- **Movement** = Drag cards between columns

### Board Layout

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│     New     │  Contacted  │  Qualified  │  Proposal   │ Negotiation │
│             │             │             │             │             │
│  [Deal 1]   │  [Deal 3]   │             │  [Deal 5]   │             │
│  [Deal 2]   │             │             │             │             │
│             │             │             │             │             │
│   $50,000   │   $25,000   │     $0      │   $100,000  │    $0       │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Won: $500,000 (10 deals)        │  Lost: $50,000 (3 deals)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Column Features

- **Stage name** at top
- **Deal count** badge
- **Total value** at bottom
- **Scrollable** when deals exceed visible area

### Deal Cards

Each card shows:
- Deal title
- Organization name
- Deal value (formatted in your currency)
- Contact person (if linked)
- Selection ring (when using keyboard nav)

---

## Kanban Navigation

### Mouse Interactions

| Action | Result |
|--------|--------|
| Click card | Open deal details |
| Drag card | Move to different stage |
| Scroll horizontally | View all stages |
| Scroll vertically | View more deals in stage |

### Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| `h` | Move selection left (previous stage) |
| `l` | Move selection right (next stage) |
| `j` | Move selection down (next deal) |
| `k` | Move selection up (previous deal) |
| `Enter` | Open selected deal |
| `n` | Create new deal |
| `e` | Edit selected deal |
| `d` | Delete selected deal |

### Selection Indicator

When using keyboard navigation:
- Selected card shows a ring highlight
- Stage headers highlight when column has selection
- Selection wraps at column boundaries

---

## Moving Deals Between Stages

### Drag and Drop

1. Click and hold a deal card
2. Drag to the target stage column
3. Release to drop
4. Deal's stage updates immediately

### Keyboard Movement

1. Select a deal using `j/k` keys
2. Press `h` to move left (previous stage)
3. Press `l` to move right (next stage)
4. Selection moves to the new stage

### Edit Dialog

1. Open deal details
2. Click **Edit**
3. Select new stage from dropdown
4. Save changes

### Movement Rules

- Deals can move to any stage (forward or backward)
- Moving to Won/Lost marks deal as closed
- Position within stage is automatic (gap-based ordering)
- Changes save immediately (optimistic updates)

---

## Pipeline Switching

### Multiple Pipelines

If your account has multiple pipelines:
- Pipeline selector appears in the header
- Select different pipeline to view its kanban board
- Current pipeline is saved in URL for sharing

### URL Persistence

Pipeline selection is stored in the URL:
```
/deals?pipeline=uuid-here
```
This enables:
- Sharing specific pipeline views
- Bookmarking preferred pipeline
- Direct navigation via URL

---

## Stage Totals

### Value Totals

Each column shows:
- Sum of all deal values in that stage
- Formatted in your currency
- Updates immediately when deals move

### Count Badges

Stage headers show:
- Number of deals in the stage
- Updates as deals are added/removed/moved

### Won/Lost Footer

The collapsed footer shows:
- Total value of won deals
- Count of won deals
- Total value of lost deals
- Count of lost deals

---

## Administration

Pipeline and stage management is restricted to administrators:

### Creating Pipelines

Administrators can create new pipelines with custom stages.

### Editing Stages

Administrators can:
- Add new stages
- Rename existing stages
- Reorder stages (drag-drop)
- Change stage colors
- Set default pipeline

### Deleting Pipelines

Administrators can delete pipelines:
- Deals in deleted pipeline need reassignment
- Default pipeline cannot be deleted

---

## Related Features

### Deals

Pipelines contain deals. See [Deals Reference](./deals.md) for details.

### Activities

Activities linked to deals appear in deal details. See [Activities Reference](./activities.md).

### Custom Fields

Custom fields can extend stage data. See [Custom Fields Reference](./custom-fields.md).

---

## Best Practices

1. **Keep stages simple** — 5-7 stages is usually optimal
2. **Clear stage names** — Use names that reflect your actual process
3. **Consistent colors** — Use colors that match your workflow semantics
4. **Move deals promptly** — Keep pipeline current
5. **Archive old deals** — Move stuck deals to Lost to keep pipeline clean

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Pipeline not showing | Check if pipeline exists; verify permissions |
| Can't drag deal | Check if deal is in terminal stage |
| Wrong stage order | Contact admin to reorder stages |
| Missing Won/Lost stages | Each pipeline has exactly one of each; contact admin |

---

*Last updated: 2026-03-04*
