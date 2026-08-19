"use server"

/**
 * EVERY BROWSER-FACING WRITE AND POLL OF THE `/duplicates` SURFACE (DEDUP-01).
 *
 * THIS FILE IS THE SECOND HALF OF THE GATE, AND IT IS NOT REDUNDANT WITH THE FIRST.
 * `src/app/duplicates/layout.tsx` redirects a non-admin away from every page RENDER in the subtree.
 * It does not — and cannot — protect a server action, which is a POST endpoint the browser can
 * invoke directly with no page render involved: the same fact `src/app/admin/audit/actions.ts:6-10`
 * records about `/admin/*`, where a layout redirect protects every page and no action. So the role
 * is re-checked at the top of EVERY exported function below, and
 * `__tests__/duplicates-actions-wiring.test.ts` derives the list of those functions from this
 * source so a seventh action cannot ship ungated.
 *
 * A HIDDEN OR DISABLED BUTTON IS NEVER THE CONTROL. Plan 39-16's admin-only `Find duplicates`
 * toolbar button, the cancel button UI-SPEC P-6 hides from a non-starter, and the scan CTA P-7
 * disables during a run are all presentation. The refusals below are what enforce them.
 *
 * THE FAILURE VOCABULARY IS CODES, NOT PROSE — the `src/app/trash/actions.ts` shape. The UI switches
 * on `code` and string-matches nothing, which is what lets `/duplicates` say one sentence for a pair
 * that has already been merged and a different one for a scan somebody else started. A driver's
 * error string never crosses this boundary, and no message-catalog key is chosen here.
 *
 * NOTHING HERE TRUSTS ITS ARGUMENTS. Every id goes through `parseRecordId`'s shape test, the entity
 * type through a membership test against two frozen literals, and the identity-field list through a
 * length-and-content test before `writeOrgIdentityFields` validates it again with zod. A parameter
 * type is an annotation for the UI's benefit and is not a runtime control on a value that arrived
 * over the wire (T-39-04).
 *
 * ORDER: SESSION, ROLE, ARGUMENTS, THEN THE ACTOR SCOPE (T-36-02). `runWithActor` opens only after
 * all three checks, so an unauthenticated or non-admin call establishes no actor at all.
 */

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/db"
import { duplicatePairs, type DedupScanStatus } from "@/db/schema"
import { runWithActor } from "@/lib/audit/actor-context"
import { writeOrgIdentityFields } from "@/lib/dedup/identity-settings"
import { runDuplicateScan } from "@/lib/dedup/scan-engine"
import {
  calculateScanProgress,
  cancelScan,
  createScanState,
  getScanState,
  SCAN_ALREADY_RUNNING,
} from "@/lib/dedup/scan-state"
import type { MergeableEntityType } from "@/lib/dedup/types"

const LOG_PREFIX = "[duplicates-actions]"

// ---------------------------------------------------------------------------------------
// The result vocabulary
// ---------------------------------------------------------------------------------------

/**
 * Why a call was refused. Seven codes, each of which the UI turns into a different sentence:
 *
 *   NOT_AUTHENTICATED — no session at all.
 *   NOT_ADMIN         — a signed-in non-admin. `/duplicates` is admin-only (39-CONTEXT, locked).
 *   INVALID           — an argument failed its runtime shape test, or names nothing.
 *   PAIR_GONE         — the pair is not in the state the call assumed: already merged, already
 *                       dismissed, retired by a rescan, or gone. The UI pairs this with a refresh,
 *                       never with "try again".
 *   NOT_STARTER       — a cancel attempted by somebody other than the user who started the scan
 *                       (UI-SPEC P-6).
 *   SCAN_RUNNING      — a scan of that entity type is already running (T-39-07).
 *   FAILED            — anything else. Deliberately opaque: the underlying message may name a
 *                       constraint or a table and none of that belongs in a browser.
 */
export type DedupErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_ADMIN"
  | "INVALID"
  | "PAIR_GONE"
  | "NOT_STARTER"
  | "SCAN_RUNNING"
  | "FAILED"

/**
 * Every action returns this shape; `T` is the per-action success payload.
 *
 * The default is `Record<never, never>` rather than `Record<string, never>` — the latter is what
 * `TrashActionResult` uses and it works there only because every trash action carries a payload.
 * Intersected with `{ success: true }` it demands that `success` itself be `never`, so an action
 * whose success is just "it worked" cannot be typed at all.
 */
export type DedupActionResult<T = Record<never, never>> =
  | ({ success: true } & T)
  | { success: false; code: DedupErrorCode }

/**
 * What the poller renders. Deliberately NOT the whole scan row.
 *
 * `userId` is resolved into `startedByViewer` HERE rather than shipped to the browser: UI-SPEC P-6
 * needs to know only whether the viewer may cancel, and handing another user's id to every client
 * that opens the page would be a disclosure bought for nothing. `startedAt` crosses as an ISO string
 * for the same reason `dedup.scan.lastRun` takes a pre-formatted `{time}` — the sentence is built by
 * the caller's formatter, in the caller's locale.
 */
export interface ScanProgressPayload {
  scanId: string
  entityType: MergeableEntityType
  status: DedupScanStatus
  cancelled: boolean
  current: number
  total: number
  /** 0-100, clamped at both ends by `calculateScanProgress`. */
  percentage: number
  startedAt: string
  /** Whether the viewer started this scan — the P-6 cancel-button visibility input, not a control. */
  startedByViewer: boolean
}

/*
 * The result types are named aliases rather than inline generics, so every signature below reads
 * `): Promise<XResult> {`. That keeps the actions readable AND keeps the source gate simple: a
 * return type containing a braced object literal is a brace the gate's body finder has to tell apart
 * from the function body.
 */
export type StartScanResult = DedupActionResult<{ scanId: string }>
export type ScanProgressResult = DedupActionResult<{ scan: ScanProgressPayload | null }>
export type CancelScanResult = DedupActionResult
export type DismissPairResult = DedupActionResult
export type SaveOrgIdentityFieldsResult = DedupActionResult

// ---------------------------------------------------------------------------------------
// Runtime narrowing — every one of these runs before any query
// ---------------------------------------------------------------------------------------

/**
 * A BARE SHAPE TEST, NOT A UUID PATTERN — `src/app/trash/actions.ts:111-117` verbatim, including
 * its reasoning: every id this surface handles is a `uuid`-shaped `text` column today, but a parser
 * that encodes that assumption becomes wrong the moment one key type changes, and the value's only
 * job here is to be a bindable parameter. The 64-character ceiling stops a megabyte string being
 * carried into a query and a log line; the non-empty test stops `""`, which is a legal `string` and
 * matches nothing.
 */
const MAX_RECORD_ID_LENGTH = 64

function parseRecordId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_RECORD_ID_LENGTH
    ? raw
    : null
}

/**
 * The two scannable entity types, as a frozen membership test.
 *
 * `MergeableEntityType` is a type and therefore not a control; this is the runtime half. A `find`
 * over frozen literals rather than an object lookup, so `__proto__` is an ordinary non-member.
 */
const SCANNABLE_ENTITY_TYPES: readonly MergeableEntityType[] = Object.freeze([
  "organization",
  "person",
])

function parseEntityType(raw: unknown): MergeableEntityType | null {
  return SCANNABLE_ENTITY_TYPES.find((entityType) => entityType === raw) ?? null
}

/**
 * At most two non-empty field labels.
 *
 * MIRRORS `ORG_IDENTITY_FIELDS_MAX`, and does not import it — that constant lives beside the zod
 * schema in `identity-settings.ts`, which is the authority and validates again before the write
 * (T-39-11). This test is the outer one: it stops an arbitrary-length array of arbitrary values
 * being carried any further, and returns a `code` the UI can render, which a zod error string is
 * not. Both directions are deliberate; neither may be "tidied up" into the other.
 */
const MAX_IDENTITY_FIELDS = 2

function parseIdentityFields(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length > MAX_IDENTITY_FIELDS) return null

  const fields: string[] = []

  for (const entry of raw) {
    if (typeof entry !== "string") return null

    const trimmed = entry.trim()

    if (trimmed.length === 0) return null
    if (trimmed.length > MAX_RECORD_ID_LENGTH) return null

    fields.push(trimmed)
  }

  return fields
}

// ---------------------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------------------

/**
 * Start a background scan of one entity type.
 *
 * THE SCAN IS FIRED AND NOT AWAITED, AND THAT IS A DEPLOYMENT ASSUMPTION WORTH WRITING DOWN.
 * `runDuplicateScan` measured 20.6s for organizations and 32.0s for people against this deployment's
 * live data (plan 39-07), which is far past any request budget — so the action returns as soon as the
 * scan ROW exists and the work continues in the same long-lived Node process. That holds because
 * this app runs as a container under `docker compose`, which is exactly what
 * `dedup.scan.backgroundHint` promises the user ("This runs in the background. You can leave this
 * page and come back."). It would NOT hold on a serverless platform, where the function would be
 * frozen at the response — and where the existing Pipedrive importer would break in the same way, on
 * the same day, for the same reason. The two share this constraint; neither invented it.
 *
 * The actor scope wraps the SCAN, not just its creation, so every row the scan writes is attributed
 * to the user who asked for it rather than to the audit subscriber's `"system"` fallback.
 *
 * `createScanState`'s refusal maps to `SCAN_RUNNING`. That guard is per entity type (a running
 * organization scan must not disable the people CTA) and it is READ-THEN-WRITE, therefore advisory
 * rather than atomic: two calls landing in the same instant could both pass it. Closing that needs a
 * partial unique index and is deferred, so nothing in the UI may present single-flight as a
 * guarantee (39-06 recorded the same caveat at the other end).
 */
export async function startDuplicateScan(
  scanId: string,
  entityType: MergeableEntityType
): Promise<StartScanResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const id = parseRecordId(scanId)
  const scannable = parseEntityType(entityType)

  if (id === null || scannable === null) {
    return { success: false, code: "INVALID" }
  }

  const userId = session.user.id

  try {
    await createScanState(id, scannable, userId)
  } catch (error) {
    if (error instanceof Error && error.message === SCAN_ALREADY_RUNNING) {
      return { success: false, code: "SCAN_RUNNING" }
    }

    // Identifiers and the entity type only, never record contents (T-37-09).
    console.error(`${LOG_PREFIX} could not create scan ${id} (${scannable}):`, error)
    return { success: false, code: "FAILED" }
  }

  // Deliberately not awaited — see the header. `runDuplicateScan` never rejects (every failure
  // lands as a terminal status on the scan row, which is what the poller renders), and the catch is
  // the belt for a future edit that changes that: an unhandled rejection in a Node container is a
  // process-level event, not a page-level one.
  void Promise.resolve(
    runWithActor({ kind: "user", userId }, () => runDuplicateScan(id, scannable))
  ).catch((error: unknown) => {
    console.error(`${LOG_PREFIX} scan ${id} (${scannable}) rejected:`, error)
  })

  // No `revalidatePath` here: the scan has produced nothing yet, and the client watches it through
  // `getScanProgress` rather than through a re-render.
  return { success: true, scanId: id }
}

/**
 * The scan's current state, for the 1s poll.
 *
 * NEVER THROWS AND NEVER 500s — `getScanState` fails closed to `null`, and a `null` scan is a legal
 * answer here rather than an error: the reaper in `scan-cleanup.ts` may have removed a stranded row,
 * and the poller must be able to stop rather than retry forever.
 *
 * A READ, BUT AN ADMIN-ONLY ONE, gated in the same order as every write below. It is also the
 * cheapest thing on this surface to poll, so the role check comes before the lookup: a non-admin
 * learns `NOT_ADMIN` after zero database reads, whatever id they send.
 */
export async function getScanProgress(scanId: string): Promise<ScanProgressResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const id = parseRecordId(scanId)

  if (id === null) {
    return { success: false, code: "INVALID" }
  }

  const scan = await getScanState(id)

  if (!scan) {
    return { success: true, scan: null }
  }

  return {
    success: true,
    scan: {
      scanId: scan.scanId,
      entityType: scan.entityType,
      status: scan.status,
      cancelled: scan.cancelled,
      current: scan.progress.current,
      total: scan.progress.total,
      percentage: calculateScanProgress(scan.progress),
      startedAt: scan.startedAt.toISOString(),
      startedByViewer: scan.userId === session.user.id,
    },
  }
}

/**
 * Cancel a running scan — ONLY the user who started it may.
 *
 * THIS COMPARISON IS THE CONTROL, AND ITS ABSENCE IS A SHIPPED BUG ELSEWHERE.
 * `cancelPipedriveImport` checks authentication and never ownership: it never compares the stored
 * userId to the caller, so any signed-in user can kill anyone's import. UI-SPEC P-6 forbids
 * inheriting that here, and `src/lib/dedup/scan-state.ts` deliberately declines to bury the check
 * inside `cancelScan` — authorization is a boundary decision, so the module exposes `userId` and
 * this is the boundary. Two users cancelling each other's half-minute jobs is a support ticket, not
 * a feature (T-39-08).
 *
 * The hidden cancel button is presentation. This is the control.
 *
 * ADMIN IS NOT ENOUGH, on purpose: an admin who did not start the scan is refused too. Every user
 * who can reach this route is an admin, so an admin exemption would make the check vacuous.
 */
export async function cancelDuplicateScan(scanId: string): Promise<CancelScanResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const id = parseRecordId(scanId)

  if (id === null) {
    return { success: false, code: "INVALID" }
  }

  const scan = await getScanState(id)

  // A missing, reaped or unreadable row names nothing cancellable. One answer for all three, so the
  // difference between them cannot be used as an existence oracle.
  if (!scan) {
    return { success: false, code: "INVALID" }
  }

  if (scan.userId !== session.user.id) {
    return { success: false, code: "NOT_STARTER" }
  }

  // Only the flag is raised. The terminal `cancelled` status is written by the scan loop when it
  // next checks between batches — setting it here would rewrite a scan that finished a moment ago
  // as cancelled, i.e. tell the user their completed scan never ran.
  await cancelScan(id)

  revalidatePath("/duplicates")

  return { success: true }
}

// ---------------------------------------------------------------------------------------
// The pair list
// ---------------------------------------------------------------------------------------

/**
 * Mark a pair as "not a duplicate".
 *
 * REVERSIBLE, AND THEREFORE UNCONFIRMED (UI-SPEC L-6): one click, a success toast, and
 * `undismissPair` behind `?dismissed=1`. A confirm dialog on a reversible action trains a user to
 * dismiss dialogs unread.
 *
 * THE TRANSITION IS SCOPED TO `open`, NOT JUST TO THE ID. `duplicate_pairs.status` has four values
 * and only two of them belong in a review queue: a pair whose records were already MERGED, or which
 * a rescan RETIRED as `superseded`, must not be rewritable into `dismissed` by a stale button in a
 * tab somebody left open. The `and(id, status)` predicate is what makes the answer `PAIR_GONE`
 * instead of a silent rewrite of history.
 *
 * ATTRIBUTION IS EXPLICIT, NOT AMBIENT. `dismissedByUserId` is taken from the session and from
 * nowhere else, which is why this write needs no `runWithActor` wrapper — the actor scope exists to
 * feed the audit subscriber on the entity tables, and `duplicate_pairs` records its own actor in its
 * own column.
 */
export async function dismissPair(pairId: string): Promise<DismissPairResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const id = parseRecordId(pairId)

  if (id === null) {
    return { success: false, code: "INVALID" }
  }

  try {
    const now = new Date()
    const updated = await db
      .update(duplicatePairs)
      .set({
        status: "dismissed",
        dismissedByUserId: session.user.id,
        dismissedAt: now,
        updatedAt: now,
      })
      .where(and(eq(duplicatePairs.id, id), eq(duplicatePairs.status, "open")))
      .returning({ id: duplicatePairs.id })

    if (updated.length === 0) {
      return { success: false, code: "PAIR_GONE" }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} could not dismiss pair ${id}:`, error)
    return { success: false, code: "FAILED" }
  }

  revalidatePath("/duplicates")

  return { success: true }
}

/**
 * Put a dismissed pair back in the review list.
 *
 * The mirror of `dismissPair`, and scoped for the same reason: only a `dismissed` row may return to
 * `open`. Without the status conjunct this action would be a way to resurrect a `merged` pair into
 * the queue, which would put a merge screen in front of an admin for two records that no longer
 * both exist.
 *
 * `dismissedByUserId` and `dismissedAt` are CLEARED rather than left behind. A row reading `open`
 * while still naming who dismissed it and when is a row two later readers will interpret two
 * different ways.
 */
export async function undismissPair(pairId: string): Promise<DismissPairResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const id = parseRecordId(pairId)

  if (id === null) {
    return { success: false, code: "INVALID" }
  }

  try {
    const updated = await db
      .update(duplicatePairs)
      .set({
        status: "open",
        dismissedByUserId: null,
        dismissedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(duplicatePairs.id, id), eq(duplicatePairs.status, "dismissed")))
      .returning({ id: duplicatePairs.id })

    if (updated.length === 0) {
      return { success: false, code: "PAIR_GONE" }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} could not undismiss pair ${id}:`, error)
    return { success: false, code: "FAILED" }
  }

  revalidatePath("/duplicates")

  return { success: true }
}

// ---------------------------------------------------------------------------------------
// The organization identity key
// ---------------------------------------------------------------------------------------

/**
 * Configure which organization custom fields act as identity keys, IN ORDER.
 *
 * THIS IS THE WRITER THAT TURNS THE ORGANIZATION CERTAIN TIER ON. `dedup.organization_identity_fields`
 * is seeded by no migration and is currently unconfigured, which is 39-08's deliberate fail-closed
 * design: without it there is no organization certain tier and no create-time warning for
 * organizations at all. It is not seeded because `customFields` is keyed by the field definition's
 * human LABEL and those labels are created per installation, so any seeded guess would be wrong
 * everywhere except the deployment it was copied from.
 *
 * ORDER IS MEANINGFUL AND IS NOT A SET. `firstSharedIdentity` consults the fields in order and stops
 * at the first one populated on both records, so entry two only decides a match when entry one is
 * absent. That is also why the cap is two rather than "a few": every extra entry is another way for
 * a weaker field to declare a *certain* match, and a false *certain* is what puts a pre-checked
 * merge in front of an admin.
 *
 * VALIDATED TWICE, DELIBERATELY. `parseIdentityFields` above returns a `code` the UI can render;
 * `writeOrgIdentityFields` re-validates with zod before touching the database and
 * `readOrgIdentityFields` validates AGAIN on every read, so an out-of-band write cannot widen the
 * certain tier (T-39-11).
 */
export async function saveOrgIdentityFields(
  fields: string[]
): Promise<SaveOrgIdentityFieldsResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return { success: false, code: "NOT_AUTHENTICATED" }
  }

  if (session.user.role !== "admin") {
    return { success: false, code: "NOT_ADMIN" }
  }

  const identityFields = parseIdentityFields(fields)

  if (identityFields === null) {
    return { success: false, code: "INVALID" }
  }

  const result = await writeOrgIdentityFields(identityFields)

  if (!result.success) {
    // The module's own message names bounds and nothing else, but it is prose, and prose does not
    // cross this boundary — the count is what the UI needs and the code is what it switches on.
    console.error(
      `${LOG_PREFIX} could not save ${identityFields.length} identity field(s): ${result.error}`
    )
    return { success: false, code: "FAILED" }
  }

  // The page reads the configured fields on render, so the next navigation must not serve a cached
  // value that disagrees with the two selects.
  revalidatePath("/duplicates")

  return { success: true }
}
