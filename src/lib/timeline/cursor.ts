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
 * cursor degrades to the first page, never to a 500. That guarantee covers the whole
 * pipeline, not just this function: a value this module returns is bound into a timestamp
 * cast downstream, so anything Postgres cannot represent has to be rejected HERE or the
 * error simply moves from decode time to query time. See the range gate below (WR-11).
 */

/**
 * Hard ceiling on the wire value, checked BEFORE any decode (T-35-19). A legitimate
 * cursor is ~62 characters; 512 leaves generous headroom while making a multi-megabyte
 * payload unparseable rather than merely slow.
 */
const MAX_CURSOR_LENGTH = 512

/** base64url alphabet, unpadded. Anything else is not a cursor we produced. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Range gate on the cursor instant, in the fixed-width text form the cursor already
 * sorts by (WR-11).
 *
 * `z.iso.datetime()` validates the calendar — it rejects month 13, day 32, and even
 * 2026-02-29 in a non-leap year — but it accepts ANY syntactically valid four-digit
 * year, including year zero. Postgres has no year zero, so a cursor of
 * `0000-01-01T00:00:00Z` survives every check in this module and then makes
 * `${instant}::text::timestamp` raise `date/time field value out of range` inside the
 * timeline query. That is an attacker-steerable database error reached through a
 * well-formed cursor, on the exact path the T-35-20 note above documents as degrading to
 * page 1. Gating it HERE, where the rest of the cursor validation already lives, is what
 * makes that claim true rather than nearly true.
 *
 * Verified against the live database: `'0000-01-01T00:00:00Z'::text::timestamp` raises;
 * `'0001-01-01T00:00:00Z'` and `'9999-12-31T23:59:59.999999Z'` are both accepted. So
 * Postgres's own floor is lower than this one — 1970 is chosen because nothing this
 * application writes predates the epoch and a cursor that claims otherwise is hostile,
 * not merely old.
 *
 * Comparing as strings is sound for the same reason the cursor sorts as a string at all:
 * `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` is fixed width and zero padded. The two
 * bounds carry a six-digit fraction so they order correctly against both the padded form
 * this module produces and the fraction-less form `z.iso.datetime()` also admits (`'Z'`
 * sorts after `'.'`, so `1970-01-01T00:00:00Z` is inside the range, as it must be).
 */
const MIN_CURSOR_INSTANT = "1970-01-01T00:00:00.000000Z"
const MAX_CURSOR_INSTANT = "9999-12-31T23:59:59.999999Z"

const cursorPayloadSchema = z.object({
  // z.iso.datetime() is regex-validated (zod 4): it refuses 'yesterday',
  // '2026-13-45T99:99:99Z' and any string carrying a SQL fragment. It accepts an
  // arbitrary-length fractional-second part, which is what lets the six-digit
  // microsecond rendering through unchanged, and it requires a literal `Z` rather than a
  // numeric offset — so the only thing `::timestamp` ever has to discard is the `Z`.
  // The refine adds the one thing its regex does not check: that the year is in a range
  // Postgres can actually represent. See MIN_CURSOR_INSTANT above.
  t: z.iso
    .datetime()
    .refine(
      (value) => value >= MIN_CURSOR_INSTANT && value <= MAX_CURSOR_INSTANT,
      { message: "instant outside the representable cursor range" }
    ),
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
