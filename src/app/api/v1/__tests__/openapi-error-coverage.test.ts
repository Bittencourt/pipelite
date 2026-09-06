/**
 * THE OPENAPI ERROR-COVERAGE GATE.
 *
 * Phase 48 changed the authorization behaviour of twelve `/api/v1` operations. `public/openapi.yaml`
 * is the contract integrators build against, and it did not change with them: `/activities/{id}`
 * declared `'200'` + `'404'` on GET, `'200'` on PUT and `'204'` on DELETE, with **no `'403'`
 * anywhere**; `/stages/{id}` had the identical omission while its GET was *already* returning 403
 * before this phase started. The only consumer of the file is `src/app/api/v1/docs/route.ts:16`,
 * and before this file existed **no test read it at all**.
 *
 * An undeclared 403 is not a cosmetic gap. To an integrator reading the spec, a 403 that the
 * contract does not mention is indistinguishable from an outage, and the usual reaction to an
 * unexpected non-2xx is a retry — so undocumented authorization reads as flakiness and gets
 * retried rather than fixed.
 *
 * ── WHY THIS PARSES INSTEAD OF GREPPING ───────────────────────────────────────────────────────
 *
 * The v1.3 milestone shipped six gates that could not fail. One was a grep with a malformed
 * bracket class; two counted the very prose the plan had ordered written. A grep for `403` over
 * this file is the same defect waiting to happen: the token `403` already occurs inside the
 * `Unauthorized`/`NotFound` examples, inside prose descriptions, and inside components that no
 * operation references. It would be satisfied by a comment.
 *
 * So this gate parses the document with the **same `parse` from the same `yaml` package that
 * `docs/route.ts` uses**, resolves each subject by path and method, and reads the operation's own
 * `responses` map. A `'403'` only counts when it is attached to the operation that can emit it.
 *
 * ── WHY THE FLOORS EXIST ──────────────────────────────────────────────────────────────────────
 *
 * A parse that returned `{}` satisfies every "for each of my subjects" loop by iterating nothing,
 * and every `not.toHaveProperty` by having no properties. Two classes of floor prevent that:
 *
 *   1. DOCUMENT floors — `MIN_PATH_ITEMS` and `MIN_OPERATIONS` — a broken or truncated parse is
 *      red before any coverage assertion is read.
 *   2. SUBJECT-LIST floors — the `.length` of each subject list is pinned EXACTLY. An `it.each`
 *      over an emptied array generates zero tests and reports success; that is the single most
 *      likely way this file becomes decorative, so the lists are counted rather than trusted.
 *
 * ── WHY BOTH POLARITIES ───────────────────────────────────────────────────────────────────────
 *
 * SIX operations gained a 403 path in Phase 48 — GET/PUT/DELETE on `/activities/{id}` and on
 * `/stages/{id}`, each of which fetches the row and compares its owner to `ctx.userId`.
 *
 * FIVE operations under this gate did **not** gain one, and the difference is measured, not
 * assumed:
 *
 *   - `GET /api/v1/activities` scopes in the `WHERE` (`route.ts:62`,
 *     `eq(activities.ownerId, ctx.userId)`). A foreign row is never read, so there is nothing to
 *     refuse: the response is a 200 over a narrower set.
 *   - `POST /api/v1/activities` rejects a foreign `owner_id` with `Problems.validation`
 *     (`route.ts:165-167`) — a **422**, not a 403.
 *   - `GET /api/v1/stages` scopes in the join via `ownedStagesPredicate` (`route.ts:62`,`:73`) and
 *     answers a foreign `pipeline_id` with `Problems.notFound("Pipeline")` (`route.ts:39`) — a
 *     **404**, not a 403.
 *
 *   - `GET /api/v1/workflows/{id}/runs` and `GET .../runs/{runId}` answer a workflow that is not
 *     the caller's with `Problems.notFound("Workflow")` — a **404** — because that is what every
 *     sibling under `/workflows/{id}` answers, and because a 403 for a real id beside a 404 for an
 *     unknown one is an existence oracle. Added when SEC-48-A closed (2026-08-26).
 *
 * Declaring a `'403'` on those five would be the same defect this file exists to fix, pointed the
 * other way: documentation asserting a response the route cannot produce. They are therefore held
 * by `MUST_NOT_DECLARE_403_OPERATIONS`, with an inverted-polarity assertion and a written reason —
 * the pattern `route-authorization.test.ts` established for its exemption lists. If a later phase
 * gives one of them a real 403 path, this gate goes RED and forces the entry to move to
 * `REQUIRE_403_OPERATIONS` rather than letting the spec drift again.
 *
 * ── SCOPE, DELIBERATELY BOUNDED ───────────────────────────────────────────────────────────────
 *
 * These TWELVE operations are the ones Phase 48 changed the wire behaviour of, and they are all
 * this gate covers — nine at first, then `POST /stages`, then the two `workflows/{id}/runs` reads
 * when SEC-48-A closed. `EXPECTED_GATED_OPERATIONS` records why each joined.
 *
 * The rest of `/api/v1` has the same class of drift and more of it — `organizations/{id}`,
 * `people/{id}`, `deals/{id}`, `pipelines/{id}` and `webhooks/{id}` all return 403 today and none
 * of them says so in the spec. Widening a security phase to fix that silently is how scope becomes
 * unreviewable, so it is recorded as a backlog item with a count instead. Do not read this file's
 * green as "the OpenAPI document is accurate"; read it as "twelve named operations are accurate and
 * held".
 */
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"
import { parse } from "yaml"

const REPO_ROOT = process.cwd()

/** The published document, resolved exactly as `src/app/api/v1/docs/route.ts:16` resolves it. */
const SPEC_PATH = path.join(REPO_ROOT, "public", "openapi.yaml")

/** The `$ref` an authorization refusal must resolve to. */
const FORBIDDEN_REF = "#/components/responses/Forbidden"

/** The `$ref` a validation refusal must resolve to. */
const VALIDATION_REF = "#/components/responses/ValidationError"

/** The `$ref` a "no such record" answer must resolve to. */
const NOT_FOUND_REF = "#/components/responses/NotFound"

/** The `$ref` a state conflict must resolve to. */
const CONFLICT_REF = "#/components/responses/Conflict"

/** The component node names the refs above point at. */
const FORBIDDEN_COMPONENT = "Forbidden"
const VALIDATION_COMPONENT = "ValidationError"
const NOT_FOUND_COMPONENT = "NotFound"
const CONFLICT_COMPONENT = "Conflict"

/**
 * Every HTTP method OpenAPI 3.1 recognises as an operation on a path item. Enumerating all eight
 * rather than the four this repo uses is what makes `MIN_OPERATIONS` a property of the document
 * instead of a property of this list.
 */
const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
] as const

/**
 * Floor on the number of path items in the parsed document.
 *
 * MEASURED: 29 path items on 2026-08-26 (27 on 2026-08-25, +2 for the two `workflows/{id}/runs`
 * path items SEC-48-A documented). The floor is pinned
 * deliberately BELOW that so ordinary consolidation of an unrelated endpoint does not false-RED,
 * while a parse that returned an empty or truncated `paths` object is red immediately. Without
 * this, every `it.each` below iterates nothing and reports success.
 */
const MIN_PATH_ITEMS = 20

/**
 * Floor on the total number of operations across all path items.
 *
 * MEASURED: 61 operations on 2026-08-26 (59 on 2026-08-25, +2 for SEC-48-A). Same reasoning as
 * `MIN_PATH_ITEMS`, one level deeper: a `paths` object whose path items parsed as empty maps would
 * satisfy the path-item floor and still make every subject lookup fail for the wrong reason.
 */
const MIN_OPERATIONS = 45

/**
 * The SIX operations Phase 48 gave a genuine 403 path. Each fetches the row first and compares its
 * owner column to `ctx.userId`, returning `Problems.forbidden()` on a mismatch:
 *
 *   - `activities/[id]/route.ts:106` (GET), `:157` (PUT), `:308` (DELETE)  — plan 48-01, SEC-01
 *   - `stages/[id]/route.ts:72` (GET), `:102` (PUT), `:158` (DELETE)       — plan 48-03, SEC-02
 *
 * Bounded on purpose: see the scope paragraph in this file's header.
 */
const REQUIRE_403_OPERATIONS = [
  { path: "/activities/{id}", method: "get" },
  { path: "/activities/{id}", method: "put" },
  { path: "/activities/{id}", method: "delete" },
  { path: "/stages/{id}", method: "get" },
  { path: "/stages/{id}", method: "put" },
  { path: "/stages/{id}", method: "delete" },
] as const

/**
 * The TWO operations that now reject a foreign `owner_id` with a 422 validation problem rather
 * than silently honouring the reassignment:
 *
 *   - `activities/route.ts:165-167`       (POST) — plan 48-02
 *   - `activities/[id]/route.ts:185-187`  (PUT)  — plan 48-01
 *
 * `/activities/{id}` PUT appears in both lists because it carries both refusals.
 */
const REQUIRE_422_OPERATIONS = [
  { path: "/activities", method: "post" },
  { path: "/activities/{id}", method: "put" },
  // WR-03: both of these return `Problems.validation` and neither said so.
  //   - `stages/route.ts:113` (zod) and `:129` (`pipeline_id` not owned)  — POST /stages
  //   - `stages/[id]/route.ts:149` (zod)                                 — PUT /stages/{id}
  { path: "/stages", method: "post" },
  { path: "/stages/{id}", method: "put" },
] as const

/**
 * WR-03 — the SEVEN operations that answer 404 and did not declare it.
 *
 * The gate's stated rationale is that "a 403 the contract does not mention is indistinguishable from
 * an outage, and the usual reaction to an unexpected non-2xx is a retry". That argument applies
 * verbatim to 404, and this phase left it undeclared on operations it changed — including the one
 * whose 404 `MUST_NOT_DECLARE_403_OPERATIONS` writes down, in prose, as the measured REASON that
 * operation has no 403. Describing a response and then never asserting it exists is the shape this
 * whole file was built to eliminate.
 *
 *   - `activities/[id]/route.ts:110` (GET), `:174` (PUT), `:369` (DELETE)
 *   - `stages/route.ts:40`            — GET /stages, for an unknown or foreign `?pipeline_id=`
 *   - `stages/[id]/route.ts:103` (GET), `:133` (PUT), `:203` (DELETE)
 *
 * The concrete failure this closes: an integrator generates a client from the spec, calls
 * `GET /api/v1/stages?pipeline_id=<a pipeline they just deleted>`, receives a 404 the generated
 * client has no branch for, and — by the gate's own reasoning — retries it as a transient fault.
 */
const REQUIRE_404_OPERATIONS = [
  { path: "/activities/{id}", method: "get" },
  { path: "/activities/{id}", method: "put" },
  { path: "/activities/{id}", method: "delete" },
  { path: "/stages", method: "get" },
  { path: "/stages/{id}", method: "get" },
  { path: "/stages/{id}", method: "put" },
  { path: "/stages/{id}", method: "delete" },
  // SEC-48-A, 2026-08-26. Both were UNDOCUMENTED — not merely missing a status, absent from the
  // document entirely — and they are here because the SEC-48-A fix changed what they put on the
  // wire: a workflow belonging to another user used to answer 200 WITH THAT USER'S RUN RECORDS,
  // including `workflow_runs.trigger_data`, which `serializeRun` returns verbatim. It now answers
  // 404.
  //   - `workflows/[id]/runs/route.ts:52`          — getWorkflow(id, context.userId)
  //   - `workflows/[id]/runs/[runId]/route.ts:34`  — same, resolved BEFORE the run is read
  { path: "/workflows/{id}/runs", method: "get" },
  { path: "/workflows/{id}/runs/{runId}", method: "get" },
] as const

/**
 * The THREE operations that gained a 409 in WR-01, where they previously returned an unhandled 500.
 *
 * `Problems.conflict` was defined and entirely unused before that fix, so this is a genuinely new
 * response on the wire and declaring it is not catch-up — it would be fresh drift otherwise.
 *
 *   - `stages/route.ts:163`      (POST)   — 23505 on the unique `(pipeline_id, name)` index
 *   - `stages/[id]/route.ts:185` (PUT)    — the same collision, on rename
 *   - `stages/[id]/route.ts:220` (DELETE) — 23503, a stage that still has deals
 *
 * THE FOURTH: issue #11, 2026-09-06. `DELETE /workflows/{id}` used to answer an unhandled 500
 * whenever the workflow had run history: the mutation's in-code cascade never cleared
 * `audit_log.workflow_run_id`'s FK to `workflow_runs`, so the runs delete raised PG 23503 and the
 * route fell through to `Problems.internalError`. The fix preserves run history and answers a
 * typed `WORKFLOW_HAS_RUNS` 409 instead — a new response on the wire, so declaring it is the same
 * not-catch-up logic as the first three.
 *
 *   - `workflows/[id]/route.ts`  (DELETE) — run history exists; `Problems.workflowHasRuns()`
 */
const REQUIRE_409_OPERATIONS = [
  { path: "/stages", method: "post" },
  { path: "/stages/{id}", method: "put" },
  { path: "/stages/{id}", method: "delete" },
  { path: "/workflows/{id}", method: "delete" },
] as const

/**
 * INVERTED POLARITY. The three operations Phase 48 changed that must NOT declare a 403, each with
 * the measured reason it cannot emit one. Asserting the absence is what stops a future editor from
 * "completing" the coverage by declaring a response the route has no code path to produce.
 *
 * When one of these does gain a 403, this gate goes red and the entry must MOVE to
 * `REQUIRE_403_OPERATIONS`. That is the point: the list can only shrink by being fixed.
 */
const MUST_NOT_DECLARE_403_OPERATIONS = [
  {
    path: "/activities",
    method: "get",
    reason:
      "scopes in the WHERE (activities/route.ts:62, eq(activities.ownerId, ctx.userId)); a foreign row is never read, so the answer is a 200 over a narrower set",
  },
  {
    path: "/activities",
    method: "post",
    reason:
      "rejects a foreign owner_id with Problems.validation (activities/route.ts:165-167) — a 422, declared by REQUIRE_422_OPERATIONS",
  },
  {
    path: "/stages",
    method: "get",
    reason:
      "scopes in the join via ownedStagesPredicate (stages/route.ts:62,:73) and answers a foreign pipeline_id with Problems.notFound (stages/route.ts:39) — a 404",
  },
  {
    path: "/workflows/{id}/runs",
    method: "get",
    reason:
      "answers a workflow that is not the caller's with Problems.notFound (workflows/[id]/runs/route.ts:55) since SEC-48-A, matching every sibling under /workflows/{id}; a 403 for a real id and a 404 for an unknown one would confirm that another owner's workflow exists, and the db test asserts the two responses are byte-identical",
  },
  {
    path: "/workflows/{id}/runs/{runId}",
    method: "get",
    reason:
      "carries the same predicate and the same answer (workflows/[id]/runs/[runId]/route.ts:38), plus Problems.notFound for a run that does not belong to the workflow in the path; three cases, one 404, so no status code distinguishes a foreign workflow from a nonexistent one",
  },
] as const

/** Exact subject-list sizes. An emptied `it.each` array generates zero tests and looks green. */
const EXPECTED_403_SUBJECTS = 6
const EXPECTED_422_SUBJECTS = 4
const EXPECTED_404_SUBJECTS = 9
const EXPECTED_409_SUBJECTS = 4
const EXPECTED_NEGATIVE_403_SUBJECTS = 5

/**
 * The number of DISTINCT operations under this gate. Several appear in more than one list, so this is
 * not the sum of the lengths.
 *
 * WAS 9, THEN 10, IS 12 — AND EVERY JOINER IS RECORDED HERE RATHER THAN ABSORBED.
 *
 * The original nine were the operations Phase 48's authorization work changed: GET/PUT/DELETE on
 * `/activities/{id}` and on `/stages/{id}`, plus `GET /activities`, `POST /activities` and
 * `GET /stages`.
 *
 * `POST /stages` is the tenth. It joined for two reasons, both of them changes to what it puts on the
 * wire rather than a widening of ambition:
 *
 *   - WR-03: it returns `Problems.validation` for a zod failure and for a `pipeline_id` the caller
 *     does not own (`stages/route.ts:113`, `:129`) and declared `'201'` only.
 *   - WR-01: it now returns `Problems.conflict` on the unique `(pipeline_id, name)` index where it
 *     previously returned an unhandled 500. That response DID NOT EXIST before, so declaring it is
 *     not catch-up; omitting it would be fresh drift introduced by this very fix.
 *
 * ── THE ELEVENTH AND TWELFTH: SEC-48-A, 2026-08-26 ────────────────────────────────────────────
 *
 *     GET /workflows/{id}/runs
 *     GET /workflows/{id}/runs/{runId}
 *
 * These joined on the SAME test the tenth passed, and it is worth stating precisely because they
 * are the first subjects this gate has acquired that were not in the document at all.
 *
 * They were not merely missing a status code — they had **no path item**, so there was nothing to
 * attach a response to and `resolveOperation` would have returned `undefined` for either. Adding
 * them is therefore documenting two previously-undocumented endpoints, which is normally
 * DOC-48-01's territory and deliberately outside this gate's scope.
 *
 * WHAT PUTS THEM INSIDE IT: the SEC-48-A fix changed what they put on the wire. Both used to look
 * the workflow up by id ALONE, so a workflow belonging to another user answered **200 with that
 * user's run records** — and `workflow_runs.trigger_data` holds the triggering record, which
 * `serializeRun` returns verbatim, so the 200 carried another owner's CRM row. They now answer
 * 404. That is exactly the criterion `POST /stages` joined under: a response class that is new on
 * the wire because of this work, where omitting the declaration would be fresh drift introduced by
 * the fix rather than pre-existing drift inherited from the document.
 *
 * They are held in BOTH polarities — `REQUIRE_404_OPERATIONS` for the 404 they now emit, and
 * `MUST_NOT_DECLARE_403_OPERATIONS` for the 403 they deliberately do NOT, because a 403 for a real
 * id and a 404 for an unknown one is an existence oracle over every workflow in the deployment.
 * The behavioural proof of both halves, including the byte-identical foreign/nonexistent
 * responses, is `src/app/api/v1/workflows/__tests__/runs-owner-scope.db.test.ts`.
 *
 * The scope paragraph in this file's header still holds, with SEC-48-A added to what "this phase
 * touched" means. The wider drift across the document — 401 declared on 22 of 59 operations, 429
 * on 12, 403 on 8, and 36 route files against what was 27 documented path items — remains
 * DOC-48-01. Two path items moved that last figure to 29; the item is not closed by it.
 *
 * WAS 12, IS 13 — ISSUE #11, 2026-09-06. `DELETE /workflows/{id}` joined by the same test the
 * tenth subject passed: its fix (typed `WORKFLOW_HAS_RUNS` 409, run history preserved) put a
 * response class on the wire that did not exist there before, so leaving it undeclared would be
 * fresh drift introduced by the fix itself.
 */
const EXPECTED_GATED_OPERATIONS = 13

type ResponseEntry = { $ref?: unknown } | null | undefined
type Operation = { responses?: Record<string, ResponseEntry> }
type PathItem = Record<string, unknown>
type OpenApiDocument = {
  paths?: Record<string, PathItem | undefined>
  components?: { responses?: Record<string, unknown> }
}

/**
 * Parsed once at module scope, with the same call `docs/route.ts` makes. A throw here is a correct
 * hard failure: the document served at `/api/v1/docs` would be a 500 in exactly that case.
 */
const spec = parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiDocument

function pathItems(): Record<string, PathItem | undefined> {
  return spec.paths ?? {}
}

function operationsOf(item: PathItem | undefined): Operation[] {
  if (!item) return []
  return HTTP_METHODS.map(method => item[method]).filter(
    (op): op is Operation => typeof op === "object" && op !== null
  )
}

function totalOperations(): number {
  return Object.values(pathItems()).reduce(
    (sum, item) => sum + operationsOf(item).length,
    0
  )
}

function resolveOperation(specPath: string, method: string): Operation | undefined {
  const item = pathItems()[specPath]
  if (!item) return undefined
  const op = item[method]
  if (typeof op !== "object" || op === null) return undefined
  return op as Operation
}

function responsesOf(specPath: string, method: string): Record<string, ResponseEntry> {
  return resolveOperation(specPath, method)?.responses ?? {}
}

function refOf(entry: ResponseEntry): string | undefined {
  if (typeof entry !== "object" || entry === null) return undefined
  const ref = (entry as { $ref?: unknown }).$ref
  return typeof ref === "string" ? ref : undefined
}

function label(subject: { path: string; method: string }): string {
  return `${subject.method.toUpperCase()} ${subject.path}`
}

/**
 * The reach sweep, de-duplicated. Several operations appear in more than one list — `/activities/{id}`
 * PUT carries both a 403 and a 422, `/activities` POST is a 422 subject *and* a must-not-403
 * subject, and each `workflows/{id}/runs` read is both a 404 subject and a must-not-403 subject —
 * so the union has more entries than there are distinct operations. `EXPECTED_GATED_OPERATIONS`
 * pins the distinct count.
 */
const ALL_SUBJECTS = [
  ...REQUIRE_403_OPERATIONS,
  ...REQUIRE_422_OPERATIONS,
  ...REQUIRE_404_OPERATIONS,
  ...REQUIRE_409_OPERATIONS,
  ...MUST_NOT_DECLARE_403_OPERATIONS,
]
  .map(subject => ({ path: subject.path, method: subject.method }))
  .filter(
    (subject, index, all) =>
      all.findIndex(other => other.path === subject.path && other.method === subject.method) === index
  )

describe("OpenAPI error-response coverage", () => {
  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 1. PARSE FLOORS. These run first. If they fail, nothing below means anything.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("parse floors", () => {
    it("parses the published document into an object exposing `paths`", () => {
      expect(spec).toBeTypeOf("object")
      expect(spec).not.toBeNull()
      expect(spec.paths).toBeTypeOf("object")
      expect(spec.paths).not.toBeNull()
    })

    it(`exposes at least ${MIN_PATH_ITEMS} path items (measured 29)`, () => {
      expect(
        Object.keys(pathItems()).length,
        `${SPEC_PATH} parsed to ${Object.keys(pathItems()).length} path items. A truncated or empty parse satisfies every coverage loop below by iterating nothing.`
      ).toBeGreaterThanOrEqual(MIN_PATH_ITEMS)
    })

    it(`exposes at least ${MIN_OPERATIONS} operations in total (measured 61)`, () => {
      expect(
        totalOperations(),
        `${SPEC_PATH} parsed to ${totalOperations()} operations across ${Object.keys(pathItems()).length} path items.`
      ).toBeGreaterThanOrEqual(MIN_OPERATIONS)
    })

    it("resolves every response component the subjects `$ref`", () => {
      const components = spec.components?.responses ?? {}
      for (const name of [
        FORBIDDEN_COMPONENT,
        VALIDATION_COMPONENT,
        NOT_FOUND_COMPONENT,
        CONFLICT_COMPONENT,
      ]) {
        expect(Object.keys(components), `#/components/responses/${name} is missing`).toContain(name)
        expect(components[name], `#/components/responses/${name} is not an object`).toBeTypeOf(
          "object"
        )
      }
    })
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 2. SUBJECT-LIST FLOORS. An emptied list is the cheapest way to make this file decorative.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("subject-list floors", () => {
    it(`names exactly ${EXPECTED_403_SUBJECTS} operations that must declare 403`, () => {
      expect(REQUIRE_403_OPERATIONS.length).toBe(EXPECTED_403_SUBJECTS)
    })

    it(`names exactly ${EXPECTED_422_SUBJECTS} operations that must declare 422`, () => {
      expect(REQUIRE_422_OPERATIONS.length).toBe(EXPECTED_422_SUBJECTS)
    })

    it(`names exactly ${EXPECTED_404_SUBJECTS} operations that must declare 404`, () => {
      expect(REQUIRE_404_OPERATIONS.length).toBe(EXPECTED_404_SUBJECTS)
    })

    it(`names exactly ${EXPECTED_409_SUBJECTS} operations that must declare 409`, () => {
      expect(REQUIRE_409_OPERATIONS.length).toBe(EXPECTED_409_SUBJECTS)
    })

    it(`names exactly ${EXPECTED_NEGATIVE_403_SUBJECTS} operations that must NOT declare 403`, () => {
      expect(MUST_NOT_DECLARE_403_OPERATIONS.length).toBe(
        EXPECTED_NEGATIVE_403_SUBJECTS
      )
    })

    it(`covers exactly ${EXPECTED_GATED_OPERATIONS} distinct operations — the ones Phase 48 changed`, () => {
      const distinct = new Set(ALL_SUBJECTS.map(label))
      expect(
        [...distinct].sort(),
        "the gate's scope is twelve operations; a change here is a change of scope and must be " +
          "recorded in EXPECTED_GATED_OPERATIONS's doc-comment, with the reason the operation joined"
      ).toHaveLength(EXPECTED_GATED_OPERATIONS)
    })

    it("gives every must-NOT-declare entry a written reason", () => {
      for (const subject of MUST_NOT_DECLARE_403_OPERATIONS) {
        expect(subject.reason.length, label(subject)).toBeGreaterThan(40)
      }
    })
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 3. SUBJECT REACH. Every named subject must resolve to a real operation, so a rename in the
  //    spec goes red instead of dropping the subject out of the sweep.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("subject reach", () => {
    it.each(ALL_SUBJECTS)(
      "resolves $method $path to a real operation in the parsed document",
      subject => {
        const op = resolveOperation(subject.path, subject.method)
        expect(
          op,
          `${label(subject)} does not exist in ${SPEC_PATH}. Either the path was renamed or the subject list is stale — do not delete the subject to make this green.`
        ).toBeDefined()
        expect(op?.responses, `${label(subject)} declares no responses at all`).toBeTypeOf(
          "object"
        )
        expect(
          Object.keys(op?.responses ?? {}).length,
          `${label(subject)} has an empty responses map; an absence assertion over it would be vacuous`
        ).toBeGreaterThan(0)
      }
    )
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 4. 403 COVERAGE + REF INTEGRITY.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("403 coverage", () => {
    it.each(REQUIRE_403_OPERATIONS)(
      "$method $path declares a 403",
      subject => {
        const responses = responsesOf(subject.path, subject.method)
        expect(
          Object.keys(responses),
          `${label(subject)} returns Problems.forbidden() to a non-owner but the published spec does not declare '403'. An integrator reading the contract sees an authorization refusal as an outage and retries it.`
        ).toContain("403")
      }
    )

    it.each(REQUIRE_403_OPERATIONS)(
      "$method $path resolves its 403 to the Forbidden component",
      subject => {
        const entry = responsesOf(subject.path, subject.method)["403"]
        expect(
          refOf(entry),
          `${label(subject)}'s '403' must $ref ${FORBIDDEN_REF}; a dangling or inline-empty ref is documentation that says nothing`
        ).toBe(FORBIDDEN_REF)
      }
    )
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 5. 422 COVERAGE + REF INTEGRITY.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("422 coverage", () => {
    it.each(REQUIRE_422_OPERATIONS)(
      "$method $path declares a 422",
      subject => {
        const responses = responsesOf(subject.path, subject.method)
        expect(
          Object.keys(responses),
          `${label(subject)} rejects a foreign owner_id with Problems.validation (422) but the published spec does not declare '422'.`
        ).toContain("422")
      }
    )

    it.each(REQUIRE_422_OPERATIONS)(
      "$method $path resolves its 422 to the ValidationError component",
      subject => {
        const entry = responsesOf(subject.path, subject.method)["422"]
        expect(
          refOf(entry),
          `${label(subject)}'s '422' must $ref ${VALIDATION_REF}`
        ).toBe(VALIDATION_REF)
      }
    )
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 5b. 404 COVERAGE + REF INTEGRITY (WR-03).
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("404 coverage", () => {
    it.each(REQUIRE_404_OPERATIONS)(
      "$method $path declares a 404",
      subject => {
        const responses = responsesOf(subject.path, subject.method)
        expect(
          Object.keys(responses),
          `${label(subject)} returns Problems.notFound() but the published spec does not declare '404'. A generated client has no branch for it, and per this gate's own reasoning the usual reaction to an unexpected non-2xx is a RETRY — so a permanent 404 reads as a transient fault.`
        ).toContain("404")
      }
    )

    it.each(REQUIRE_404_OPERATIONS)(
      "$method $path resolves its 404 to the NotFound component",
      subject => {
        const entry = responsesOf(subject.path, subject.method)["404"]
        expect(
          refOf(entry),
          `${label(subject)}'s '404' must $ref ${NOT_FOUND_REF}; a dangling or inline-empty ref is documentation that says nothing`
        ).toBe(NOT_FOUND_REF)
      }
    )
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 5c. 409 COVERAGE + REF INTEGRITY. New responses, introduced by WR-01.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("409 coverage", () => {
    it.each(REQUIRE_409_OPERATIONS)(
      "$method $path declares a 409",
      subject => {
        const responses = responsesOf(subject.path, subject.method)
        expect(
          Object.keys(responses),
          `${label(subject)} answers Problems.conflict() where it previously returned an unhandled 500. Declaring it is not catch-up — it is a response that did not exist on the wire before WR-01, so leaving it out would be fresh drift.`
        ).toContain("409")
      }
    )

    it.each(REQUIRE_409_OPERATIONS)(
      "$method $path resolves its 409 to the Conflict component",
      subject => {
        const entry = responsesOf(subject.path, subject.method)["409"]
        expect(
          refOf(entry),
          `${label(subject)}'s '409' must $ref ${CONFLICT_REF}`
        ).toBe(CONFLICT_REF)
      }
    )
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // 6. INVERTED POLARITY. The three changed operations that have no 403 path must not claim one.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  describe("403 must not be over-declared", () => {
    it.each(MUST_NOT_DECLARE_403_OPERATIONS)(
      "$method $path does NOT declare a 403",
      subject => {
        const responses = responsesOf(subject.path, subject.method)
        expect(
          Object.keys(responses),
          `${label(subject)} declares a '403' it cannot emit — it ${subject.reason}. If this operation genuinely gained a 403 path, MOVE it to REQUIRE_403_OPERATIONS rather than deleting this assertion.`
        ).not.toContain("403")
      }
    )
  })
})
