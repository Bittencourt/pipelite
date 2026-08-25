# Phase 48 — Deferred Items

Out-of-scope discoveries logged during execution. Per the executor scope boundary these are NOT
fixed here: they are not caused by this phase's changes.

---

## DEF-48-01 — `src/lib/views/queries.db.test.ts` fails in `afterAll` (pre-existing)

**Found during:** 48-06, Task 3 verification (`npm run test:db` over the whole db project).

**Symptom:**

```
 FAIL  |db| src/lib/views/queries.db.test.ts [ src/lib/views/queries.db.test.ts ]
Error: Failed query: select count(*)::int as n from "saved_view_defaults" where id::text like $1
params: viewsdbt-%
Caused by: PostgresError: column "id" does not exist
 ❯ src/lib/views/queries.db.test.ts:250:23
Serialized Error: { severity: 'ERROR', code: '42703', position: '60', routine: 'errorMissingColumn' }
```

**Cause:** the `afterAll` at `queries.db.test.ts:246-260` issues the leftover query for EVERY entry in
`TOUCHED_TABLES` and only *afterwards* skips the assertion for `saved_view_defaults`:

```ts
const leftovers = await db.execute(
  sql`select count(*)::int as n from ${sql.identifier(table)} where id::text like ${LIKE_PREFIX}`,
)

if (table !== "saved_view_defaults") {
  expect(...)
}
```

`saved_view_defaults` has no `id` column (its key is `(user_id, entity_type)`), so the query throws
before the guard is reached. The guard skips the *assertion*, not the *query*.

**Proven pre-existing, not caused by 48-06:**
- The file's last commit is `f097b5b test(40-05): …` — Phase 40, untouched by this phase.
- It fails identically when run ALONE, with none of 48-06's files loaded:
  `./node_modules/.bin/vitest run --config vitest.db.config.ts src/lib/views/queries.db.test.ts`
  → `Test Files 1 failed (1) / Tests 28 passed (28)`.
- All 28 of its own assertions pass. Only the teardown throws.

**Consequence:** `npm run test:db` exits non-zero even when every test in every db file passes
(`73 passed (73)`, `Test Files 1 failed | 2 passed (3)`). Any future plan gating on `npm run test:db`'s
EXIT CODE will read a green suite as red.

**Fix when picked up:** move the `db.execute` inside the guard, or give the table its own predicate —
`queries.db.test.ts` already needs the per-table `LEFTOVER_PREDICATE` map that
`activities-scope.db.test.ts:216-222` introduced for the same reason (`audit_log.id` is a generated
UUID, so an id-prefix leftover check there would be vacuously zero).

**Also worth noting when fixing:** with the query throwing, that file's `count(*) === baseline`
re-assert never runs for any table after `saved_view_defaults` in `TOUCHED_TABLES` order. Its
fixture-restoration guarantee is therefore weaker than it reads.

---

## DEF-48-02 — a soft-deleted user's API key still authenticates

**Found during:** 48-06, Task 1 (reading `src/lib/api-keys.ts:56-95` in full for the fixture recipe).

`validateApiKey` checks `apiKeys.deletedAt` but never reads `users.deletedAt` or `users.status`. A key
belonging to a soft-deleted or `rejected` user therefore still authenticates every `/api/v1` request
and still establishes an `api_key` actor scope. Recorded by 48-RESEARCH § Q2 as "worth a note; out of
scope" and out of scope here too — 48-06 only proves the list scope, and widening the fixture to cover
account lifecycle would be a different requirement.
