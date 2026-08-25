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
 * Floor on the number of `route.ts` files the walk enumerates under `src/app/api/v1`.
 * Measured on the tree this gate was written against: **36**. 30 is a deliberately loose floor, set
 * BELOW the measurement so that ordinary consolidation does not fatal with a message that
 * misdiagnoses shrinkage as a broken walk.
 *
 * Without this floor a wrong root constant or a broken recursion yields an empty file list,
 * therefore zero offenders, therefore a permanently green gate — the exact shape of the v1.3 gates
 * that could not fail, and the shape SEC-48-B proved this repository still had.
 */
const MIN_ROUTE_FILES = 30

/**
 * Floor on exported `FunctionDeclaration` verb handlers parsed across that corpus.
 * Measured: **62**. 55 is set below it, for the reason above.
 *
 * "The sweep found no offenders" is satisfied perfectly by a handler detector that stopped detecting
 * handlers — a renamed `SyntaxKind`, a `typescript` major that changes how modifiers are reached, or
 * a typo in `VERBS`. This is what tells those apart from a tree in which every route authorizes.
 */
const MIN_HANDLERS_PARSED = 55

/**
 * Floor on handlers exported via `export const { GET, POST } = factory(...)`.
 * Measured: **8**, across exactly **4** files — `activities/[id]/notes`, `deals/[id]/notes`,
 * `organizations/[id]/notes`, `people/[id]/notes`. Every one of those files exports ZERO
 * `FunctionDeclaration`s.
 *
 * Set at HALF the measurement, deliberately and unlike the other four floors. The failure this
 * defends against is a walker that reports **zero** — the entire binding-form population dropping
 * out of the sweep with no exemption entry and no record. Consolidating two of the four note routes
 * is an ordinary refactor and must not false-RED; regressing to a `FunctionDeclaration`-only walk
 * must.
 */
const MIN_BINDING_HANDLERS = 4

/**
 * Floor on `withApiAuth(...)` call expressions across the corpus.
 * Measured: **61** — which is the 62 declaration-form handlers minus `docs/route.ts`'s GET, the one
 * handler deliberately outside the wrapper. 50 is set below it.
 */
const MIN_WITH_API_AUTH_CALLS = 50

/**
 * WR-11 token floors: the identifiers this detector MATCHES ON must still be FOUND in the corpus.
 * Measured `context.userId` **55**, `ctx.userId` **22**, owner-like property accesses **123**.
 *
 * Phase 46's lesson, restated: a scan that never asserts its own search term still matches goes
 * green precisely when it breaks. If `context.userId` were renamed repo-wide and `IDENTITY_OBJECTS`
 * were not updated, every handler would become an offender — loud. But if the rename went the other
 * way, or if `isIdentityExpression` regressed, every handler would become authorized and the sweep
 * would report a clean tree. These three floors are the only thing standing between that and a
 * green tick beside an open hole.
 */
const MIN_IDENTITY_HITS_CONTEXT = 40
const MIN_IDENTITY_HITS_CTX = 15
const MIN_OWNER_LIKE_ACCESSES = 90

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
 * The bare name a call expression's callee resolves to: `eq` for `eq(a, b)`, `findFirst` for
 * `db.query.activities.findFirst(...)`. `null` for anything else — an element access, a call of a
 * call, a parenthesised expression.
 */
function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return null
}

/**
 * THE identity expression: `ctx.userId` or `context.userId`, as a `PropertyAccessExpression` whose
 * object is a bare identifier in `IDENTITY_OBJECTS`.
 *
 * A node kind, never a token. `ctx.userId` written inside a `//` comment is trivia and inside a
 * string literal is a `StringLiteral`; neither is a `PropertyAccessExpression`, so neither can
 * satisfy any rule below. Fixtures P4 and P5 prove that rather than assume it.
 */
function isIdentityExpression(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "userId" &&
    ts.isIdentifier(node.expression) &&
    IDENTITY_OBJECTS.has(node.expression.text)
  )
}

/** A property access naming the row's owner column — `pipeline.ownerId`, `organizations.ownerId`. */
function isOwnerLikeAccess(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node) && OWNER_PROPS.has(node.name.text)
}

/** True when one of the two nodes is the identity and the other is an owner column. Order-free. */
function pairsIdentityWithOwner(left: ts.Node, right: ts.Node): boolean {
  return (
    (isIdentityExpression(left) && isOwnerLikeAccess(right)) ||
    (isIdentityExpression(right) && isOwnerLikeAccess(left))
  )
}

/**
 * R1 — the `where`-SCOPED idiom: a drizzle `eq`/`ne` comparing an owner column to the caller.
 *
 * Accepts `src/app/api/v1/organizations/[id]/route.ts:31-36`
 * (`and(eq(organizations.id, id), eq(organizations.ownerId, context.userId), isNull(...))`) and the
 * `conditions` array form at `src/app/api/v1/activities/route.ts:53-70` once a caller predicate is
 * pushed into it.
 *
 * Both arguments are required to be a comparison pair, which is what keeps
 * `eq(activities.ownerId, ownerId)` — the `?owner_id=` FILTER at `activities/route.ts` — out: its
 * second argument is a bare `Identifier` read from the query string, not an identity expression. A
 * caller-supplied filter is not an authorization check and must not be mistaken for one.
 */
function matchesR1(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false
  const callee = calleeName(node.expression)
  if (callee !== "eq" && callee !== "ne") return false
  if (node.arguments.length !== 2) return false
  return pairsIdentityWithOwner(node.arguments[0], node.arguments[1])
}

/** The four equality operators R2 accepts. `<`/`>` are not authorization comparisons. */
const EQUALITY_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
])

/**
 * R2 — the FETCH-THEN-COMPARE idiom, which yields 403 rather than 404.
 *
 * Accepts `src/app/api/v1/pipelines/[id]/route.ts:56-58` — the reference implementation,
 * `if (pipeline.ownerId !== ctx.userId) return Problems.forbidden()` — and the same shape at
 * `webhooks/[id]/route.ts`.
 *
 * ⚠ This is also the rule that accepts `src/app/api/v1/stages/[id]/route.ts:81-83`, the SEC-02
 * defect. See the header: the comparison is real, the relation it reads is decided by the caller,
 * and a presence gate is structurally incapable of telling those apart.
 */
function matchesR2(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node)) return false
  if (!EQUALITY_OPERATORS.has(node.operatorToken.kind)) return false
  return pairsIdentityWithOwner(node.left, node.right)
}

/**
 * R3 — DELEGATION to a named authorizer that receives the caller identity.
 *
 * Accepts `src/app/api/v1/stages/[id]/route.ts:93` (`verifyStageOwnership(id, ctx.userId)`) and
 * `:149`, the audit and trash routes' `resolveActorRole` / `authorizeAuditRead` calls, and the
 * workflows routes' `getWorkflow(id, context.userId)`.
 *
 * Receiving the identity is required, not just the name: a `getWorkflow(id)` that dropped its second
 * argument is exactly the regression this gate exists to catch.
 */
function matchesR3(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false
  const callee = calleeName(node.expression)
  if (callee === null || !AUTHORIZERS.has(callee)) return false
  return node.arguments.some(isIdentityExpression)
}

/**
 * R4 — CREATE-TIME ownership assignment. A create handler has no existing row to compare against;
 * it authorizes by stamping the caller onto the new row.
 *
 * Accepts `src/app/api/v1/organizations/batch/route.ts:58` (`userId: context.userId` passed into
 * `createOrganizationMutation`) and the `values({ ownerId: ctx.userId })` form.
 *
 * The property NAME must be an owner column. `actorId: ctx.userId` in a CRM event payload —
 * `activities/[id]/route.ts:255` — deliberately does not match: identity present in the body,
 * reaching nothing. Fixture P2 is that shape.
 */
function matchesR4(node: ts.Node): boolean {
  if (!ts.isPropertyAssignment(node)) return false
  const name =
    ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
  if (name === null || !OWNER_PROPS.has(name)) return false
  return isIdentityExpression(node.initializer)
}

/** True when any node in `root`'s subtree satisfies R1, R2, R3 or R4. */
function subtreeAuthorizes(root: ts.Node): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (matchesR1(node) || matchesR2(node) || matchesR3(node) || matchesR4(node)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(root, visit)
  return found
}

/** True when a `withApiAuth(...)` call appears anywhere in `root`'s subtree. */
function subtreeCallsWithApiAuth(root: ts.Node): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && calleeName(node.expression) === "withApiAuth") {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(root, visit)
  return found
}

/** Whether a top-level statement carries the `export` modifier. */
function hasExportModifier(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
  )
}

/**
 * Parse `sourceText` and classify every exported verb handler in it.
 *
 * Exported and taking a source STRING rather than only a path, so the fixtures above reach exactly
 * this code path. A fixture is a string literal; a string literal is not a `FunctionDeclaration`,
 * which is why this gate's own file cannot be flagged by its own rules even if the corpus predicate
 * were widened.
 *
 * BOTH handler forms are collected. The binding form is not decoration: four `/api/v1` files export
 * `const { GET, POST } = noteCollectionHandlers(...)` and export no `FunctionDeclaration` at all, so
 * a `FunctionDeclaration`-only walker sees eight live handlers as ZERO and they leave the sweep with
 * no exemption entry and no record.
 */
export function scanSource(fileName: string, sourceText: string): ScanResult {
  const src = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )

  const lineOf = (node: ts.Node): number =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1

  const counters: ScanCounters = {
    declarationHandlers: 0,
    bindingHandlers: 0,
    withApiAuthCalls: 0,
    identityHits: { ctx: 0, context: 0 },
    ownerLikeAccesses: 0,
    nodesSeen: 0,
  }

  // One full walk for the anti-vacuity counters. `nodesSeen` is what tells "clean file" apart from
  // "ts.createSourceFile returned a silently truncated tree", which it does rather than throwing.
  const count = (node: ts.Node): void => {
    counters.nodesSeen += 1
    if (ts.isCallExpression(node) && calleeName(node.expression) === "withApiAuth") {
      counters.withApiAuthCalls += 1
    }
    if (isIdentityExpression(node) && ts.isPropertyAccessExpression(node)) {
      const object = (node.expression as ts.Identifier).text
      if (object === "ctx") counters.identityHits.ctx += 1
      else counters.identityHits.context += 1
    }
    if (isOwnerLikeAccess(node)) counters.ownerLikeAccesses += 1
    ts.forEachChild(node, count)
  }
  ts.forEachChild(src, count)

  const handlers: HandlerInfo[] = []

  for (const statement of src.statements) {
    if (!hasExportModifier(statement)) continue

    // Form 1 of 2 — `export async function GET(...) { ... }`. Measured: 62 across the corpus.
    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text
      if (name === undefined || !VERBS.has(name)) continue
      counters.declarationHandlers += 1
      handlers.push({
        verb: name,
        line: lineOf(statement),
        form: "declaration",
        delegatedTo: null,
        authorized: subtreeAuthorizes(statement),
        withApiAuthSeen: subtreeCallsWithApiAuth(statement),
      })
      continue
    }

    // Form 2 of 2 — `export const { GET, POST } = noteCollectionHandlers({ ... })`. Measured: 8
    // handlers across exactly 4 files, every one of which exports zero FunctionDeclarations.
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isObjectBindingPattern(declaration.name)) continue
      const initializer = declaration.initializer
      const delegatedTo =
        initializer !== undefined && ts.isCallExpression(initializer)
          ? calleeName(initializer.expression)
          : initializer !== undefined
            ? calleeName(initializer)
            : null

      for (const element of declaration.name.elements) {
        // `{ GET }` binds under `name`; `{ GET: handleGet }` binds the VERB under `propertyName`.
        const bound =
          element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : ts.isIdentifier(element.name)
              ? element.name.text
              : null
        if (bound === null || !VERBS.has(bound)) continue
        counters.bindingHandlers += 1
        handlers.push({
          verb: bound,
          line: lineOf(statement),
          form: "binding",
          delegatedTo,
          // A binding-form handler is NEVER an offender: the body it exports lives in the factory,
          // which this single-file parse cannot see. It is reported with `delegatedTo` so plan
          // 48-08 can build a live control over the delegation target rather than a path exclusion.
          authorized: true,
          withApiAuthSeen: false,
        })
      }
    }
  }

  const offenders = handlers
    .filter((handler) => !handler.authorized)
    .map((handler) => formatOffender(fileName, handler))

  return { handlers, offenders, counters }
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

/**
 * Every `route.ts` under `relativeDir`, as repo-relative POSIX paths.
 *
 * The corpus predicate is `entry.name === "route.ts"` — an exact string comparison, not a glob and
 * not a grep. `rtk` makes `grep ... | wc -l` return a wrong count in this environment (measured
 * 36 -> 19), so a shelled-out enumeration could not be trusted even as a cross-check.
 */
export function walkRouteFiles(relativeDir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(path.join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
    const rel = `${relativeDir}/${entry.name}`
    if (entry.isDirectory()) out.push(...walkRouteFiles(rel))
    else if (entry.name === "route.ts") out.push(rel)
  }
  return out
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

  it("sees the binding form as a first-class handler shape, with its delegation target", () => {
    // The blind spot this closes, stated as a number: a `FunctionDeclaration`-only walker reports
    // ZERO handlers for N7 and for the four real files it is drawn from — 8 live handlers that
    // would leave the sweep with no exemption entry, no reason and no record.
    const n7 = KNOWN_NEGATIVE.find((fixture) => fixture.label.startsWith("N7"))
    const result = scanSource("known-negative.ts", n7?.source ?? "")

    expect(result.handlers.map((handler) => `${handler.form} ${handler.verb}`)).toEqual([
      "binding GET",
      "binding POST",
    ])
    expect(result.counters.bindingHandlers).toBe(2)
    expect(result.counters.declarationHandlers).toBe(0)
    for (const handler of result.handlers) {
      expect(handler.delegatedTo, "the delegation target is what 48-08's live control keys on")
        .toBe("noteCollectionHandlers")
    }
  })

  it("distinguishes the four rules by which one fires, not just by the verdict", () => {
    // A single rule that happened to match everything would satisfy every negative above. These
    // assert the SPECIFIC rule, at the AST level, on the exact expression each idiom produces.
    const parse = (text: string): ts.Node =>
      ts.createSourceFile("rule-probe.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    const firstMatch = (text: string, rule: (node: ts.Node) => boolean): boolean => {
      let hit = false
      const visit = (node: ts.Node): void => {
        if (hit) return
        if (rule(node)) hit = true
        else ts.forEachChild(node, visit)
      }
      ts.forEachChild(parse(text), visit)
      return hit
    }

    expect(firstMatch(`const w = eq(organizations.ownerId, context.userId)`, matchesR1)).toBe(true)
    expect(firstMatch(`const w = eq(activities.ownerId, ownerId)`, matchesR1)).toBe(false)
    expect(firstMatch(`if (pipeline.ownerId !== ctx.userId) {}`, matchesR2)).toBe(true)
    expect(firstMatch(`if (pipeline.id !== id) {}`, matchesR2)).toBe(false)
    expect(firstMatch(`const r = verifyStageOwnership(id, ctx.userId)`, matchesR3)).toBe(true)
    expect(firstMatch(`const r = verifyStageOwnership(id)`, matchesR3)).toBe(false)
    expect(firstMatch(`const v = { ownerId: ctx.userId }`, matchesR4)).toBe(true)
    expect(firstMatch(`const v = { actorId: ctx.userId }`, matchesR4)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE CORPUS. Walked once, parsed once, at module scope.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Measured cost of this block, this session: `import ts from "typescript"` **522.9 ms** (once per
 * vitest WORKER, not once per gate), the directory walk **1.3 ms**, parsing all 36 route files
 * **161.7 ms** over **23,215 AST nodes**. Worst case for the whole file ≈ 690 ms.
 *
 * Those numbers live in this comment and NOWHERE in an assertion. `suite-timing-hygiene.test.ts`
 * forbids an `expect()` over a clock-derived delta or ratio, and a timing assertion in CI is a
 * flake generator rather than a control.
 *
 * The corpus is `route.ts` files, which is DISJOINT from the `*.test.ts` corpus of
 * `suite-hook-hygiene.test.ts` and `suite-timing-hygiene.test.ts`. There is no `CORPUS` constant to
 * extend and nothing to share; this gate is standalone on purpose.
 */
const ROUTE_FILES = walkRouteFiles(API_ROOT).sort()
const CORPUS = ROUTE_FILES.map((file) => ({ file, ...scanSource(file, readRepoFile(file)) }))

const TOTAL_DECLARATION_HANDLERS = CORPUS.reduce(
  (sum, entry) => sum + entry.counters.declarationHandlers,
  0
)
const TOTAL_BINDING_HANDLERS = CORPUS.reduce(
  (sum, entry) => sum + entry.counters.bindingHandlers,
  0
)
const TOTAL_WITH_API_AUTH_CALLS = CORPUS.reduce(
  (sum, entry) => sum + entry.counters.withApiAuthCalls,
  0
)
const TOTAL_IDENTITY_HITS = CORPUS.reduce(
  (totals, entry) => ({
    ctx: totals.ctx + entry.counters.identityHits.ctx,
    context: totals.context + entry.counters.identityHits.context,
  }),
  { ctx: 0, context: 0 }
)
const TOTAL_OWNER_LIKE_ACCESSES = CORPUS.reduce(
  (sum, entry) => sum + entry.counters.ownerLikeAccesses,
  0
)
const CORPUS_OFFENDERS = CORPUS.flatMap((entry) => entry.offenders)

describe("the sweep reaches the tree it claims to scan", () => {
  it(`enumerates at least ${MIN_ROUTE_FILES} route files under ${API_ROOT}/`, () => {
    expect(
      ROUTE_FILES.length,
      `the walk found ${ROUTE_FILES.length} route files. Measured 36 when this gate was written; ` +
        `a count this low means API_ROOT or the recursion is wrong, and every negative assertion ` +
        `that reads this corpus is passing because it has nothing to look at.`
    ).toBeGreaterThanOrEqual(MIN_ROUTE_FILES)
  })

  it(`parses at least ${MIN_HANDLERS_PARSED} declaration-form verb handlers`, () => {
    expect(
      TOTAL_DECLARATION_HANDLERS,
      `the parse found ${TOTAL_DECLARATION_HANDLERS} exported function handlers. Measured 62. If ` +
        `this collapsed, the handler detector stopped detecting — check VERBS, hasExportModifier ` +
        `and ts.isFunctionDeclaration against the installed typescript major.`
    ).toBeGreaterThanOrEqual(MIN_HANDLERS_PARSED)
  })

  it(`parses at least ${MIN_BINDING_HANDLERS} binding-form verb handlers`, () => {
    // The floor that makes the FunctionDeclaration-only blind spot impossible to reintroduce
    // silently. Measured 8, across exactly 4 files. A regression to a declaration-only walk reports
    // ZERO here while leaving every other assertion in this file perfectly green.
    expect(
      TOTAL_BINDING_HANDLERS,
      `the parse found ${TOTAL_BINDING_HANDLERS} binding-form handlers. Measured 8 across 4 note ` +
        `routes, each of which exports NO FunctionDeclaration at all. A zero here means those ` +
        `files left the sweep with no exemption entry, no reason and no record.`
    ).toBeGreaterThanOrEqual(MIN_BINDING_HANDLERS)
  })

  it(`parses at least ${MIN_WITH_API_AUTH_CALLS} withApiAuth call expressions`, () => {
    expect(
      TOTAL_WITH_API_AUTH_CALLS,
      `the parse found ${TOTAL_WITH_API_AUTH_CALLS} withApiAuth calls. Measured 61 — the 62 ` +
        `declaration-form handlers minus docs/route.ts's deliberately unwrapped GET.`
    ).toBeGreaterThanOrEqual(MIN_WITH_API_AUTH_CALLS)
  })

  it("parses every enumerated file without a syntax error swallowing its contents", () => {
    // `ts.createSourceFile` returns a SourceFile even when it fails to parse — silently, with a
    // truncated tree, no throw and no diagnostic unless you ask for one. A file that parsed to zero
    // nodes is a parse failure, not a clean file, and a file that parsed to zero handlers is a
    // route.ts that exports no route handler, which does not exist in this tree.
    const emptyParses = CORPUS.filter((entry) => entry.counters.nodesSeen === 0).map((e) => e.file)
    expect(emptyParses, `these route files parsed to ZERO AST nodes`).toEqual([])

    const noHandler = CORPUS.filter((entry) => entry.handlers.length === 0).map((e) => e.file)
    expect(
      noHandler,
      `these route.ts files parsed to zero exported verb handlers. Every route.ts in this tree ` +
        `exports at least one, so this is a parse or a detector failure rather than a clean file.`
    ).toEqual([])
  })
})

describe("the detector still finds the identifiers it matches on (WR-11)", () => {
  it("finds both identity spellings and the owner-like property accesses", () => {
    // The negative this gate ultimately asserts is "no handler fails to reach an identity
    // expression". A detector that stopped recognising `context.userId` satisfies that by finding
    // nothing to recognise. These three floors are what make the eventual `toEqual([])` mean
    // something rather than mean "it broke".
    expect(
      TOTAL_IDENTITY_HITS.context,
      `\`context.userId\` fell to ${TOTAL_IDENTITY_HITS.context} occurrences in ${API_ROOT} ` +
        `(measured 55). The detector was almost certainly renamed rather than the codebase ` +
        `rewritten — check IDENTITY_OBJECTS and isIdentityExpression.`
    ).toBeGreaterThanOrEqual(MIN_IDENTITY_HITS_CONTEXT)

    expect(
      TOTAL_IDENTITY_HITS.ctx,
      `\`ctx.userId\` fell to ${TOTAL_IDENTITY_HITS.ctx} occurrences in ${API_ROOT} (measured 22). ` +
        `Both spellings are in live use; a detector matching only one under-detects by 26% and ` +
        `reports offenders that are correctly authorized.`
    ).toBeGreaterThanOrEqual(MIN_IDENTITY_HITS_CTX)

    expect(
      TOTAL_OWNER_LIKE_ACCESSES,
      `owner-like property accesses fell to ${TOTAL_OWNER_LIKE_ACCESSES} in ${API_ROOT} ` +
        `(measured 123). If this collapsed, OWNER_PROPS no longer names the schema's ownership ` +
        `columns and rules R1, R2 and R4 have stopped being able to fire at all.`
    ).toBeGreaterThanOrEqual(MIN_OWNER_LIKE_ACCESSES)
  })
})

describe("the gate does not sweep itself, and that is structural rather than an exclusion", () => {
  it("is not enumerated by its own walk", () => {
    // EXACTLY ONE mitigation, and this is it: the corpus predicate is `entry.name === "route.ts"`,
    // and this file is not one. Asserted rather than assumed, because widening that predicate to
    // `*.ts` would silently pull this file's fixtures in and give the gate a second, unprovable
    // reason to be green.
    //
    // Do NOT additionally path-exclude this file, and do not claim the string fixtures are a second
    // mitigation. Two mitigations is one fewer than one: neither ends up provable.
    expect(ROUTE_FILES).not.toContain(GATE_PATH)
    expect(ROUTE_FILES.some((file) => file.includes("__tests__"))).toBe(false)
  })
})

describe("PRE-FIX OBSERVATION — plan 48-05 wave 1", () => {
  /**
   * ⚠ TEMPORARY OBSERVATION SLOT. THIS `it` IS NOT A GATE.
   *
   * Its only assertion is the `MIN_ROUTE_FILES` floor. The offender list is PRINTED, not asserted,
   * and a log line is not a gate — that is deliberate and it is stated here so no reader mistakes
   * the console output for a control.
   *
   * Why it exists: this file lands in wave 1, alongside plans 48-01 through 48-04, which are fixing
   * four of the routes below. `expect(CORPUS_OFFENDERS).toEqual([])` would be red today, and
   * asserting the pre-fix set exactly would go red the moment those four plans merge. So wave 1
   * records the RED-first evidence — the direct answer to SEC-48-B, which measured 5237 passing
   * tests failing to notice three deleted ownership predicates — and wave 2 turns it into a gate.
   *
   * **PLAN 48-08 DELETES THIS `it`**, adds the four exemption lists as live controls, and replaces
   * it with the array-form `expect(CORPUS_OFFENDERS).toEqual([])` plus the falsification controls
   * that prove this gate can fail.
   */
  it("records the offender list the detector produces today", () => {
    console.log(
      `\n[48-05] ${CORPUS_OFFENDERS.length} unauthorized /api/v1 handlers, pre-fix, no exemptions:\n` +
        CORPUS_OFFENDERS.map((offender) => `  ${offender}`).join("\n") +
        `\n[48-05] corpus: ${ROUTE_FILES.length} route files, ` +
        `${TOTAL_DECLARATION_HANDLERS} declaration-form + ${TOTAL_BINDING_HANDLERS} binding-form ` +
        `handlers, ${TOTAL_WITH_API_AUTH_CALLS} withApiAuth calls, ` +
        `${TOTAL_IDENTITY_HITS.context} context.userId + ${TOTAL_IDENTITY_HITS.ctx} ctx.userId, ` +
        `${TOTAL_OWNER_LIKE_ACCESSES} owner-like accesses\n`
    )

    expect(ROUTE_FILES.length).toBeGreaterThanOrEqual(MIN_ROUTE_FILES)
  })
})
