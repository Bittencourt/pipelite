---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Foundation & CRM Depth
status: executing
last_updated: "2026-08-18T09:48:43.961Z"
last_activity: 2026-08-18
progress:
  total_phases: 14
  completed_phases: 8
  total_plans: 112
  completed_plans: 104
  percent: 57
---

# Session State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** API-complete CRM core that handles fundamentals well
**Current focus:** Phase 45 — Cross-Cutting UI Repair and UAT Closure

## Position

Phase: 45 - Cross-Cutting UI Repair and UAT Closure
Plan: 3 of 11 complete
Status: Ready to execute
Last activity: 2026-08-18

Progress: [█████████░] 93%

## Performance Metrics

**Velocity:**

- Total plans completed: 111 across 3 shipped milestones (v1.0: 73, v1.1: 12, v1.2: 26)
- v1.3 plans completed: 9 (Phases 32 and 33 complete)

| Phase / Plan | Duration | Tasks | Files |
|---|---|---|---|
| Phase 33 P01 | 12min | 2 tasks | 2 files |
| Phase 33 P02 | 9min | 2 tasks | 4 files |
| Phase 33 P03 | 21min | 3 tasks | 4 files |
| Phase 34 P11 | 70min | 3 tasks | 4 files |
| Phase 34 P13 | 13min | 2 tasks | 6 files |
| Phase 44 P03 | 5min | 2 tasks | 3 files |
| Phase 44 P05 | 9min | 2 tasks | 3 files |
| Phase 44 P02 | 16min | 2 tasks | 2 files |
| Phase 44 P04 | 17min | 2 tasks | 8 files |
| Phase 44 P01 | 17min | 2 tasks | 6 files |
| Phase 44 P06 | 12min | 2 tasks | 3 files |
| Phase 44 P07 | 9min | 2 tasks | 2 files |
| Phase 44 P08 | 15min | 2 tasks | 6 files |
| Phase 45 P01 | 10min | 2 tasks | 4 files |
| Phase 45 P02 | 34min | 3 tasks | 8 files |
| Phase 45 P07 | 12min | 3 tasks | 5 files |

## Decisions

- Used globalThis singleton pattern for CrmEventBus (hot-reload safety)
- Added removeAllListeners to bus for test isolation
- Split TDD task into two commits (event bus + tests, then schema + migration)
- Used z.input<> instead of z.infer<> for createWorkflow param type so Zod defaults work transparently
- Workflows not owner-scoped; all authenticated users can CRUD any workflow
- Introduced mutation layer pattern (src/lib/mutations/) for reusable DB operations
- updateDealMutation returns newAssigneeUserIds/dealTitle for email handling in server action
- API routes emit CRM events directly via crmBus (different auth patterns than server actions)
- Ownership checks remain in server actions/API routes; mutations only check entity existence
- Activity API route PUT emits events directly via crmBus (different field mapping than mutations)
- Pipeline/stage/custom-field-def triggerWebhook calls removed (config entities, not CRM data)
- Org batch route uses individual mutation calls for per-entity event emission
- Manual migration SQL for trigger->triggers array to safely wrap existing data
- Partial index on next_run_at WHERE active=true for schedule polling efficiency
- workflowTemplates keeps singular trigger column (separate concern)
- [Phase 25]: matchesTrigger is a pure function for testability; DB access only in matchAndFireTriggers
- [Phase 25]: Each createWorkflowRun wrapped in try-catch so one failure doesn't block other matches
- [Phase 25]: Secret in URL path as sole auth for inbound webhooks (no header auth required from callers)
- [Phase 25]: All webhook error states return 404 for zero information leakage
- [Phase 25]: Only workflow creator can regenerate webhook secret (authorization check)
- [Phase 25]: Overlap queuing: always create pending runs even if previous run is active (no skip, no parallel)
- [Phase 25]: Atomic claim via UPDATE...RETURNING sets nextRunAt to null to prevent duplicate processing
- [Phase 25]: cron-parser v5 API: CronExpressionParser.parse() with .next().toDate()
- [Phase 26]: String coercion for equals/contains operators enables flexible trigger data comparison
- [Phase 26]: Invalid regex patterns return false (graceful degradation for user-provided patterns)
- [Phase 26]: resolveFieldPath dot-notation walker reused across condition evaluator and delay resolver
- [Phase 26]: AsyncLocalStorage for recursion depth tracking -- propagates across async boundaries without parameter threading
- [Phase 26]: Recursion limit of 5 levels with immediate failed-status creation prevents runaway chains
- [Phase 26]: toggleWorkflow uses bulk UPDATE...RETURNING for atomic waiting-run cancellation with count
- [Phase 26]: Action nodes are stubs returning { type, status: "stub" } -- Phase 27 implements real actions
- [Phase 26]: 5s poll interval for execution processor (faster than 30s schedule processor for responsiveness)
- [Phase 26]: Drain loop claims all available pending runs per tick, not just one
- [Phase 26]: executeBranch walks linearly -- no nested conditions in v1

- [Phase 27]: Separated registry.ts from index.ts to break circular dependency in action handler registration
- [Phase 27]: Static side-effect import for handler registration (deterministic loading vs async dynamic import)
- [Phase 27]: QuickJS runtime per invocation with dispose in finally block for sandbox isolation
- [Phase 27]: TRANSFORM_HELPERS duplicated from formula-engine (var for QuickJS compat, expanded API)
- [Phase 27]: In-memory Promise map for webhook response coordination (waitFor/send pattern)
- [Phase 27]: Synchronous executeRun() for webhook-response workflows; async processor for others
- [Phase 27]: Direct registry import pattern in action tests to avoid crm.ts DB chain
- [Phase 27]: SSRF validates resolved IPs via dns.resolve to catch DNS rebinding; falls back to direct IP check
- [Phase 27]: HTTP response parsed as JSON when content-type includes application/json, otherwise as text
- [Phase 27]: Mutation dispatch map uses type-cast wrappers to normalize varying mutation signatures
- [Phase 27]: Field lookup uses ilike for case-insensitive matching on text fields
- [Phase 27]: Email handler resolves user recipients via batch DB query with inArray
- [Phase 27]: Workflow email templates are simple (no i18n) since subject/body are user-authored

- [Phase 28]: workflowNodes as DB source of truth; RF nodes derived via reconversion on every mutation
- [Phase 28]: Static ACTION_OUTPUT_SCHEMAS map for variable autocomplete (not runtime introspection)
- [Phase 28]: Virtual trigger node (id="trigger") stores TriggerConfig[] in data, excluded from DB conversion
- [Phase 28]: Condition node nextNodeId for post-merge continuation; trueBranch/falseBranch for branch edges
- [Phase 28]: Fixed updateWorkflow action to use triggers (plural) matching mutation schema
- [Phase 28]: ReorderControls disable logic: up disabled when predecessor is trigger/condition, down disabled when next is null/condition
- [Phase 28]: Config forms shared pattern: {nodeId, config} props, onChange calls store.updateNodeConfig for immediate auto-save
- [Phase 28]: Trigger config manages triggers array via setTriggers separately from node config
- [Phase 28]: ConfigRouter in side-panel routes by nodeType then actionType for clean form selection
- [Phase 28]: forwardRef + useImperativeHandle for keyboard event forwarding from VariableField to VariablePicker
- [Phase 28]: onMouseDown (not onClick) on picker options prevents blur-before-click issue
- [Phase 28]: Transform code textarea excluded from variable picker (JS code, not template interpolation)
- [Phase 28]: Renamed layout.ts to dagre-layout.ts to avoid Next.js route file naming conflict
- [Phase 28]: Used defaultEdgeOptions on ReactFlow instead of modifying graph-converter edge creation
- [Phase 30]: Used db.select() instead of db.query for workflowTemplates (no relations defined for standalone table)
- [Phase 30]: Export is pure client-side via Blob/ObjectURL (no server round-trip)
- [Phase 33]: Indexes declared in the Drizzle schema files and generated, never hand-written into migration SQL (D-06) -- a hand-written index was silently dropped by a later generate in this repo (0009 -> 0010)
- [Phase 33]: All 11 CRM indexes are plain single-column btrees -- no partial (D-02, breaks the stage-delete guard and buys nothing measurable), no CONCURRENTLY (D-03, drizzle-kit wraps migrations in a transaction), no composite (stage_id, position) (D-04, measured to push the planner back to Seq Scan and actively fail SC-1)
- [Phase 33]: Bitmap Index Scan accepted as satisfying an "index scan" criterion (D-01) -- a plain Index Scan node is physically unachievable for a ~3,753-row scattered fetch at any selectivity where the index wins
- [Phase 33]: deals.owner_id is verified by pg_indexes catalog assertion only, never by EXPLAIN (D-05) -- n_distinct = 1 in this dataset, so the planner correctly ignores that index forever
- [Phase 33]: random_page_cost left at the Postgres default of 4 (D-08) -- it is why the deals selectivity crossover sits at 15-19%; tuning it for SSD is server config, not an index, and is deferred
- [Phase 33]: Corrected STATE.md's stale "partial index on next_run_at WHERE active=true" precedent -- that index no longer exists in the database (dropped by 0010); it is a cautionary tale, not a supporting pattern
- [Phase ?]: Phase 34: all 17 write paths dispositioned by source inspection; D-11 proven end to end in Docker with a real formula field
- [Phase ?]: SC-3 is mechanically delivered but only partially usable: bracket field paths work, no UI emits them, 152/169 field names require the syntax
- [Phase 44]: buildClientFieldValues mirrors buildFormulaFieldValues in a db-free module; a parity test enforces that the two change together
- [Phase 44]: Client natives are normalised with ?? null, matching the server's row?.[column] ?? null, so no undefined reaches the QuickJS sandbox
- [Phase 44]: Radix asChild guard is dev-only (D-44-03) -- a production throw would turn a degraded page into a hard crash
- [Phase 44]: Diagnostic guards must not also repair the render -- an in-component fallback masks the broken RSC boundary contract for the next asChild consumer
- [Phase 44]: The guard log never serializes children or prop values (T-44-18), asserted by test rather than by comment
- [Phase ?]: 44-02: saveFieldValues returns { success, values } — values is recalculateFormulas' customFields, falling back to the written blob when it throws (D-05 preserved)
- [Phase ?]: 44-02: the recalc result local is seeded with next BEFORE the try, so the D-05 catch block stays literally unchanged
- [Phase 44]: 44-04: bound constants live in the client-safe formula-engine.ts and are re-exported by formula-recalc.ts, so formula-recalc.test.ts's untouched 8 MiB / 500 ms assertions guard both client and server against drift
- [Phase ?]: 44-01: the react-server vitest project lives in a separate vitest.rsc.config.ts run by a compound test script; ssr.resolve.conditions (not resolve.conditions alone) is what applies the condition on vitest 4.0.18
- [Phase ?]: 44-06: CFUI-01 repaired structurally — both FieldDialog trigger sites (header Add Field and archived-field Restore) moved into a 'use client' wrapper so no React element crosses the RSC boundary into Radix's asChild slot
- [Phase ?]: 44-06: the CFUI-01 gate is 'page.tsx contains no <FieldDialog', never a header-only assertion — serializedSize accumulates across the Flight row, so the archived Restore triggers were broken too and invisible only because deal has no archived definitions
- [Phase ?]: 44-06: a repo-wide scan now fails if any server component renders a children-forwarding asChild component (193 tsx files, 2 definers, 3 usages, all client) — the mechanism is gated, not just the one file
- [Phase 44]: The server's recomputed custom_fields blob REPLACES localValues after a save rather than being merged key-by-key — Merging only the edited key is what left stale formula wrappers in place, making the displayed formula one save behind the stored one (CFUI-02)
- [Phase 44]: Client-component wiring is gated by comment-stripped source reads, not by rendering the component — Rendering a 'use client' component needs jsdom plus a testing library, which phase 44 must not install; the behaviour is unit-tested in the pure helper modules and the source gate proves the component calls them
- [Phase 44]: 44-08: project admin field rows once and share one array (45028 B -> 22353 B, -50.4%) — React Flight back-references an already-written array, so a separate slim availableFields array measured 58681 B - a net increase. Payload optimisation only; CFUI-01 stays fixed structurally by 44-06.

- [Phase 35]: The timeline assembler is the only hand-composed SQL in the codebase — every value binds, `entityType` is validated against the four literals before it reaches a predicate, and `deleted_at IS NULL` is carried EXPLICITLY on every read path (the partial `notes_live_idx` does not enforce its own predicate)
- [Phase 35]: A JS `Date` must never be bound into a raw drizzle `sql` fragment — postgres.js throws ERR_INVALID_ARG_TYPE. Bind `${iso}::text::timestamp`; a bare `::timestamp` lets Postgres resolve the parameter to OID 1114 and the driver re-serializes it through a `Date`, silently truncating microseconds and breaking keyset paging
- [Phase 35]: `onSuccess` on the four record dialogs was renamed `onRecordSaved` and is refresh-only — dialog closing lives exclusively in `onOpenChange`. The rename was the enforcement: all seven call sites became type errors
- [Phase 35]: `revalidatePath` DOES refresh the current client tree regardless of the path argument (measured in a standalone Next 16.1.6 probe), so any effect keyed on a server-rebuilt array prop must guard against being re-run mid-submit
- [Phase 35]: Legacy `notes` columns are dormant, NOT dropped — that is what keeps `scripts/reconcile-notes.sql` re-runnable as a standing detector
- [Phase 35]: Formulas referencing `Notes` now freeze at their migration-time value; re-pointing the attribute is an undecided semantic question deferred to the column-drop phase
- [Phase 35]: A doc comment that NAMES a token gated at zero occurrences is itself a gate violation — this fired three times in one phase. Reword rather than weaken the gate
- [Phase 35]: Raw NUL bytes written into a source file silently flip it to binary for git and grep, disabling the plan's own gates — use `\u0000` escapes

- [Phase 36]: `.planning` files must be COMMITTED, not merely written — the directory is gitignored-but-tracked, so an uncommitted file there is invisible to `git status` AND absent from every executor worktree. 36-PATTERNS.md was written but uncommitted and plan 36-01 could not read it
- [Phase 36]: `AuditActorKind` is deliberately declared TWICE — in `src/db/schema/audit-log.ts` (owns the persisted contract) and in `src/lib/audit/actor-context.ts`, which carries an explicit dependency-free invariant because all four entry boundaries import it and any dependency propagates into all of them. They are identical today and nothing enforces it; typecheck cannot catch divergence between two structurally identical string unions. **Add a compile-time type-equality assertion in plan 36-11**, which consumes both — do NOT resolve it by importing the schema into actor-context
- [Phase 36]: `npx` resolves to `npm run` in this environment, so `npx drizzle-kit` fails on the host with "Missing script". Use `./node_modules/.bin/drizzle-kit` on the host; `npx` works normally inside the container
- [Phase 36]: `SELECT count(*) FROM pg_indexes WHERE tablename='audit_log'` returns 5, not 4 — `pg_indexes` includes the primary key. Filter `AND indexname LIKE 'audit_log%_idx'`
- [Phase 36]: The audit diff must NOT union both sides' keys blindly — the REST serializers omit `deleted_at` while the pre-read row always carries `deletedAt: null`, so a naive union emits a phantom `deletedAt: {from: null, to: undefined}` on every REST edit. Skip native keys absent from `data` on UPDATES only; custom-field sub-keys are exempt because a vanished key there really is a clear

- [Phase 37]: Restore is `SET deleted_at = NULL` and nothing more — success criterion 2's "children orphaned when the parent was deleted" describes a state this codebase never produces. Proven three ways (write-site grep, hard-delete grep, live data): no delete path nulls or cascades a child FK. Verified in a browser — a restored deal came back with all 3 activities still linked. Do NOT add relinking machinery for this
- [Phase 37]: PURGE is where orphaning happens, and it DETACHES rather than destroys (user decision). All six FKs into the CRM tables are `ON DELETE NO ACTION` and 54.6% of deals have an activity, so refusing would have broken automatic retention for the majority. The transaction nulls the child FK, deletes the row, and audits both halves — an unlinked child is explicable months later
- [Phase 37]: `recalculateFormulas` CANNOT be called for purge-detached children, and the reason is worth knowing: `changedFields: ["dealId"]` selects nothing (a FK is not in `ENTITY_NATIVE_ATTRIBUTES`), `changedRelatedFields` selects the formulas but has no parent row so the engine returns `{error: "Unknown entity: Deal"}` which D-06 would then STORE onto live records, and the function uses module-level `db` not `tx`. Restore's "repair point" argument does not carry over — a purged parent never returns, so those derived values are permanently stale. Documented in all three purge mutations rather than papered over
- [Phase 37]: Phase 36's `no-mutation-coupling.test.ts` gate was narrowed to scope by FUNCTION (keyed off `export async function (restore|purge)*Mutation`), not by file — strictly stronger than an allowlist, since `updateDealMutation` growing an audit reference still fails. Two agents hit the collision independently; the gate's own header had asked for review rather than deletion
- [Phase 37]: A grep-based acceptance gate that searches raw file text collided with an explanatory COMMENT **nine times in one phase** — including once with the plan's own suggested wording, and once with a comment asserting "there is no `db.delete` in this file". Always reword the comment, never weaken the gate; but the real fix is to scope these greps to JSX/code rather than file text
- [Phase 37]: `Readonly<Record<K, fn>>` on a literal passed to `Object.freeze` does NOT get excess-property checking — `T` is inferred from the literal, so an extra key compiles clean. Use an extracted alias plus `satisfies`, and assert BOTH directions (TS2741 missing, TS2353 extra)
- [Phase 37]: A bare `${ids}` in a drizzle `sql` fragment expands an array into a parenthesised list — `= ANY(($1,$2,$3))`, invalid SQL. Use `sql.param(ids)::text[]`. A wholly-mocked suite passes the broken version, which is why this needed a live-database probe
- [Phase 37]: `resize_window` cannot change `window.innerWidth` in this environment. To test a mobile viewport honestly, use a **320px same-origin iframe** — media queries evaluate against the iframe, so Tailwind breakpoints genuinely apply. This turned an unverifiable gap into a found-and-fixed defect
- [Phase 37]: The global app `<header>` overflows the viewport at 320px on EVERY route (`scrollWidth 416` vs `clientWidth 301`, identical on /organizations, /people, /deals, /trash). Pre-existing, app-wide, out of any single phase's scope — tracked as 37-UAT G5
- [Phase 37]: `src/lib/execution/condition-evaluator.test.ts` T-34-20 is a wall-clock ratio assertion (`large/small < 10`) that fails intermittently under vitest's OWN parallel workers (measured 11.9-15.6), not just under parallel agent load — so it is a live CI-flake risk on master. Passes 70/70 in isolation. A Phase 34 file; fix the threshold, do not chase it per-phase

- [Phase 38]: **A green gate is not a passing gate.** Five separate defects this phase were found in the VERIFICATION rather than in the code, and not one would have failed a build: a `revalidatePath`-called-once assertion whose 2-id/1-success batch made per-record and once-per-loop indistinguishable (found independently by 38-11 and 38-12, fixed at 12-id/9-success where the negative proof reports `got 9 times`); a single `it` that asserted arity then looped the copy-key check, so vitest aborted before naming the missing key the criterion demanded; a `grep -c` criterion counting LINES where it meant call sites (an imported-and-used symbol occupies 2); `vi.clearAllMocks()` not draining a `mockResolvedValueOnce` queue, which shifted an ownership assertion onto an owned row so the test passed while asserting the wrong thing; and a `git diff master` suppression check that was a no-op because the waves were already merged. Every acceptance criterion needs an anti-vacuity anchor, and every negative proof must be RUN, not reasoned about
- [Phase 38]: **The comment/grep collision fired FIFTEEN times across phases 37-38**, twice on wording that described the very rule being enforced — and once IN REVERSE, which is the new lesson: 38-19 asserted `[data]` absent from a file on the strength of a doc comment mentioning it, but `[data]` was also live code there (`useMemo(..., [data])`). A token in a comment is not automatically absent from the code. Use `readStrippedSource` from `src/components/custom-fields/__tests__/source-scan.ts` for every gate; prefer minimum counts over exact counts when the target string is the natural way to explain the mechanism
- [Phase 38]: **Claude Code's `isolation="worktree"` forked from a STALE commit (end of phase 34) for all 19 executor agents.** The HEAD-assertion + `git reset --hard <base>` guard corrected every one before work landed, and is not a formality in this repo — dispatch it verbatim and have the agent confirm a known post-base symbol exists before starting
- [Phase 38]: **The Claude-in-Chrome `computer` key action delivers ZERO key events to the page here.** Calibrated, not inferred: a document capture listener saw 0 events for `Escape`, and Space *and* Enter on a plain focused `<button>` produced 0 clicks. Synthetic `KeyboardEvent`s cannot substitute — they never produce the browser's native default action. So keyboard-activation behaviour is UNTESTABLE by this tool; click, JS evaluation, navigation and geometry all work fine. Never report a keyboard check as FAILED on this instrument's evidence — calibrate against a known-good control first
- [Phase 38]: **The app container is `build: .` with no volume mounts, so it serves a baked image.** A browser UAT dispatched without `docker compose up -d --build app` tests pre-phase code and will either report the phase broken or "verify" behaviour that is not running. Rebuild before any UAT
- [Phase 38]: `react-hooks/set-state-in-effect` is an **ERROR** in this repo, so `useEffect(() => setState(...))` fails the lint gate. Three plans hit it independently on code their own plan and 38-UI-SPEC specified verbatim. Use React's adjust-state-on-prop-change pattern (`const [prev, setPrev] = useState(x); if (prev !== x) {...}`) — and note the resulting files contain ZERO `useEffect` calls, so a gate must assert the CONTRACT, never the presence of an effect
- [Phase 38]: **`updateDealMutation(id, {ownerId})` still destroys every `deal_assignees` row** (`deals.ts:406`, because `.partial()` preserves `assigneeIds`' `.default([])`). Phase 38 ROUTED AROUND it with a narrow `updateDealOwnerMutation` and gated `db.delete` as never-called; the underlying bug is NOT fixed. Blast radius is currently zero only because `deal_assignees` is empty
- [Phase 38]: `ownerId` is absent from `organizationSchema`, `personSchema` and `activitySchema`, and **Zod strips unknown keys silently** — `safeParse({ownerId:"u1"})` returns `{success:true, data:{}}`. Routing an owner write through the generic update mutations writes only `updatedAt`, emits an empty diff, and the audit subscriber drops the row: a silent no-op with the whole suite green. This is why the four narrow `update{Entity}OwnerMutation` functions exist
- [Phase 38]: **Per-entity authorization is NOT uniform and must be copied verbatim.** `src/app/deals/actions.ts` guards with `ownerId !== session.user.id && session.user.role !== "admin"`; organizations, people and activities guard with the ownership half ALONE. Unifying them is a privilege escalation on three entities or a regression on one. Proven live: 9/12 `notPermitted` on organizations vs 12/12 success on deals for the same admin
- [Phase 38]: An artifact that says "verified this session" is a CLAIM, not a guarantee — 38-PATTERNS asserted the two data-table twins were byte-identical when the sed-normalised diff already had 20 differing line pairs at the phase base. Re-measure before writing a gate on someone else's measurement
- [Phase 45]: Phase 45 shell copy contract scoped to admin.nav.* + theme.*, with nav.workflows/nav.searchDescription carried as SHELL_EXTRA_KEYS so the 12 pre-existing nav keys stay out of an exact-set contract
- [Phase 45]: IDENTICAL_TRANSLATION_ALLOWED populated with exactly three product nouns (admin.nav.pipelines, admin.nav.webhooks, nav.workflows), each with a recorded reason rather than a blanket exemption
- [Phase 45]: ICU plural structure gated by a dedicated assertion, not placeholderDrift — its placeholder regex cannot match {count, plural, ...} and silently checked nothing
- [Phase 45]: locale-parity.test.ts per-contract assertions use expect.soft so every broken contract names itself in one run instead of only the earliest-listed one
- [Phase ?]: [Phase 45]: 45-02: the e2e admin is pipelite-e2e@local.test, NOT @local — the login form validates with z.string().email() whose zod-4 regex demands a dotted domain, so @local is rejected client-side and never reaches authorize(). .test is an RFC 2606 reserved TLD, so the address stays non-routable
- [Phase ?]: [Phase 45]: 45-02: the e2e seed's dev-database guard is a hostname allow-list (localhost / 127.0.0.1) parsed from E2E_DATABASE_URL — proven by a RUN negative proof, as was the missing-E2E_ADMIN_PASSWORD guard
- [Phase ?]: [Phase 45]: 45-02: @playwright/test has no postinstall by design, so browser binaries are a machine-local step (./node_modules/.bin/playwright install chromium, ~300MB into ~/.cache/ms-playwright) — that is the property that keeps CI from downloading browsers it never uses (V-3)
- [Phase ?]: [Phase 45]: 45-02: auth.setup.ts asserts BOTH the h1 and the final pathname on /admin/audit before saving storageState — a non-admin session is redirected to /?error=unauthorized, which also renders an h1, so the heading alone would not distinguish them
- [Phase ?]: [Phase 45]: 45-07: CommandDialog spread ...props onto the Radix Dialog root, so shouldFilter could never reach the inner <Command> — and cmdk defaults it to true while filtering on each item's value, which in this app is always a UUID. Both shouldFilter and loop are now destructured OUT of the rest spread and passed explicitly; a prop added to the type alone reproduces the bug while looking correct in a diff
- [Phase ?]: [Phase 45]: 45-07: the lifted SearchResults name collided with global-search.tsx's own local 'interface SearchResults' — an import binds both a type and a value, so the payload type moved into search-results.tsx as the exported SearchResultsData
- [Phase ?]: [Phase 45]: 45-07: the move-not-copy gate is 'CommandGroup appears ZERO times in global-search.tsx' — a count of zero is the only formulation that distinguishes an extraction from a duplication, and duplication is how the popover and the future dialog would silently drift

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 5 | Admin user management complete CRUD | 2026-03-23 | 42c8764 | [5-admin-user-management-complete-crud](./quick/5-admin-user-management-complete-crud/) |
| 260328-rza | Add split node type for workflow parallel branching | 2026-03-28 | df34561 | [260328-rza-add-split-node-type-for-workflow-paralle](./quick/260328-rza-add-split-node-type-for-workflow-paralle/) |
| Phase 25 P02 | 2min | 2 tasks | 4 files |
| Phase 25 P04 | 2min | 2 tasks | 6 files |
| Phase 27 P02 | 6min | 2 tasks | 13 files |
| Phase 28 P02 | 6min | 2 tasks | 16 files |
| Phase 28 P05 | 3min | 1 tasks | 2 files |
| Phase 32 P06 | 13min | 3 tasks | 0 files |

## Accumulated Context

### Roadmap Evolution

- v1.0 MVP shipped 2026-03-14 (16 phases, 73 plans)
- v1.1 Reliability & Operations shipped 2026-03-26 (5 phases, 12 plans)
- Formula Reactivity and Bulk Operations deferred from v1.1 (removed from scope)
- v1.2 Workflows roadmap created 2026-03-26 (7 phases, 27 requirements)
- v1.2 Workflows shipped 2026-03-28 (8 phases incl. gap-closure Phase 31, 26 plans)
- Deferred v1.1 scope captured as backlog 2026-08-12: 999.1 formula reactivity, 999.2 bulk operations
- Post-v1.2 codebase review 2026-08-13: 10 findings captured as backlog 999.3-999.12 (CI, indexes, notes timeline, audit log, dedup, saved views, trash/restore, workflow ops, observability, polish)
- v1.3 roadmap created 2026-08-13: all 12 backlog items promoted into Phases 32-43, 37 requirements mapped, backlog now empty
- Phase 45 added 2026-08-18: Cross-Cutting UI Repair and UAT Closure. Not a feature phase — it collects the five app-wide defects found on 2026-08-18 when the outstanding Phase 36-38 human UAT was finally re-run in a real authenticated browser (header overflow at 320px, admin sidebar not collapsing, dark mode unreachable because no ThemeProvider is mounted, untranslated admin/dialog shell strings, and a bulk failure panel that claims records are still selected when they are not), plus the one deals-drag check no available tool can drive. Depends on nothing and can run in parallel with Phases 39-43. That same sweep took cross-phase UAT debt from 10 items to 1 and fixed regression G1 (commit c413198).

### Research Flags

- Phase 26 (Execution Engine): Concurrency model and step yielding need careful design
- Phase 27 (Action Nodes): SSRF prevention requires DNS resolution checks for HTTP node
- Phase 28 (Visual Editor): @xyflow/react + shadcn/ui integration may need experimentation

### Blockers/Concerns

open. No pending todos, no UAT/verification debt (audit-uat: 0 items), working tree clean.

- CSV export drops every custom_* column unless the first exported row carries it (papaparse header derivation); pre-existing, affects all custom fields
- **A purge does not delete uploaded file blobs** (Phase 37 review CR-01, deliberately scoped out of the fix pass). A file custom field stores its bytes under `${UPLOAD_DIR}/${entityId}/${fieldName}/${storedName}` and is referenced only from the record's `customFields` JSONB, so purging the row destroys the reference and leaves the bytes on disk (or in S3), still downloadable by anyone holding the URL — and the URL is recoverable from the soft-delete tombstone in `audit_log`, which purge deliberately preserves. Storage therefore grows monotonically with every purge and the retention pruner is a leak generator. `src/lib/trash/prune.ts` states this gap explicitly rather than implying files are handled. Closing it needs its own plan: irreversible disk deletion inside the most dangerous code path in the phase, plus `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` resolving the entity before serving (it authorizes on `session?.user` alone today — pre-existing, predates Phase 37).
- **A purge leaves the children it detaches holding stale formula values, permanently** (Phase 37 review WR-02). `activities.dealId`, `deals.personId`, `deals.organizationId` and `people.organizationId` are the foreign keys the formula cascade walks to feed `Deal.*` / `Person.*` / `Organization.*` dotted references into child formulas. A soft delete may skip recalculation because restore is the repair point; a purged parent never comes back. Not fixed locally because neither available call helps: `changedFields: ["dealId"]` selects nothing (a foreign key is not in `ENTITY_NATIVE_ATTRIBUTES` and a dotted ref is admitted only through `changedRelatedFields`), and `changedRelatedFields` does select those formulas but has no parent row to resolve them against — the engine has no representation for "this link is null", so the result is a stored internal error string on a live record. The same gap already exists wherever a child's own foreign key is cleared through the UI, so the fix is a formula-recalc scoping change (scope dotted refs on a foreign-key change, and teach the engine a null parent link), not a purge patch. The three purge mutations state the limitation at the detach.

## Session Log

- 2026-03-26: Milestone v1.2 Workflows started
- 2026-03-26: Research completed (HIGH confidence)
- 2026-03-26: Requirements defined (27 v1.2 requirements)
- 2026-03-26: Roadmap created (7 phases: 24-30)
- 2026-03-27: 24-01 complete -- workflow schema (4 tables), CRM event bus (13 events), webhook subscriber
- 2026-03-27: 24-02 complete -- deal & people mutations extracted with CRM event emission
- 2026-03-27: 24-03 complete -- workflow CRUD mutations, REST API (/api/v1/workflows), server actions, serializeWorkflow
- 2026-03-27: 24-04 complete -- org/activity mutations extracted, all triggerWebhook eliminated. Phase 24 COMPLETE.
- 2026-03-28: 25-01 complete -- trigger types (4 Zod schemas), schema migration (trigger->triggers array), createWorkflowRun utility, cron-parser installed
- 2026-03-28: 25-03 complete -- schedule processor (atomic claim, cron/interval utils, overlap queuing, instrumentation.ts)
- 2026-03-28: 26-01 complete -- execution types, condition evaluator (14 operators, AND/OR groups), delay resolver (3 modes, 30-day cap), schema migration
- 2026-03-28: 26-02 complete -- execution engine (graph walking, branching, delay yielding) + processor (atomic claim, serial enforcement, instrumentation bootstrap)
- 2026-03-28: 26-03 complete -- toggleWorkflow server action, AsyncLocalStorage recursion depth guard (max 5 levels), createWorkflowRun depth enforcement
- 2026-03-28: 27-01 complete -- variable interpolation engine, SSRF prevention, HTTP handler with retry/backoff, action registry with Zod schemas, engine dispatch integration (29 tests)
- 2026-03-28: 27-03 complete -- QuickJS sandbox transform (15 tests), webhook response coordination with synchronous execution path (11 tests). Phase 27 COMPLETE.
- 2026-03-28: 28-01 complete -- editor data layer: graph converter (lossless round-trip), dagre layout, zustand store, graph mutations, variable schema (25 tests)
- 2026-03-28: 28-03 complete -- side panel with type picker, reorder controls, 9 config forms (trigger, HTTP, CRM, condition, email, notification, delay, transform, webhook-response)
- 2026-03-28: 28-04 complete -- variable picker autocomplete with {{ detection, keyboard navigation, all config forms integrated with VariableInput/VariableTextarea
- 2026-03-28: Milestone v1.2 shipped (PR #7) -- phases 24-31, 26 plans, archived to .planning/milestones/
- 2026-08-08: Post-ship hardening merged -- PR #8 (workflow runtime: execution-engine resume, run-entry guards, schedule triggers, webhook response body, action handlers, wall-clock cycle budget), PR #9 (REST API workflow list/get/run/update/delete scoped to authed user)
- 2026-08-08: Debug workflow-engine-not-firing RESOLVED -- two root causes: reorderDealsMutation missing CRM event emission, and Next.js standalone build omitting instrumentation.js so register() never ran in Docker (all four processors dead in production). Fixed via Dockerfile post-build chunk copy. Verified end-to-end in browser: deal stage drag -> deal.stage_changed -> run completed in 298ms.
- 2026-08-13: Requirements defined (37 v1.3 requirements across 12 categories)
- 2026-08-13: Roadmap created (12 phases: 32-43), backlog 999.1-999.12 fully promoted
- 2026-08-12: Backlog review -- captured deferred v1.1 scope as 999.1 (formula reactivity) and 999.2 (bulk operations); removed stale 27-action-nodes/deferred-items.md (http.test.ts fixed, 14/14 pass)
- 2026-08-14: Phase 32 COMPLETE (6 plans) -- `npm test`/`typecheck` scripts, vitest scoped to src/, suite green (455 pass), 0 eslint errors, `.github/workflows/ci.yml`, and an active `master protection` ruleset (id 20851119) requiring the `ci` check. First CI run on GitHub hardware: 71s, success. Merge gate proven behaviourally via throwaway PR #10 (red `ci`, `mergeStateStatus: BLOCKED`), closed unmerged. Direct push to master retained via one repository-admin bypass actor (D-07 option B).
- 2026-08-14: Phase 33 COMPLETE (3 plans) -- 11 plain single-column btree indexes declared in `src/db/schema/{deals,activities,people,organizations}.ts` and delivered via one generated migration, `drizzle/0012_typical_radioactive_man.sql`. BEFORE plans captured and committed before any DDL (D-07). Kanban query (BDR - Base Fria default pipeline): `Seq Scan on deals` cost 2729.07 / 2414 buffers -> `Bitmap Heap Scan` fed by `Bitmap Index Scan on deals_stage_id_idx` cost 2613.98 / 426 buffers. Reminder cron: `Seq Scan on activities` cost 5072.02 / 3294 buffers -> literal `Index Scan using activities_due_date_idx` cost 12.21 / 5 buffers (415x cheaper, 659x fewer buffers). All 11 target columns catalog-proven `index_backed = t`. Cost: 7328 kB index storage, ~1.08s write-blocking ShareLock per deploy. Zero rows mutated on the 25,206-deal real-data DB, zero `*.test.ts` touched, all three gates green (41 files / 461 passed / 4 skipped).

- 2026-08-18: 45-01 complete -- 22 new message keys (admin.nav.* x12, theme.* x4, nav.workflows/searchDescription, bulk.failures.retryHintPartial/prunedHint, audit.field.movedToTrash/restoredFromTrash) in all three locales; 770 -> 792 identical leaves. locale-parity.test.ts gained REQUIRED_SHELL_KEYS (16) + SHELL_EXTRA_KEYS (2), extended REQUIRED_BULK_KEYS (44->46) and REQUIRED_AUDIT_KEYS (79->81), IDENTICAL_TRANSLATION_ALLOWED populated with the three product nouns, and a dedicated ICU-plural assertion closing the placeholderDrift blind spot. Per-contract assertions made soft so every broken contract reports in one run. 7/7 locale tests, 2091 suite pass, typecheck 0, lint 0 errors.
- 2026-08-18: 45-02 complete -- Playwright harness foundation. @playwright/test@^1.62.1 in devDependencies (+ test:e2e script; npm test and ci.yml deliberately untouched, V-3), playwright.config.ts with ignoreDefaultArgs --hide-scrollbars (V-1, measured 320-vs-305 clientWidth recorded inline) and NO webServer block, e2e/seed-admin.ts (idempotent argon2id upsert, loopback-only E2E_DATABASE_URL guard) and e2e/auth.setup.ts (one real-form login, /admin/audit anti-vacuity, writes the gitignored e2e/.auth/admin.json). /e2e/.auth/ + /playwright-report/ + /test-results/ gitignored BEFORE any token was written (V-2); e2e + playwright.config.ts dockerignored. Setup project green 4x, idempotency proven by branch, both env-guard negative proofs RUN. typecheck 0, lint 0 errors, 2091+8 tests pass.
- 2026-08-18: 45-07 complete -- CommandDialog now forwards shouldFilter and loop to its inner <Command> (both destructured out of the rest spread, which lands on the Radix Dialog root), unblocking any search surface from cmdk's UUID-blind default filter. The three result groups and the CommandEmpty fallback moved -- not copied -- into src/components/global-search/search-results.tsx (named export, plus the exported SearchResultsData payload type); CommandGroup now appears ZERO times in global-search.tsx, which is otherwise behaviour-neutral (same outer shouldFilter={false}, same / hotkey, same w-64 input, same fetch). Gated by src/components/ui/__tests__/command-dialog-wiring.test.ts, a comment-blind source gate that extracts the inner <Command> opening tag so a prop forwarded to the wrong element cannot pass. RED 10 failed/6 passed -> GREEN 16/16; typecheck 0, lint 0 errors (127 warnings, unchanged), 96 files + RSC project green.

## Current Position

Phase: 38 (Bulk Operations) — EXECUTING
Plan: 3 of 11 complete
Status: Ready to execute
Last activity: 2026-08-18

- 2026-08-17: Phase 37 COMPLETE (15 plans, 6 waves) — Trash & Restore. `/trash` with four scoped tabs, `/admin/trash` retention (1..365, default 30, seeded as data, fail-closed with NO `?? 30`), restore + ordered transactional purge for all four CRM entities, three REST endpoints, and a daily pruner PROVEN running in the container (`[trash-prune] Starting with initial delay of 60s, ticking daily`, all six processors announcing from the merged-master build). Suite 1549 -> 1703 passing, typecheck 0, lint 0 errors throughout. Verified 4/4 success criteria plus a live browser walkthrough (8/10 UAT steps, both "deleted by" strings, manual tab activation, restore with children intact, purge detaching a live child with both audit rows). Code review: 1 critical + 9 warnings, all in-scope findings fixed; CR-01 deliberately scoped to correcting a false comment. The 320px check found and fixed a real tablist overflow defect. Autonomous run STOPPED here by user — phases 38-43 remain.
