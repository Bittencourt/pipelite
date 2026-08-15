import { z } from "zod"

import type { TimelineCursor } from "./types"

/**
 * Opaque keyset paging cursor for the record timeline.
 *
 * The wire format is base64url(JSON) of `{ t: <ISO-8601 instant>, i: <row id> }`.
 * Short keys keep the blob small; the encoding keeps it URL-safe and unpadded so it
 * can ride in a query string or a server-action argument untouched.
 *
 * `t` IS CARRIED AS TEXT AND IS NEVER PARSED INTO A `Date` HERE.
 * Postgres renders it with `to_char` at microsecond precision and Postgres parses it back
 * with `::timestamp`; this module only moves the bytes. Introducing a `new Date(t)` on
 * this path would truncate microseconds to milliseconds, which lowers the keyset bound
 * below the cursor row's real instant and permanently hides every entry inside that
 * millisecond from paging — see the `TimelineCursor` doc comment in ./types.
 *
 * SECURITY (T-35-02): the value returned by `decodeCursor` becomes a SQL BIND
 * parameter in the timeline assembler (plan 35-08). The pipeline is
 * decode -> zod safeParse -> bind. Nothing decoded here may ever be interpolated
 * textually into SQL.
 *
 * SECURITY (T-35-20): `decodeCursor` has zero raise statements. A malformed, truncated or
 * attacker-crafted cursor returns `null`, which callers treat as "page 1" — a hostile
 * cursor degrades to the first page, never to a 500.
 */

/**
 * Hard ceiling on the wire value, checked BEFORE any decode (T-35-19). A legitimate
 * cursor is ~62 characters; 512 leaves generous headroom while making a multi-megabyte
 * payload unparseable rather than merely slow.
 */
const MAX_CURSOR_LENGTH = 512

/** base64url alphabet, unpadded. Anything else is not a cursor we produced. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

const cursorPayloadSchema = z.object({
  // z.iso.datetime() is regex-validated (zod 4): it refuses 'yesterday',
  // '2026-13-45T99:99:99Z' and any string carrying a SQL fragment. It accepts an
  // arbitrary-length fractional-second part, which is what lets the six-digit
  // microsecond rendering through unchanged, and it requires a literal `Z` rather than a
  // numeric offset — so the only thing `::timestamp` ever has to discard is the `Z`.
  t: z.iso.datetime(),
  // Bound parameter downstream, but still constrained here: non-empty so it cannot
  // silently match nothing, and capped so an oversized id cannot be smuggled through.
  i: z.string().min(1).max(128),
})

/**
 * Encode a keyset position into an opaque, URL-safe string.
 *
 * The instant goes on the wire exactly as Postgres rendered it — microseconds included —
 * because that full precision is what preserves the ordering guarantee: `id` only breaks
 * ties between BIT-IDENTICAL instants, so a bound rounded off anywhere short of the
 * column's precision skips rows instead of tie-breaking them.
 */
export function encodeCursor(cursor: TimelineCursor): string {
  const json = JSON.stringify({
    t: cursor.instant,
    i: cursor.id,
  })

  return Buffer.from(json, "utf8").toString("base64url")
}

/**
 * Decode a cursor produced by {@link encodeCursor}.
 *
 * @returns the validated position, or `null` for absent input (page 1) AND for every
 * malformed or hostile input. Never throws.
 */
export function decodeCursor(
  raw: string | null | undefined
): TimelineCursor | null {
  // Absent input: the caller is asking for page 1.
  if (raw === null || raw === undefined || raw === "") return null

  // Defence-in-depth guards that run before any allocation-heavy work (T-35-19).
  if (typeof raw !== "string") return null
  if (raw.length > MAX_CURSOR_LENGTH) return null
  if (!BASE64URL_PATTERN.test(raw)) return null

  let parsed: unknown
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    parsed = JSON.parse(json)
  } catch {
    // Undecodable bytes or invalid JSON — degrade to page 1.
    return null
  }

  const result = cursorPayloadSchema.safeParse(parsed)
  if (!result.success) return null

  // Handed back verbatim. There is deliberately no `new Date(result.data.t)` sanity parse
  // here: a `Date` cannot represent the value's precision, so constructing one would
  // either have to be discarded immediately or would silently become the truncated bound
  // this module exists to avoid. The zod schema above is the validation.
  return { instant: result.data.t, id: result.data.i }
}
