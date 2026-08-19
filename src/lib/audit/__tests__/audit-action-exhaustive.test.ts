/**
 * `AuditAction` is declared TWICE and consumed by two EXHAUSTIVE `Record<AuditAction, …>` maps.
 * This file is the only thing standing between that arrangement and silent divergence.
 *
 * Why it exists (Phase 36's lesson, paid for in Phase 39): `tsc` CANNOT see divergence between
 * two structurally separate string unions. Adding a literal to
 * `src/db/schema/audit-log.ts` and forgetting `src/lib/timeline/types.ts` typechecks cleanly —
 * every value flowing between the two layers is narrower than the wider union, so nothing
 * complains until an audit row with the new action reaches the timeline at runtime and renders as
 * a blank entry. The compile-time equality assertion below turns that into a build break.
 *
 * The two exhaustive maps are a different failure mode: they are enforced by `tsc` on ADDITION,
 * but nothing stops a future editor from "fixing" the resulting compile error by relaxing either
 * one to a `Partial<…>` of its `Record`. That converts a build break into an `undefined` badge
 * variant and an `undefined` precedence rank. The source scan below forbids it, comment-blind, and
 * this comment deliberately does not spell the forbidden pattern out — it is grep-gated at zero
 * occurrences repo-wide, so writing it here in prose would defeat the gate (Phase 35's rule).
 *
 * SCOPE: this file asserts the SHAPE of the action vocabulary — not the behaviour of anything that
 * reads it. `linked-records.ts`'s fold and `run-changed-records.tsx`'s render have their own tests.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"
import type { AuditAction as SchemaAuditAction } from "@/db/schema/audit-log"
import type { AuditAction as TimelineAuditAction } from "@/lib/timeline/types"

const LINKED_RECORDS = "src/lib/audit/linked-records.ts"
const RUN_CHANGED_RECORDS =
  "src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx"

/**
 * Invariant type-level equality: `(<T>() => T extends A ? 1 : 2)` is only assignable to its `B`
 * counterpart when `A` and `B` are the same type. Plain mutual `extends` would accept
 * `"a" | "b"` against `"a" | "b" | "c"` in the widening direction and miss exactly the divergence
 * this file exists to catch.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false

/**
 * The compile-time half of the proof. If the two `AuditAction` declarations stop being identical,
 * `Equals<…>` resolves to `false`, this initialiser stops typechecking, and `npm run typecheck`
 * fails — which is the point: the failure must not wait for the test run.
 */
const auditActionDeclarationsAgree: Equals<SchemaAuditAction, TimelineAuditAction> = true

/**
 * The single source of the runtime action list, typed so it cannot drift from the union: a missing
 * key is a compile error, and so is a key that is not an `AuditAction`. Nothing below hardcodes a
 * count — the expected arity is derived from here.
 */
const AUDIT_ACTION_PRESENCE: Record<SchemaAuditAction, true> = {
  created: true,
  updated: true,
  deleted: true,
  merged: true,
}

const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_PRESENCE) as SchemaAuditAction[]

/**
 * Return the balanced-brace body of `const <name> … = { … }` from already-comment-stripped source.
 * Balanced rather than greedy-to-`}` so a nested object literal cannot truncate the body, and
 * balanced rather than line-counted so reformatting the map does not break the gate.
 */
function objectLiteralBody(source: string, declName: string): string {
  const declAt = source.indexOf(`const ${declName}`)
  expect(declAt, `${declName} declaration not found`).toBeGreaterThan(-1)

  const openAt = source.indexOf("{", declAt)
  expect(openAt, `${declName} has no object literal`).toBeGreaterThan(-1)

  let depth = 0
  for (let i = openAt; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1
    else if (source[i] === "}") {
      depth -= 1
      if (depth === 0) return source.slice(openAt + 1, i)
    }
  }

  throw new Error(`${declName}'s object literal is unbalanced`)
}

/** Top-level `key: value` pairs of a flat object-literal body, in source order. */
function literalEntries(body: string): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const line of body.split("\n")) {
    const match = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/.exec(line)
    if (match) entries.push([match[1], match[2]])
  }
  return entries
}

describe("AuditAction — the two declarations", () => {
  it("are identical types (compile-time assertion; this run only records it)", () => {
    // The real gate is `tsc`. If the unions diverged, this file would not have compiled.
    expect(auditActionDeclarationsAgree).toBe(true)
  })

  it("cover the four literals the merge depends on", () => {
    expect(AUDIT_ACTIONS.sort()).toEqual(["created", "deleted", "merged", "updated"])
  })

  it("both name `merged` in their own source (not only in a comment)", () => {
    // Comment-blind: the words "merged" appear in prose in both files, so a prose-only match
    // would make this gate self-satisfying.
    for (const path of ["src/db/schema/audit-log.ts", "src/lib/timeline/types.ts"]) {
      const source = readStrippedSource(path)
      const union = /export type AuditAction =([^\n]*(?:\n[^\n]*)?)/.exec(source)
      expect(union, `${path} has no AuditAction declaration`).not.toBeNull()
      expect(union![1]).toMatch(/["']merged["']/)
    }
  })
})

describe("ACTION_RANK — src/lib/audit/linked-records.ts", () => {
  const entries = literalEntries(objectLiteralBody(readStrippedSource(LINKED_RECORDS), "ACTION_RANK"))
  const rank = Object.fromEntries(entries.map(([key, value]) => [key, Number(value)]))

  it("has exactly one entry per AuditAction and no others", () => {
    expect(Object.keys(rank).sort()).toEqual([...AUDIT_ACTIONS].sort())
    expect(entries).toHaveLength(AUDIT_ACTIONS.length)
  })

  it("assigns a distinct rank to every action", () => {
    // A collision is not a typecheck error but it IS a bug: the fold's `>` comparison would keep
    // whichever row it happened to see first, making the reported action order-dependent.
    const values = Object.values(rank)
    expect(new Set(values).size, `duplicate ranks in ACTION_RANK: ${JSON.stringify(rank)}`).toBe(
      values.length
    )
  })

  it("ranks deleted > merged > created > updated", () => {
    // The precedence the RunChangedRecord contract names. `merged` is written on the SURVIVOR,
    // which is alive, so it must not outrank a deletion.
    expect(rank.deleted).toBeGreaterThan(rank.merged)
    expect(rank.merged).toBeGreaterThan(rank.created)
    expect(rank.created).toBeGreaterThan(rank.updated)
  })

  it("is not a Partial<Record<…>>", () => {
    const source = readStrippedSource(LINKED_RECORDS)
    expect(source).toContain("const ACTION_RANK: Record<AuditAction, number>")
    expect(source).not.toMatch(/Partial\s*<\s*Record\s*<\s*AuditAction/)
  })
})

describe("ACTION_BADGE_VARIANT — run-changed-records.tsx", () => {
  const entries = literalEntries(
    objectLiteralBody(readStrippedSource(RUN_CHANGED_RECORDS), "ACTION_BADGE_VARIANT")
  )
  const variants = Object.fromEntries(entries)

  it("has exactly one entry per AuditAction and no others", () => {
    expect(Object.keys(variants).sort()).toEqual([...AUDIT_ACTIONS].sort())
    expect(entries).toHaveLength(AUDIT_ACTIONS.length)
  })

  it("never uses the destructive variant", () => {
    // The file's own comment reserves `--destructive` for confirmations and toast.error. A
    // completed merge, like a completed deletion, is a fact about the record — not a warning.
    for (const [action, variant] of entries) {
      expect(variant, `${action} must not be destructive`).not.toMatch(/destructive/)
    }
    expect(variants.merged).toMatch(/secondary/)
  })

  it("is not a Partial<Record<…>>", () => {
    const source = readStrippedSource(RUN_CHANGED_RECORDS)
    expect(source).toContain('const ACTION_BADGE_VARIANT: Record<AuditAction, "outline" | "secondary">')
    expect(source).not.toMatch(/Partial\s*<\s*Record\s*<\s*AuditAction/)
  })
})
