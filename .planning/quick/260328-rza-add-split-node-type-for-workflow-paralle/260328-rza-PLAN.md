---
phase: quick
plan: 260328-rza
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/execution/types.ts
  - src/lib/execution/engine.ts
  - src/app/workflows/[id]/edit/lib/types.ts
  - src/app/workflows/[id]/edit/lib/graph-converter.ts
  - src/app/workflows/[id]/edit/lib/graph-mutations.ts
  - src/app/workflows/[id]/edit/lib/editor-store.ts
  - src/app/workflows/[id]/edit/components/node-types/index.ts
  - src/app/workflows/[id]/edit/components/node-types/split-node.tsx
  - src/app/workflows/[id]/edit/components/type-picker.tsx
  - src/app/workflows/[id]/edit/components/side-panel.tsx
  - src/lib/workflows/export-import.ts
  - src/app/workflows/[id]/edit/lib/graph-converter.test.ts
  - src/app/workflows/[id]/edit/lib/graph-mutations.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Split node appears in the type picker and can be added to a workflow"
    - "Split node fans out execution context to two parallel downstream branches"
    - "Split node renders in the editor with two output handles (branch-a, branch-b)"
    - "Graph converter correctly handles split node dual outputs for round-trip conversion"
  artifacts:
    - path: "src/lib/execution/types.ts"
      provides: "SplitNode type in WorkflowNode union"
      contains: "SplitNode"
    - path: "src/lib/execution/engine.ts"
      provides: "Split execution handler that runs both branches"
      contains: "case \"split\""
    - path: "src/app/workflows/[id]/edit/components/node-types/split-node.tsx"
      provides: "Visual split node component with dual output handles"
  key_links:
    - from: "src/lib/execution/engine.ts"
      to: "src/lib/execution/types.ts"
      via: "SplitNode type import"
      pattern: "SplitNode"
    - from: "src/app/workflows/[id]/edit/lib/graph-converter.ts"
      to: "src/lib/execution/types.ts"
      via: "split type handling in toReactFlowGraph/toWorkflowNodes"
      pattern: "split"
---

<objective>
Add a "split" node type to the workflow engine and visual editor that replicates execution context into two parallel output branches (branch-a and branch-b).

Purpose: Enable workflow authors to fan out execution into two parallel paths from a single point, similar to how condition nodes branch but without any condition -- both branches always execute.
Output: Working split node in both execution engine and visual editor.
</objective>

<execution_context>
@/home/pedro/.claude/get-shit-done/workflows/execute-plan.md
@/home/pedro/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/execution/types.ts
@src/lib/execution/engine.ts
@src/app/workflows/[id]/edit/lib/types.ts
@src/app/workflows/[id]/edit/lib/graph-converter.ts
@src/app/workflows/[id]/edit/lib/graph-mutations.ts
@src/app/workflows/[id]/edit/lib/editor-store.ts
@src/app/workflows/[id]/edit/components/node-types/index.ts
@src/app/workflows/[id]/edit/components/node-types/condition-node.tsx
@src/app/workflows/[id]/edit/components/type-picker.tsx
@src/app/workflows/[id]/edit/components/side-panel.tsx
@src/lib/workflows/export-import.ts

<interfaces>
From src/lib/execution/types.ts:
```typescript
export interface ConditionNode {
  id: string; type: "condition"; label: string;
  config: { groups: ConditionGroup[]; logicOperator: "and" | "or" };
  nextNodeId: string | null;
  trueBranch: string | null;
  falseBranch: string | null;
}
export type WorkflowNode = ActionNode | ConditionNode | DelayNode
// SplitNode will follow same pattern as ConditionNode but with branchA/branchB
```

From src/lib/execution/engine.ts:
```typescript
// executeBranch(startNodeId, nodeMap, context, runId) walks a branch linearly
// The main switch handles "action", "condition", "delay" -- add "split" case
// Split should call executeBranch for both branchA and branchB
// The exhaustive check `const _exhaustive: never = node` must be updated
```

From src/app/workflows/[id]/edit/lib/graph-converter.ts:
```typescript
// toReactFlowGraph: condition nodes create edges for trueBranch/falseBranch with sourceHandle
// Split nodes need similar edge creation for branchA/branchB with sourceHandle "branch-a"/"branch-b"
// toWorkflowNodes: reverse -- reads edges by sourceHandle to reconstruct branchA/branchB
```

From src/app/workflows/[id]/edit/lib/graph-mutations.ts:
```typescript
export function createNewNode(type: "action" | "condition" | "delay", actionType?: string): WorkflowNode
// Add "split" to this type union
// addNodeAfter, removeNode need to handle split's branchA/branchB pointers (same as condition's trueBranch/falseBranch)
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add SplitNode type and execution engine handler</name>
  <files>
    src/lib/execution/types.ts,
    src/lib/execution/engine.ts,
    src/lib/workflows/export-import.ts
  </files>
  <action>
1. In `src/lib/execution/types.ts`:
   - Add `SplitNode` interface modeled on `ConditionNode` but simpler:
     ```typescript
     export interface SplitNode {
       id: string
       type: "split"
       label: string
       config: Record<string, unknown>  // minimal -- just label essentially
       nextNodeId: string | null  // merge point after both branches
       branchA: string | null
       branchB: string | null
     }
     ```
   - Update `WorkflowNode` union: `ActionNode | ConditionNode | DelayNode | SplitNode`

2. In `src/lib/execution/engine.ts`:
   - Import `SplitNode` from types
   - Add `case "split"` in the main `executeRun` switch statement, modeled on the condition handler but executing BOTH branches unconditionally:
     ```typescript
     case "split": {
       const output = { split: true }
       context.nodes[node.id] = { output, status: "completed" }
       await completeStep(step.id, output)
       await persistContext(runId, context)

       // Execute both branches (sequentially -- true parallelism is out of scope)
       const delayA = await executeBranch(node.branchA, nodeMap, context, runId)
       if (delayA) return
       const delayB = await executeBranch(node.branchB, nodeMap, context, runId)
       if (delayB) return

       nextNodeId = node.nextNodeId  // merge point
       break
     }
     ```
   - Update the `default` exhaustive check (it will naturally work once SplitNode is in the union)

3. In `src/lib/workflows/export-import.ts`:
   - Add `"split"` to the `KNOWN_NODE_TYPES` Set on line 65
  </action>
  <verify>
    <automated>cd /home/pedro/programming/pipelite && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>SplitNode type exists in WorkflowNode union, execution engine handles split by running both branches, export-import recognizes split node type</done>
</task>

<task type="auto">
  <name>Task 2: Add split node to visual editor (converter, mutations, node component, type picker)</name>
  <files>
    src/app/workflows/[id]/edit/lib/types.ts,
    src/app/workflows/[id]/edit/lib/graph-converter.ts,
    src/app/workflows/[id]/edit/lib/graph-mutations.ts,
    src/app/workflows/[id]/edit/lib/editor-store.ts,
    src/app/workflows/[id]/edit/components/node-types/split-node.tsx,
    src/app/workflows/[id]/edit/components/node-types/index.ts,
    src/app/workflows/[id]/edit/components/type-picker.tsx,
    src/app/workflows/[id]/edit/components/side-panel.tsx,
    src/app/workflows/[id]/edit/lib/graph-converter.test.ts,
    src/app/workflows/[id]/edit/lib/graph-mutations.test.ts
  </files>
  <action>
1. In `src/app/workflows/[id]/edit/lib/types.ts`:
   - Add `"split"` to the `nodeType` union in `EditorNodeData`: `"trigger" | "action" | "condition" | "delay" | "split"`

2. In `src/app/workflows/[id]/edit/lib/graph-converter.ts`:
   - Import `SplitNode` from execution types
   - In `toReactFlowGraph`: add handling for `node.type === "split"` alongside the existing condition handling. Create edges for `branchA` and `branchB` with sourceHandles `"branch-a"` and `"branch-b"`, labels "A" and "B". Also handle `nextNodeId` for merge point (same pattern as condition node).
   - In `toWorkflowNodes`: add handling for `workflowNode.type === "split"`. Find edges by sourceHandle `"branch-a"` and `"branch-b"` to reconstruct `branchA` and `branchB`. Find non-branch edge for `nextNodeId`. Cast result as `SplitNode`.

3. In `src/app/workflows/[id]/edit/lib/graph-mutations.ts`:
   - Import `SplitNode` from execution types
   - In `addNodeAfter`: add handling for `afterNode.type === "split"` with branch parameter mapping `"true"` -> `branchA`, `"false"` -> `branchB` (reuse the branch param convention, or add `"branch-a"` / `"branch-b"` as valid values). Simplest: treat branch param `"true"` as branchA and `"false"` as branchB for consistency with existing condition pattern.
   - In `removeNode`: add `if (clone.type === "split")` block to update `branchA`/`branchB` pointers when a removed node was referenced (same pattern as condition's trueBranch/falseBranch).
   - In `reorderNode`: add split branch handling in the `pointed` set building (add branchA/branchB).
   - In `createNewNode`: add `"split"` to the type param union and add a case:
     ```typescript
     case "split":
       return {
         id, type: "split", label: "Split",
         config: {}, nextNodeId: null,
         branchA: null, branchB: null,
       } as SplitNode
     ```
   - Update the `addNode` type in `editor-store.ts` to accept `"split"` in the type union: change `type: "action" | "condition" | "delay"` to `type: "action" | "condition" | "delay" | "split"` in both the `EditorActions` interface and the `openTypePicker` isn't affected (it already passes type through).

4. Create `src/app/workflows/[id]/edit/components/node-types/split-node.tsx`:
   - Model on `condition-node.tsx` but with cyan/teal color scheme (`border-l-cyan-500`, icon `Split` or `GitFork` from lucide-react)
   - Two source handles: `id="branch-a"` at `left: "30%"` and `id="branch-b"` at `left: "70%"`
   - Labels "A" and "B" below the card (like condition shows "Yes"/"No")
   - Plus buttons for empty branches, using `openTypePicker(id, "true")` for branch-a and `openTypePicker(id, "false")` for branch-b (reusing condition's branch convention)
   - Delete button on hover, target handle on top
   - Use `GitFork` icon from lucide-react (or `Split` if available; check lucide docs -- `GitFork` is safe)

5. In `src/app/workflows/[id]/edit/components/node-types/index.ts`:
   - Import `SplitNode` and add `split: SplitNode` to `nodeTypes`

6. In `src/app/workflows/[id]/edit/components/type-picker.tsx`:
   - Add split option to `NODE_OPTIONS` array:
     ```typescript
     { label: "Split", icon: GitFork, colorClass: "text-cyan-600 bg-cyan-50", type: "split" }
     ```
   - Import `GitFork` from lucide-react
   - Update the NodeOption interface: `type: "action" | "condition" | "delay" | "split"`

7. In `src/app/workflows/[id]/edit/components/side-panel.tsx`:
   - Add a `"split"` case in ConfigRouter that renders a minimal config (just a label input, or a simple message "Split node sends execution to both branches"). Simplest: render a div with text "Split node fans out to two parallel branches. No configuration needed." and optionally a label edit field using `updateNodeLabel`.

8. Add tests in `graph-converter.test.ts`:
   - Test `toReactFlowGraph` with a split node creates correct edges for branchA/branchB with sourceHandles
   - Test `toWorkflowNodes` round-trip preserves split node branchA/branchB

9. Add tests in `graph-mutations.test.ts`:
   - Test `addNodeAfter` with a split node inserts into branchA/branchB
   - Test `removeNode` updates split node pointers
   - Test `createNewNode("split")` returns valid SplitNode
  </action>
  <verify>
    <automated>cd /home/pedro/programming/pipelite && npx vitest run src/app/workflows/[id]/edit/lib/ --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>Split node appears in type picker, renders in editor with dual output handles (A/B), graph converter handles round-trip conversion, mutations handle split pointers, all existing + new tests pass</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npx vitest run src/app/workflows/[id]/edit/lib/` -- all converter and mutation tests pass
3. Visual check: open a workflow in the editor, add a split node from the type picker, see it render with A/B branches and plus buttons
</verification>

<success_criteria>
- SplitNode type exists in WorkflowNode union with branchA/branchB pointers
- Execution engine handles split by executing both branches sequentially
- Split node renders in the visual editor with two output handles
- Graph converter correctly round-trips split nodes (DB <-> React Flow)
- Graph mutations handle split pointers for add/remove operations
- Split appears in the type picker with a distinct icon/color
- All existing tests continue to pass, new split-specific tests added
- Export/import recognizes split as a valid node type
</success_criteria>

<output>
After completion, create `.planning/quick/260328-rza-add-split-node-type-for-workflow-paralle/260328-rza-SUMMARY.md`
</output>
