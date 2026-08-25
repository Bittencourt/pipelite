/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE /api/v1 ROUTE-AUTHORIZATION PRESENCE GATE  (phase 48, "Q10")
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS GATE ASSERTS ────────────────────────────────────────────────────────────────────
 *
 * Every exported HTTP verb handler under `src/app/api/v1` — in BOTH of its shapes, the
 * `export async function GET(...)` declaration form and the
 * `export const { GET, POST } = noteCollectionHandlers(...)` binding form — is classified by a
 * TypeScript AST walk as either constraining the record it reads or writes by the CALLER's
 * identity, or not. A handler that does not is an offender, reported as
 * `file:line: VERB does not constrain the record by caller identity`.
 *
 * Four accepted authorization idioms are recognised (R1-R4 below), because `/api/v1` genuinely
 * uses four: `where`-scoped predicates, fetch-then-compare, delegation to a named authorizer, and
 * create-time ownership assignment. A detector that accepted only one would flag nine correct
 * handlers and be deleted within a week.
 *
 * ── WHY IT EXISTS: SEC-48-B, MEASURED 2026-08-25 ──────────────────────────────────────────────
 *
 * Research deleted ALL THREE `eq(organizations.ownerId, context.userId)` predicates — GET, PUT and
 * DELETE — from `src/app/api/v1/organizations/[id]/route.ts`, and ran the full base suite:
 *
 *     172 files passed | 2 skipped
 *     5237 tests passed | 32 skipped
 *     nothing red
 *
 * There is a test in this repository named *"returns 404 ... when the organization is not the
 * caller's"* and it does not detect its own subject being removed. **Before this file existed,
 * nothing in this repository detected removing an authorization check from a REST route.** Fixing
 * four routes while that stayed true would mean the next missing check ships silently. This gate is
 * the thing that would have caught it.
 *
 * ── ⚠ WHAT THIS GATE CANNOT DO: IT IS A *PRESENCE* GATE ───────────────────────────────────────
 *
 * This gate proves an ownership check EXISTS. It cannot prove the check is CORRECT. A handler that
 * compares the caller against the wrong id, against a relation that was never loaded, or against a
 * value the caller controls, passes this gate. Do not read a green run here as "every /api/v1 route
 * authorizes correctly". It means "every /api/v1 route contains something shaped like an
 * authorization check".
 *
 * The measured counter-example, in this repository, today:
 *
 *     src/app/api/v1/stages/[id]/route.ts  GET  (:54-85)
 *
 * Its `if (!stage.pipeline || stage.pipeline.ownerId !== ctx.userId || ...)` satisfies rule R2 and
 * this gate reports it as authorizing — while it is the SEC-02 defect. `withOptions` is `undefined`
 * unless the request passes `?expand=pipeline`, so `stage.pipeline` is normally never loaded and the
 * LEGITIMATE OWNER receives a 403. The comparison is real; the value it compares is decided by the
 * caller. A presence gate is structurally incapable of seeing that. Behavioural tests own it —
 * plans 48-03 and 48-06 — and verify-work must not over-read this file as covering it.
 *
 * ── SCOPE OF THIS PLAN (48-05) vs PLAN 48-08 ──────────────────────────────────────────────────
 *
 * This file, as shipped by plan 48-05, contains the detector, its fixture self-tests, the corpus
 * walk, the reach floors and the WR-11 token floors. It deliberately contains **no corpus offender
 * assertion and no exemption lists**: the four in-scope routes are still unfixed while this lands in
 * wave 1, so `expect(offenders).toEqual([])` would be red and asserting the pre-fix set would go red
 * the moment wave 1 merges. The pre-fix offender list is therefore LOGGED as this gate's RED-first
 * evidence, in an `it` that asserts only `MIN_ROUTE_FILES`. **A log line is not a gate.** Plan 48-08
 * deletes that `it`, adds the exemption lists as live controls, and replaces it with the array-form
 * `expect(offenders).toEqual([])`, plus the falsification controls that prove this gate can fail.
 *
 * ── PARSE, NEVER GREP ─────────────────────────────────────────────────────────────────────────
 *
 * Detection goes exclusively through `ts.createSourceFile` and AST node kinds. Two reasons, both
 * measured. First, a comment explaining a rule satisfies that rule's own grep — a collision that
 * fired fifteen times across phases 37-38 — and this header necessarily contains the strings
 * `ownerId`, `context.userId` and `ctx.userId`. Fixtures P4 and P5 below prove the AST rules are
 * structurally incapable of that collision rather than asserting it. Second, `rtk` makes
 * `grep ... | wc -l` return wrong counts in this environment (measured 36 -> 19) and made
 * `grep -n "export"` report "0 matches" on a file with 15 export lines. The only regular expressions
 * in this file match nothing at all; the corpus predicate is `entry.name === "route.ts"`.
 *
 * ── IF THIS WENT RED ──────────────────────────────────────────────────────────────────────────
 *
 * A fixture self-test red: the detector is broken, and every pass below it is unproven. Fix the
 * detector, never the fixture. A reach or token floor red: the walk or the matcher stopped reaching
 * the tree — "no offenders" would then be green because it broke, not because the tree is clean.
 */
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const REPO_ROOT = process.cwd()

/** The tree this gate sweeps. `/api/v1` only — `src/app/api` also holds 16 non-v1 `route.ts`. */
const API_ROOT = "src/app/api/v1"

/** This file, by path. Named so the self-collision control can assert it is NOT enumerated. */
const GATE_PATH = "src/app/api/v1/__tests__/route-authorization.test.ts"

/**
 * The five HTTP verb names Next.js route handlers may export. A name outside this set is not a
 * route handler, whichever form it is exported in.
 */
const VERBS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])

/**
 * Property names that denote "the row's owner" in this schema. Measured across the `/api/v1`
 * corpus: **123** property accesses whose name is one of these five.
 *
 * `userId` is in the set because the create-time idiom at `organizations/batch/route.ts:58` writes
 * `userId: context.userId` into a mutation's argument object rather than `ownerId`.
 */
const OWNER_PROPS = new Set(["ownerId", "userId", "authorId", "createdBy", "assigneeId"])

/**
 * The two spellings of the authenticated-caller object in `/api/v1`. BOTH are in live use, measured:
 * `context.userId` **55** occurrences, `ctx.userId` **22**.
 *
 * A detector matching only one under-detects by 26% and reports offenders that are correctly
 * authorized. Phase 46's WR-11 lesson applies to the pair: the token floors below assert both
 * spellings are still FOUND, because a scan that never asserts its search term still matches goes
 * green precisely when it breaks.
 */
const IDENTITY_OBJECTS = new Set(["ctx", "context"])

/**
 * Functions that perform the ownership check on a handler's behalf. A call to one of these that
 * RECEIVES an identity expression as an argument satisfies rule R3.
 *
 * Measured calls that receive an identity expression, at the time this gate was written:
 *   - `verifyStageOwnership`  2   (local to `stages/[id]/route.ts`)
 *   - `authorizeNoteMutation` 2   (local to the notes routes)
 *   - `authorizeAuditRead`    1   (local to `audit/route.ts`)
 *   - `resolveActorRole`      3   (imported)
 *   - `getWorkflow`           4   (imported)
 *   - `ownedStagesPredicate`  **0 today, becoming 2 once plan 48-04 lands**
 *
 * `getWorkflowTemplate` is DELIBERATELY ABSENT: measured **0** calls that receive an identity
 * argument, and the workflow-templates routes are exempt on a different ground entirely (their
 * schema table has no owner column). Including it would put a dead entry in this set, which plan
 * 48-08's live control — "every name here is actually reached" — would then fail on.
 *
 * That live control is 48-08's, not this plan's. Until it exists, this set is asserted only
 * indirectly, by the negative fixtures N3 and N4.
 */
const AUTHORIZERS = new Set([
  "verifyStageOwnership",
  "authorizeNoteMutation",
  "authorizeAuditRead",
  "resolveActorRole",
  "getWorkflow",
  "ownedStagesPredicate",
])

/** Which syntactic shape an exported handler takes. */
export type HandlerForm = "declaration" | "binding"

export interface HandlerInfo {
  /** One of `VERBS`. */
  verb: string
  /** 1-based line the export opens on. */
  line: number
  form: HandlerForm
  /**
   * For `binding` form, the callee name of the factory the export delegates to — e.g.
   * `noteCollectionHandlers`. `null` for `declaration` form.
   */
  delegatedTo: string | null
  /** Whether the handler body satisfies any of R1-R4. Always `true` for the binding form. */
  authorized: boolean
  /** Whether a `withApiAuth(` call appears inside this handler. */
  withApiAuthSeen: boolean
}

export interface ScanCounters {
  /** Exported `FunctionDeclaration` handlers seen. */
  declarationHandlers: number
  /** Handlers seen via `export const { GET, POST } = factory(...)`. */
  bindingHandlers: number
  /** `withApiAuth(...)` call expressions seen anywhere in the file. */
  withApiAuthCalls: number
  /** Identity property accesses, counted per spelling — the WR-11 floors read these. */
  identityHits: { ctx: number; context: number }
  /** Property accesses whose name is in `OWNER_PROPS`. */
  ownerLikeAccesses: number
  /** Total AST nodes visited. Zero means the parse produced nothing, not that the file is clean. */
  nodesSeen: number
}

export interface ScanResult {
  handlers: HandlerInfo[]
  /** `file:line: VERB does not constrain the record by caller identity`, one per offending handler. */
  offenders: string[]
  counters: ScanCounters
}

/** `file:line: VERB does not constrain the record by caller identity` — the house collector shape. */
function formatOffender(file: string, handler: HandlerInfo): string {
  return `${file}:${handler.line}: ${handler.verb} does not constrain the record by caller identity`
}

/**
 * Parse `sourceText` and classify every exported verb handler in it.
 *
 * Exported and taking a source STRING rather than only a path, so the fixtures below reach exactly
 * this code path. A fixture is a string literal; a string literal is not a `FunctionDeclaration`,
 * which is why this gate's own file cannot be flagged by its own rules even if the corpus predicate
 * were widened.
 *
 * ⚠ DELIBERATE STUB — plan 48-05, task 1. The real implementation lands in task 2. This body parses
 * and returns nothing, on purpose, to demonstrate the exact vacuity the KNOWN_NEGATIVE parse floor
 * defends against: a detector that detects nothing passes EVERY negative fixture.
 */
export function scanSource(fileName: string, sourceText: string): ScanResult {
  ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  return {
    handlers: [],
    offenders: [],
    counters: {
      declarationHandlers: 0,
      bindingHandlers: 0,
      withApiAuthCalls: 0,
      identityHits: { ctx: 0, context: 0 },
      ownerLikeAccesses: 0,
      nodesSeen: 0,
    },
  }
}

/** The extracted value the positive fixtures assert on — `VERB:line`, never a boolean. */
function flaggedVerbLines(result: ScanResult): string[] {
  return result.handlers
    .filter((handler) => !handler.authorized)
    .map((handler) => `${handler.verb}:${handler.line}`)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE FIXTURES. Every source below is drawn from a real file in this repository.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Handlers that MUST be flagged. Each `expected` is the extracted `VERB:line` list, not a boolean —
 * a detector that flagged every node fails these too.
 */
const KNOWN_POSITIVE = [
  {
    // `activities/[id]/route.ts:95-102` — the live SEC-01 defect. The `where` narrows by id and
    // soft-delete and nothing else, and no comparison follows the fetch.
    label: "P1 GET fetches on and(eq(id), isNull(deletedAt)) with no comparison afterwards",
    source: [
      `export async function GET(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const activity = await db.query.activities.findFirst({`,
      `      where: and(eq(activities.id, id), isNull(activities.deletedAt)),`,
      `    }) as ActivityExpanded | undefined`,
      `    if (!activity) {`,
      `      return Problems.notFound("Activity")`,
      `    }`,
      `    return singleResponse(serializeActivity(activity))`,
      `  })`,
      `}`,
    ].join("\n"),
    expected: ["GET:1"],
  },
  {
    // `activities/[id]/route.ts:251-262` — identity is PRESENT in the body and reaches nothing but
    // an event payload. This is the fixture a token-presence detector gets wrong.
    label: "P2 PUT reads ctx.userId only into an event payload property",
    source: [
      `export async function PUT(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const [updated] = await db.update(activities)`,
      `      .set({ title: "x" })`,
      `      .where(eq(activities.id, id))`,
      `      .returning()`,
      `    crmBus.emit("activity.updated", {`,
      `      entityId: id,`,
      `      actorId: ctx.userId,`,
      `    })`,
      `    return singleResponse(serializeActivity(updated))`,
      `  })`,
      `}`,
    ].join("\n"),
    expected: ["PUT:1"],
  },
  {
    // `activities/route.ts:53` — the list `conditions` array never mentions the caller.
    label: "P3 list GET builds a conditions array that never mentions the caller",
    source: [
      `export async function GET(request: NextRequest) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const conditions = [isNull(activities.deletedAt)]`,
      `    const typeId = req.nextUrl.searchParams.get("type_id")`,
      `    if (typeId) {`,
      `      conditions.push(eq(activities.typeId, typeId))`,
      `    }`,
      `    const rows = await db.select().from(activities).where(and(...conditions))`,
      `    return listResponse(rows.map(serializeActivity))`,
      `  })`,
      `}`,
    ].join("\n"),
    expected: ["GET:1"],
  },
  {
    // The degradation path RESEARCH names: "the token `ownerId` appears somewhere in the body".
    // A `//` comment is trivia, not a node, so no AST rule can reach it. Note this fixture also
    // spells `ctx.userId` inside the comment — neither token counts.
    label: "P4 the only ownerId occurrence is inside a // comment",
    source: [
      `export async function DELETE(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    // TODO: compare activities.ownerId against ctx.userId before deleting`,
      `    await db.update(activities).set({ deletedAt: new Date() }).where(eq(activities.id, id))`,
      `    return new Response(null, { status: 204 })`,
      `  })`,
      `}`,
    ].join("\n"),
    expected: ["DELETE:1"],
  },
  {
    // Same degradation path, the other half: a StringLiteral is a node, but it is not a
    // PropertyAccessExpression, so no rule can key on it.
    label: "P5 the only ownerId occurrence is inside a string literal",
    source: [
      `export async function GET(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const columns = ["id", "title", "ownerId"]`,
      `    const row = await db.query.activities.findFirst({ where: eq(activities.id, id) })`,
      `    if (!row) {`,
      `      return Problems.notFound("Activity")`,
      `    }`,
      `    return singleResponse({ picked: columns, row })`,
      `  })`,
      `}`,
    ].join("\n"),
    expected: ["GET:1"],
  },
  {
    // No `withApiAuth` at all — unauthenticated as well as unauthorized. Flagged, and reported with
    // `withApiAuthSeen` false so the two failures are distinguishable in the offender list.
    label: "P6 DELETE with no withApiAuth call at all",
    source: [
      `export async function DELETE(request: NextRequest, { params }: RouteParams) {`,
      `  const { id } = await params`,
      `  await db.delete(activities).where(eq(activities.id, id))`,
      `  return new Response(null, { status: 204 })`,
      `}`,
    ].join("\n"),
    expected: ["DELETE:1"],
  },
] as const

/**
 * Handlers that MUST NOT be flagged — one per accepted idiom actually present in `/api/v1`.
 *
 * Every entry additionally carries a PARSE FLOOR below. Without it, `toEqual([])` is satisfied by a
 * parse that failed outright and returned nothing, and a detector that matches nothing passes every
 * negative. Task 1 of plan 48-05 demonstrated exactly that against a deliberate stub.
 */
const KNOWN_NEGATIVE = [
  {
    // `pipelines/[id]/route.ts:46-58`, the reference implementation, verbatim in shape. R2.
    label: "N1 fetch-then-compare, row.ownerId !== ctx.userId then 403",
    source: [
      `export async function GET(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const pipeline = await db.query.pipelines.findFirst({`,
      `      where: and(eq(pipelines.id, id), isNull(pipelines.deletedAt)),`,
      `    }) as PipelineExpanded | undefined`,
      `    if (!pipeline) {`,
      `      return Problems.notFound("Pipeline")`,
      `    }`,
      `    // Verify ownership`,
      `    if (pipeline.ownerId !== ctx.userId) {`,
      `      return Problems.forbidden()`,
      `    }`,
      `    return singleResponse(serializePipeline(pipeline))`,
      `  })`,
      `}`,
    ].join("\n"),
  },
  {
    // `organizations/[id]/route.ts:31-36` — the `where`-scoped idiom, which yields 404 rather than
    // 403. Both status outcomes are correct authorizations; this gate is agnostic between them. R1.
    label: "N2 where-scoped, and(eq(t.id, id), eq(t.ownerId, context.userId))",
    source: [
      `export async function GET(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const org = await db.query.organizations.findFirst({`,
      `      where: and(`,
      `        eq(organizations.id, id),`,
      `        eq(organizations.ownerId, context.userId),`,
      `        isNull(organizations.deletedAt)`,
      `      ),`,
      `    })`,
      `    if (!org) {`,
      `      return Problems.notFound("Organization")`,
      `    }`,
      `    return singleResponse(serializeOrganization(org))`,
      `  })`,
      `}`,
    ].join("\n"),
  },
  {
    // `stages/[id]/route.ts:93` — delegation to a local authorizer. R3.
    label: "N3 helper delegation, verifyStageOwnership(id, ctx.userId)",
    source: [
      `export async function PUT(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const { stage, owned } = await verifyStageOwnership(id, ctx.userId)`,
      `    if (!stage) {`,
      `      return Problems.notFound("Stage")`,
      `    }`,
      `    if (!owned) {`,
      `      return Problems.forbidden()`,
      `    }`,
      `    return singleResponse(serializeStage(stage))`,
      `  })`,
      `}`,
    ].join("\n"),
  },
  {
    // Delegation to an IMPORTED authorizer, and with the other identity spelling. R3.
    label: "N4 helper delegation with the other spelling, getWorkflow(id, context.userId)",
    source: [
      `export async function GET(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const workflow = await getWorkflow(id, context.userId)`,
      `    if (!workflow) {`,
      `      return Problems.notFound("Workflow")`,
      `    }`,
      `    return singleResponse(workflow)`,
      `  })`,
      `}`,
    ].join("\n"),
  },
  {
    // `organizations/batch/route.ts:58` — a create handler has no existing row to compare against;
    // it authorizes by STAMPING the caller onto the new row. R4.
    label: "N5 create handler assigning ownerId: ctx.userId into an insert values object",
    source: [
      `export async function POST(request: NextRequest) {`,
      `  return withApiAuth(request, async (req: NextRequest, ctx: ApiAuthContext) => {`,
      `    const body = await req.json()`,
      `    const [created] = await db.insert(activities).values({`,
      `      title: body.title,`,
      `      ownerId: ctx.userId,`,
      `    }).returning()`,
      `    return singleResponse(serializeActivity(created), 201)`,
      `  })`,
      `}`,
    ].join("\n"),
  },
  {
    // N1 written with `context` instead of `ctx`. Both green proves the spelling pair is handled;
    // a detector matching only one spelling under-detects by 26% across the real corpus.
    label: "N6 the N1 handler written with context instead of ctx",
    source: [
      `export async function GET(request: NextRequest, { params }: RouteParams) {`,
      `  return withApiAuth(request, async (req: NextRequest, context: ApiAuthContext) => {`,
      `    const { id } = await params`,
      `    const pipeline = await db.query.pipelines.findFirst({`,
      `      where: and(eq(pipelines.id, id), isNull(pipelines.deletedAt)),`,
      `    }) as PipelineExpanded | undefined`,
      `    if (!pipeline) {`,
      `      return Problems.notFound("Pipeline")`,
      `    }`,
      `    if (pipeline.ownerId !== context.userId) {`,
      `      return Problems.forbidden()`,
      `    }`,
      `    return singleResponse(serializePipeline(pipeline))`,
      `  })`,
      `}`,
    ].join("\n"),
  },
  {
    // `activities/[id]/notes/route.ts:12-17`, all 17 lines of it. FOUR files in `/api/v1` export
    // handlers this way and export no `FunctionDeclaration` at all — a `FunctionDeclaration`-only
    // walker sees EIGHT handlers as ZERO, and they drop out of the sweep with no exemption entry,
    // no reason and no record. That is the anti-gate shape this milestone exists to eliminate, and
    // it would have shipped inside the gate built to prevent it.
    label: "N7 binding-form export delegating to a collection handler factory",
    source: [
      `import { activities } from "@/db/schema/activities"`,
      `import { noteCollectionHandlers } from "@/lib/api/notes-collection"`,
      ``,
      `export const { GET, POST } = noteCollectionHandlers({`,
      `  entityType: "activity",`,
      `  entityLabel: "Activity",`,
      `  parentTable: activities,`,
      `  routeLabel: "/api/v1/activities/[id]/notes",`,
      `})`,
    ].join("\n"),
  },
] as const

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE MATCHER PROVES ITSELF AGAINST THOSE FIXTURES, BEFORE THE CORPUS IS TOUCHED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("the authorization matcher, unit-tested against fixtures FIRST", () => {
  /**
   * These assertions gate everything below them. A matcher that matches nothing yields an empty
   * offender list, an empty list satisfies `toEqual([])`, and the whole sweep becomes unfalsifiable.
   * If any fixture here is red, treat every pass further down as unproven.
   */
  it.each(KNOWN_POSITIVE)("MUST flag: $label", ({ source, expected }) => {
    const result = scanSource("known-positive.ts", source)
    expect(flaggedVerbLines(result)).toEqual([...expected])
  })

  it.each(KNOWN_NEGATIVE)("MUST NOT flag: $label", ({ source }) => {
    const result = scanSource("known-negative.ts", source)
    expect(result.offenders).toEqual([])
  })

  it.each(KNOWN_NEGATIVE)("still parses a handler in the negative fixture: $label", ({ source, label }) => {
    // The negatives' parse floor. `toEqual([])` above is satisfied by a parse that failed outright
    // and returned nothing, which would make every negative meaningless — a matcher that matches
    // nothing passes all of them. Every negative fixture exports a handler on purpose; the parse
    // must still have counted one, so the fixture proves "saw the handler, did not flag it" rather
    // than "saw nothing at all".
    const result = scanSource("known-negative.ts", source)
    expect(result.handlers.length, `the parse saw no exported handler in: ${label}`).toBeGreaterThan(0)
    expect(result.counters.nodesSeen, `the parse visited no AST node in: ${label}`).toBeGreaterThan(0)
  })
})
