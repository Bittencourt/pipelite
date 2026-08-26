/**
 * THE OPENAPI ERROR-COVERAGE GATE.
 *
 * Phase 48 changed the authorization behaviour of nine `/api/v1` operations. `public/openapi.yaml`
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
 * The other THREE operations this phase changed did **not** gain one, and the difference is
 * measured, not assumed:
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
 * Declaring a `'403'` on those three would be the same defect this file exists to fix, pointed the
 * other way: documentation asserting a response the route cannot produce. They are therefore held
 * by `MUST_NOT_DECLARE_403_OPERATIONS`, with an inverted-polarity assertion and a written reason —
 * the pattern `route-authorization.test.ts` established for `ACCEPTED_KNOWN_ROUTES`. If a later
 * phase gives one of them a real 403 path, this gate goes RED and forces the entry to move to
 * `REQUIRE_403_OPERATIONS` rather than letting the spec drift again.
 *
 * ── SCOPE, DELIBERATELY BOUNDED ───────────────────────────────────────────────────────────────
 *
 * These nine operations are the ones Phase 48 changed, and they are all this gate covers. The rest
 * of `/api/v1` has the same class of drift and more of it — `organizations/{id}`, `people/{id}`,
 * `deals/{id}`, `pipelines/{id}` and `webhooks/{id}` all return 403 today and none of them says so
 * in the spec. Widening a security phase to fix that silently is how scope becomes unreviewable, so
 * it is recorded as a backlog item with a count instead. Do not read this file's green as "the
 * OpenAPI document is accurate"; read it as "nine named operations are accurate and held".
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

/** The component node names the two refs above point at. */
const FORBIDDEN_COMPONENT = "Forbidden"
const VALIDATION_COMPONENT = "ValidationError"

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
 * MEASURED: 27 path items on 2026-08-25, before any edit by this plan. The floor is pinned
 * deliberately BELOW that so ordinary consolidation of an unrelated endpoint does not false-RED,
 * while a parse that returned an empty or truncated `paths` object is red immediately. Without
 * this, every `it.each` below iterates nothing and reports success.
 */
const MIN_PATH_ITEMS = 20

/**
 * Floor on the total number of operations across all path items.
 *
 * MEASURED: 59 operations on 2026-08-25, before any edit by this plan. Same reasoning as
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
] as const

/** Exact subject-list sizes. An emptied `it.each` array generates zero tests and looks green. */
const EXPECTED_403_SUBJECTS = 6
const EXPECTED_422_SUBJECTS = 2
const EXPECTED_NEGATIVE_403_SUBJECTS = 3

/**
 * The number of DISTINCT operations under this gate — nine, matching the count Phase 48 changed.
 * `/activities/{id}` PUT is in two lists, so the distinct count is not the sum of the lengths.
 */
const EXPECTED_GATED_OPERATIONS = 9

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
 * The reach sweep, de-duplicated. Two operations appear in two lists — `/activities/{id}` PUT
 * carries both a 403 and a 422, and `/activities` POST is a 422 subject *and* a must-not-403
 * subject — so the union is 11 entries over 9 distinct operations.
 */
const ALL_SUBJECTS = [...REQUIRE_403_OPERATIONS, ...REQUIRE_422_OPERATIONS, ...MUST_NOT_DECLARE_403_OPERATIONS]
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

    it(`exposes at least ${MIN_PATH_ITEMS} path items (measured 27)`, () => {
      expect(
        Object.keys(pathItems()).length,
        `${SPEC_PATH} parsed to ${Object.keys(pathItems()).length} path items. A truncated or empty parse satisfies every coverage loop below by iterating nothing.`
      ).toBeGreaterThanOrEqual(MIN_PATH_ITEMS)
    })

    it(`exposes at least ${MIN_OPERATIONS} operations in total (measured 59)`, () => {
      expect(
        totalOperations(),
        `${SPEC_PATH} parsed to ${totalOperations()} operations across ${Object.keys(pathItems()).length} path items.`
      ).toBeGreaterThanOrEqual(MIN_OPERATIONS)
    })

    it("resolves both response components the subjects `$ref`", () => {
      const components = spec.components?.responses ?? {}
      expect(Object.keys(components)).toContain(FORBIDDEN_COMPONENT)
      expect(Object.keys(components)).toContain(VALIDATION_COMPONENT)
      expect(components[FORBIDDEN_COMPONENT]).toBeTypeOf("object")
      expect(components[VALIDATION_COMPONENT]).toBeTypeOf("object")
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

    it(`names exactly ${EXPECTED_NEGATIVE_403_SUBJECTS} operations that must NOT declare 403`, () => {
      expect(MUST_NOT_DECLARE_403_OPERATIONS.length).toBe(
        EXPECTED_NEGATIVE_403_SUBJECTS
      )
    })

    it(`covers exactly ${EXPECTED_GATED_OPERATIONS} distinct operations — the nine Phase 48 changed`, () => {
      const distinct = new Set(ALL_SUBJECTS.map(label))
      expect(
        [...distinct].sort(),
        "the gate's scope is nine operations; a change here is a change of scope and must be recorded"
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
