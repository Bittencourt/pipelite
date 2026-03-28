---
phase: 28-visual-editor
plan: 01
subsystem: ui
tags: [react-flow, dagre, zustand, workflow-editor, graph]

requires:
  - phase: 27-action-nodes
    provides: "WorkflowNode types, action config schemas, trigger types"
provides:
  - "DB <-> React Flow graph format conversion (toReactFlowGraph, toWorkflowNodes)"
  - "Dagre auto-layout engine (computeLayout)"
  - "Zustand editor state store (useEditorStore)"
  - "Graph mutation helpers (addNodeAfter, removeNode, reorderNode)"
  - "Variable schema builder for autocomplete (buildVariableTree)"
  - "EditorNode/EditorNodeData types"
affects: [28-02-PLAN, 28-03-PLAN, 28-04-PLAN]

tech-stack:
  added: ["@xyflow/react", "@dagrejs/dagre", "zustand"]
  patterns: ["workflowNodes as DB source of truth with RF reconversion on mutations", "static output schema map for variable autocomplete"]

key-files:
  created:
    - src/app/workflows/[id]/edit/lib/types.ts
    - src/app/workflows/[id]/edit/lib/graph-converter.ts
    - src/app/workflows/[id]/edit/lib/graph-converter.test.ts
    - src/app/workflows/[id]/edit/lib/layout.ts
    - src/app/workflows/[id]/edit/lib/layout.test.ts
    - src/app/workflows/[id]/edit/lib/graph-mutations.ts
    - src/app/workflows/[id]/edit/lib/graph-mutations.test.ts
    - src/app/workflows/[id]/edit/lib/variable-schema.ts
    - src/app/workflows/[id]/edit/lib/variable-schema.test.ts
    - src/app/workflows/[id]/edit/lib/editor-store.ts
  modified: []

key-decisions:
  - "workflowNodes maintained as DB source of truth; RF nodes are derived via reconversion on every mutation"
  - "Static ACTION_OUTPUT_SCHEMAS map for variable autocomplete rather than runtime introspection"
  - "Trigger node is virtual (id=trigger) with triggerConfig stored in data, excluded from toWorkflowNodes output"
  - "Condition node nextNodeId used for post-merge continuation; trueBranch/falseBranch for branch edges with sourceHandle"

patterns-established:
  - "Editor lib modules: pure functions for conversion/mutation, Zustand for state, types.ts for editor-specific types"
  - "Graph reconversion pattern: mutations operate on WorkflowNode[], then toReactFlowGraph regenerates RF state"

requirements-completed: [EDIT-01, EDIT-03, EDIT-04]

duration: 5min
completed: 2026-03-28
---

# Phase 28 Plan 01: Editor Data Layer Summary

**Graph converter with lossless DB round-trip, dagre auto-layout, zustand editor store, graph mutations, and variable schema builder for workflow visual editor**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T04:09:08Z
- **Completed:** 2026-03-28T04:14:32Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Lossless round-trip conversion between DB WorkflowNode[] and React Flow nodes+edges
- Dagre TB auto-layout with condition branch positioning
- Zustand editor store with all CRUD actions operating on DB source of truth
- Graph mutations (add/remove/reorder) maintain valid nextNodeId pointer chains
- Variable schema builder provides ordered autocomplete entries from trigger + prior nodes only

## Task Commits

Each task was committed atomically:

1. **Task 1: Editor types, graph converter, and layout engine** - `4fb0999` (feat)
2. **Task 2: Graph mutations, variable schema builder, and editor store** - `225ac93` (feat)

## Files Created/Modified
- `src/app/workflows/[id]/edit/lib/types.ts` - EditorNode/EditorNodeData types extending React Flow Node
- `src/app/workflows/[id]/edit/lib/graph-converter.ts` - toReactFlowGraph/toWorkflowNodes/toTriggerConfig
- `src/app/workflows/[id]/edit/lib/graph-converter.test.ts` - 10 tests for conversion and round-trip
- `src/app/workflows/[id]/edit/lib/layout.ts` - computeLayout with dagre TB orientation
- `src/app/workflows/[id]/edit/lib/layout.test.ts` - 3 tests for layout positioning
- `src/app/workflows/[id]/edit/lib/graph-mutations.ts` - addNodeAfter/removeNode/reorderNode/createNewNode
- `src/app/workflows/[id]/edit/lib/graph-mutations.test.ts` - 8 tests for mutation integrity
- `src/app/workflows/[id]/edit/lib/variable-schema.ts` - buildVariableTree with trigger + action output schemas
- `src/app/workflows/[id]/edit/lib/variable-schema.test.ts` - 7 tests for variable ordering and filtering
- `src/app/workflows/[id]/edit/lib/editor-store.ts` - Zustand store with all editor actions

## Decisions Made
- workflowNodes maintained as DB source of truth; RF nodes derived via reconversion on every mutation
- Static ACTION_OUTPUT_SCHEMAS map for variable autocomplete (matches existing action handler output shapes)
- Virtual trigger node (id="trigger") stores TriggerConfig[] in data, excluded from DB conversion
- Condition node nextNodeId for post-merge continuation; trueBranch/falseBranch for branch edges with sourceHandle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 lib modules ready for downstream UI components (canvas, side panel, variable picker)
- Editor store provides complete API for node manipulation without direct RF state handling
- 25 tests provide confidence for UI integration in 28-02

---
*Phase: 28-visual-editor*
*Completed: 2026-03-28*
