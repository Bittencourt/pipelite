---
phase: quick
plan: 260328-rza
subsystem: workflows
tags: [split-node, workflow-engine, visual-editor]
dependency_graph:
  requires: [workflow-engine, visual-editor]
  provides: [split-node-type]
  affects: [execution-engine, graph-converter, graph-mutations, type-picker]
tech_stack:
  added: []
  patterns: [dual-branch-node, branch-handle-convention]
key_files:
  created:
    - src/app/workflows/[id]/edit/components/node-types/split-node.tsx
  modified:
    - src/lib/execution/types.ts
    - src/lib/execution/engine.ts
    - src/lib/workflows/export-import.ts
    - src/app/workflows/[id]/edit/lib/types.ts
    - src/app/workflows/[id]/edit/lib/graph-converter.ts
    - src/app/workflows/[id]/edit/lib/graph-mutations.ts
    - src/app/workflows/[id]/edit/lib/editor-store.ts
    - src/app/workflows/[id]/edit/components/node-types/index.ts
    - src/app/workflows/[id]/edit/components/type-picker.tsx
    - src/app/workflows/[id]/edit/components/side-panel.tsx
    - src/app/workflows/[id]/edit/lib/graph-converter.test.ts
    - src/app/workflows/[id]/edit/lib/graph-mutations.test.ts
decisions:
  - Reused condition's branch="true"/"false" convention for split branchA/branchB to minimize editor-store changes
  - Sequential branch execution in engine (true parallelism out of scope for v1)
  - Cyan/teal color scheme with GitFork icon to distinguish from condition (amber/GitBranch)
metrics:
  duration: 5m19s
  completed: 2026-03-28
  tasks_completed: 2
  tasks_total: 2
  tests_added: 5
  tests_total: 31
---

# Quick Task 260328-rza: Add Split Node Type for Workflow Parallel Branching

SplitNode type with branchA/branchB that unconditionally fans out execution to two parallel paths, with full visual editor support including graph converter round-trip, mutations, and type picker integration.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Add SplitNode type and execution engine handler | b15c0f4 | SplitNode interface, engine split case, export-import recognition |
| 2 | Add split node to visual editor | 7b07eb8 | Converter, mutations, split-node.tsx, type picker, side panel, 5 tests |

## Implementation Details

### SplitNode Type (types.ts)
- Interface with `branchA: string | null` and `branchB: string | null` pointers
- Added to `WorkflowNode` union type alongside ActionNode, ConditionNode, DelayNode

### Execution Engine (engine.ts)
- Split case executes both branches sequentially via `executeBranch()`
- Returns early if either branch hits a delay (run enters waiting state)
- Continues to `nextNodeId` merge point after both branches complete

### Visual Editor
- **split-node.tsx**: Cyan-themed card with GitFork icon, two source handles (branch-a at 30%, branch-b at 70%), plus buttons for empty branches
- **graph-converter.ts**: Creates edges with sourceHandle "branch-a"/"branch-b" and labels "A"/"B"; reverse conversion reconstructs branchA/branchB from edges
- **graph-mutations.ts**: addNodeAfter inserts into branchA/branchB; removeNode updates split pointers; reorderNode includes split branches in pointed set
- **type-picker.tsx**: Split option with GitFork icon and cyan color scheme
- **side-panel.tsx**: Minimal config message ("no configuration needed")

### Tests Added
1. Split node creates edges with sourceHandle branch-a/branch-b
2. Round-trip preserves split node branchA/branchB
3. addNodeAfter inserts into split branchA
4. addNodeAfter inserts into split branchB
5. createNewNode("split") returns valid SplitNode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] EditorNodeData type needed split in nodeType union**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** Adding SplitNode to WorkflowNode caused type error in graph-converter.ts where node.type could be "split" but EditorNodeData.nodeType didn't include it
- **Fix:** Added "split" to EditorNodeData.nodeType union in types.ts (planned for Task 2 but needed for Task 1 tsc verification)
- **Files modified:** src/app/workflows/[id]/edit/lib/types.ts
- **Commit:** b15c0f4

## Verification

- `npx tsc --noEmit` passes with no errors
- All 31 tests pass (26 existing + 5 new) across graph-converter, graph-mutations, dagre-layout, variable-schema test files
