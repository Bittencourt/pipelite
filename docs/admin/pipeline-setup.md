# Pipeline Configuration

## Overview

Pipelines organize deals into stages. Each stage represents a step in your sales process. Pipelite allows you to create multiple pipelines and different deal types or products.

### What you'll learn

- **Create and configure** pipelines
- **Add and reorder** stages within pipelines
- **Set stage colors** for visual organization
- **Define special stages** (Won and lost)
- **Set default pipeline** for new deals

- **Manage pipeline settings**

## Creating Pipelines

### How to create a pipeline

1. **Navigate to** Pipelines section
2. **Click "New Pipeline"** button
3. **Enter pipeline name** (e.g., "Sales Pipeline")
4. **Click "Create"**

Your new pipeline will have no stages initially. You'll need to add stages.

## Configuring Stages

### Adding Stages
1. **Open pipeline** from Pipelines list
2. **Click "Add Stage"** button
3. **Enter stage name** (e.g., "New Lead")
4. **Choose stage color** from color picker
5. **Click "Save"**

### Reordering Stages
- **Drag stages** to new positions
- **Position updates automatically**
- **Stages display in order** they appear in pipeline view

### Editing stages
- **Click stage name** to edit
- **Modify stage name or color**
- **Save changes**

### Deleting stages
- **Click stage options** menu (three dots)
- **Select "Delete"**
- **Confirm deletion**
- **Warning**: Deleting a stage removes all deals in that stage

- **Cannot delete stages** containing deals
- **Move deals** to another stage first
- **Update deal stage** from deal details or edit
- **Save changes**

## Special Stages

### Won Stage
- **Purpose**: Represents deals that closed successfully
- **Required**: Each pipeline must have **exactly one** Won stage
- **Icon**: Green checkmark
- **Deals in Won stage**: Count toward success metrics

### Lost Stage
- **Purpose**: Represents deals that didn't close
- **Required**: Each pipeline must have **exactly one** Lost stage
- **Icon**: Red X
- **Deals in Lost stage**: Archived, not deleted (can be reactivated)
- **Cannot drag deals** to/from Won/Lost stages
- **No further actions** available on Won/Lost deals
- **Pipeline analytics** exclude Won/Lost stages from active counts
- **Conversion rates** calculated from Won/Lost progression

## Stage Best Practices

### Naming Conventions
Use clear, action-oriented names:
- **Good**: "New Lead", "Contacted", "Qualified", "Proposal Sent"
- **Bad**: "Stage 1", "In progress", "working"
- **Industry-specific**: "Demo", "Trial", "Negotiation", "Contract Review"
- **Sales-specific**: "Initial Contact", "Discovery Call", "Needs Analysis", "Quote", "Negotiation"

### Number of Stages
- **Recommended**: 5-10 stages per pipeline
- **Too few**: Less than 5 stages lacks visibility
- **Too many**: More than 10 stages creates complexity without adding value
- **Balance**: Include both active and terminal stages

### Stage Order
- **Logical progression**: Each stage should represent a clear step forward
- **Bidirectional**: Some deals may move backward (e.g., from "Qualified" back to "Contacted")
- **Terminal**: Won/Lost stages should be at the end

### Stage Colors
- **Use colors consistently** to indicate stage types:
  - **Green/blue**: Early stages (new leads, initial contact)
  - **Yellow/orange**: Middle stages (qualified, proposal)
  - **Green**: Won stage (success)
  - **Red/gray**: Lost stage (closed/lost)
- **Avoid similar colors** for adjacent stages

## Default Pipeline

### Setting Default
- **Mark a pipeline as default** in pipeline settings
- **New deals** automatically go to default pipeline
- **Only one** pipeline can be default at a time
- **Change default** anytime in pipeline settings

### Why set a default?
- **New user experience**: New deals appear in familiar location
- **Consistency**: Team knows where to find deals
- **Reporting**: Default pipeline included in initial metrics
- **Can change** as business needs evolve

### Changing Default Pipeline
1. **Navigate to** Pipelines
2. **Click "Set as default"** on preferred pipeline
3. **Confirm** the change
4. **Previous default** is unset automatically
5. **New deals** will use new default

## Pipeline Management

### Viewing Pipelines
- **Pipeline list** shows all pipelines
- **Active deals count** per pipeline
- **Stage breakdown** visible
- **Won/lost** conversion metrics
- **Last updated** timestamp

### Archiving Pipelines
- **Unused pipelines** can be archived (hidden)
- **Archived pipelines** retain historical data
- **Can be restored** if needed later
- **Archive** from pipeline settings

### Duplicating Pipelines
- **Copy existing pipeline** for similar use cases
- **Maintains stages** (including colors)
- **Won/Lost stages** included
- **Deals not copied** (start fresh)
- **Rename** after duplication

## Integration with Deals

### Deal Creation
- **Select pipeline** when creating new deal
- **Default pipeline** used if not specified
- **Stage selection** shows available stages
- **Deals appear** in first stage (unless specified otherwise)

### Moving Deals Between Stages
- **Drag deals** between stages in pipeline view
- **Stage updates** logged automatically
- **Won/Lost moves** tracked for analytics
- **Notification** sent on assigned users (optional)

### Pipeline Analytics
- **Deal count** per stage
- **Stage duration** (average time in each stage)
- **Conversion rate** (percentage reaching Won stage)
- **Deal velocity** (new deals per time period)
- **Pipeline performance** comparisons

---

*Next: [Custom Fields](./custom-fields.md)*
