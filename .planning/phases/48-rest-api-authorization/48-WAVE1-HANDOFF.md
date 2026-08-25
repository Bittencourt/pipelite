# Wave 1 handoff — measured by the orchestrator after merging all five plans

**Suite after merge:** 177 files / **5311 passed** / 32 skipped (baseline 172 / 5237; delta = exactly
the 74 tests wave 1 added: 12 + 9 + 13 + 10 + 30). Tree clean, zero deletions in any merge.

## The detector sees the fixes — offender list 17 → 13

`activities/[id]` GET, PUT and DELETE and the `activities` list GET have **dropped out** of the
offender list. Corpus counts moved consistently: `ctx.userId` 22 → **28**, owner-like accesses
123 → **130**.

## FALSE POSITIVE for plan 48-08 to resolve — `activities/route.ts:140` POST

The POST is **correctly fixed** by plan 48-02 and the detector still flags it. Verified by reading the
merged source:

- `if (owner_id && owner_id !== ctx.userId)` → 422 `owner_id cannot be set to another user`
- `const activityOwnerId = owner_id || ctx.userId` — after that guard, provably the caller's own id
- the value then reaches the mutation as **`userId`**, not `ownerId` (plan 48-02 measured this naming
  mismatch: `createActivityMutation`'s input is `userId`, written to `activities.ownerId`)

So the handler authorizes through an **intermediate binding**, and rule 4 (`ownerId: ctx.userId`
property assignment) does not see it.

**48-08 must resolve this deliberately, and MUST NOT simply add it to an exemption list.** A silent
exemption here would be the eleventh vacuous gate — the gate would stop reporting a handler because it
was told to, not because the handler is safe. Two acceptable resolutions:

1. **Extend the rules** to follow a binding whose initialiser is provably identity-derived
   (`x = foo || ctx.userId` after a guard rejecting a non-equal `foo`). Stronger, and it would also
   catch the same shape in future routes.
2. **Exempt it as a LIVE CONTROL** — the exemption asserts the handler *still exhibits* the guard
   (the `!==` rejection AND the `|| ctx.userId` fallback). If either disappears, the control goes red.
   Precedent: `deployment-docs-accuracy.test.ts:537-556` + `:692-700`.

Either way, **state which was chosen and why**, and prove it by deleting the guard and watching the
gate go red.

## Also note — 48-02's handoff, verified

`activities/route.ts` GET now authorizes via a **WHERE-scope** (`eq(activities.ownerId, ctx.userId)`
inside a conditions array), not fetch-then-compare. The detector's rule 1 catches it — confirmed, it
is no longer in the offender list. Recorded because a gate looking only for `!== ctx.userId` would
have produced a confident false negative.

## The 13 remaining offenders, for the record

`activities/route.ts:140` POST (the false positive above) ·
`custom-field-definitions/[id]` GET/PUT/DELETE and `custom-field-definitions/route.ts` GET/POST (5) ·
`docs/route.ts:14` GET (1) · `workflow-templates/[id]` GET/DELETE and `workflow-templates/route.ts`
GET/POST (4) · `workflows/[id]/runs/[runId]:14` GET and `workflows/[id]/runs:23` GET (2 — these are
**SEC-48-A**, deliberately out of scope and recorded in BACKLOG.md).

48-08 must classify every one of these as in-scope-fixed, legitimately-exempt-with-a-live-control, or
accepted-known-and-asserted-still-broken. **No offender may simply vanish.**
