import { describe, it, expect } from "vitest"

import { encodeCursor, decodeCursor } from "./cursor"

/** base64url-encode an arbitrary string the way a caller (or an attacker) would. */
function b64url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url")
}

/**
 * Every input that must be refused. Each is exercised individually below AND
 * collectively by the "never throws" test — a hostile cursor degrades to page 1,
 * never to a 500 (T-35-20).
 */
const HOSTILE_INPUTS: string[] = [
  "not a cursor!!",
  "%%%",
  "\u0000",
  " ",
  "../../etc/passwd",
  b64url("just some plain text"),
  b64url("{"),
  b64url("42"),
  b64url("null"),
  b64url('["t","i"]'),
  b64url('{"t":"2026-08-15T12:34:56.789Z"}'),
  b64url('{"i":"abc-123"}'),
  b64url('{"t":"yesterday","i":"x"}'),
  b64url('{"t":"2026-13-45T99:99:99Z","i":"x"}'),
  b64url('{"t":"2026-01-01T00:00:00.000Z\' OR 1=1--","i":"x\' OR \'1\'=\'1"}'),
  b64url(`{"t":"2026-08-15T12:34:56.789Z","i":"${"a".repeat(200)}"}`),
  b64url(`{"t":"2026-08-15T12:34:56.789Z","i":"${"a".repeat(500_000)}"}`),
  "A".repeat(1_000_000),
]

describe("timeline cursor codec", () => {
  describe("round trip", () => {
    it("round-trips a cursor exactly", () => {
      const instant = "2026-08-15T12:34:56.789Z"
      const decoded = decodeCursor(encodeCursor({ instant, id: "abc-123" }))

      expect(decoded).not.toBeNull()
      expect(decoded!.instant).toBe(instant)
      expect(decoded!.id).toBe("abc-123")
    })

    it("round-trips a MICROSECOND instant byte for byte", () => {
      // WR-02 REGRESSION. `created_at` defaults to now(), which yields microseconds
      // (`2026-08-15 21:33:08.478940` on the live database). The previous codec stored a
      // JS `Date`, which is millisecond-only, so `.478940` left here as `.478` — a bound
      // strictly BELOW the cursor row's real instant. `(created_at, id) < (bound, id)`
      // then never reaches the `id` tiebreaker and every entry inside that millisecond
      // becomes permanently unreachable by paging, with `hasMore` still true.
      //
      // Any reintroduction of `new Date(...)` on this path fails right here: the six-digit
      // fractional part cannot survive one.
      const instant = "2026-08-15T21:33:08.478940Z"
      const decoded = decodeCursor(encodeCursor({ instant, id: "note-19" }))

      expect(decoded).not.toBeNull()
      expect(decoded!.instant).toBe(instant)
      expect(decoded!.instant).toContain(".478940")
      expect(decoded!.instant).not.toBe("2026-08-15T21:33:08.478Z")
    })

    it("round-trips a cursor whose timestamp has a zero sub-second component", () => {
      const instant = "2026-01-01T00:00:00.000000Z"
      const decoded = decodeCursor(encodeCursor({ instant, id: "z" }))

      expect(decoded!.instant).toBe(instant)
      expect(decoded!.id).toBe("z")
    })

    it("produces a URL-safe opaque string", () => {
      const encoded = encodeCursor({
        instant: "2026-08-15T12:34:56.789Z",
        id: "abc-123",
      })

      // base64url alphabet only: no '+', no '/', no '=' padding.
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(encoded).not.toContain("+")
      expect(encoded).not.toContain("/")
      expect(encoded).not.toContain("=")

      // Opaque: neither the row id nor the timestamp is readable in the wire value.
      expect(encoded).not.toContain("abc-123")
      expect(encoded).not.toContain("2026-08-15T12:34:56.789Z")
      expect(encoded).not.toContain("2026-08-15")
    })
  })

  describe("absent input", () => {
    it("returns null for null, undefined and empty string", () => {
      expect(decodeCursor(null)).toBeNull()
      expect(decodeCursor(undefined)).toBeNull()
      expect(decodeCursor("")).toBeNull()
    })
  })

  describe("cursor rejection", () => {
    it("rejects a non-base64url string", () => {
      expect(decodeCursor("not a cursor!!")).toBeNull()
      expect(decodeCursor("%%%")).toBeNull()
    })

    it("rejects valid base64url that is not JSON", () => {
      expect(decodeCursor(b64url("just some plain text"))).toBeNull()
      expect(decodeCursor(b64url("{"))).toBeNull()
    })

    it("rejects valid JSON that is not an object", () => {
      expect(decodeCursor(b64url("42"))).toBeNull()
      expect(decodeCursor(b64url("null"))).toBeNull()
      expect(decodeCursor(b64url('["t","i"]'))).toBeNull()
    })

    it("rejects JSON missing the id field", () => {
      expect(decodeCursor(b64url('{"t":"2026-08-15T12:34:56.789Z"}'))).toBeNull()
      expect(decodeCursor(b64url('{"t":"2026-08-15T12:34:56.789Z","i":""}'))).toBeNull()
    })

    it("rejects JSON missing the instant field", () => {
      expect(decodeCursor(b64url('{"i":"abc-123"}'))).toBeNull()
    })

    it("rejects a non-timestamp instant", () => {
      expect(decodeCursor(b64url('{"t":"yesterday","i":"x"}'))).toBeNull()
      expect(decodeCursor(b64url('{"t":"2026-13-45T99:99:99Z","i":"x"}'))).toBeNull()
      expect(decodeCursor(b64url('{"t":1755261296789,"i":"x"}'))).toBeNull()
    })

    it("rejects a SQL-injection payload in either field", () => {
      // The timestamp is refused outright: it is not a valid ISO-8601 instant.
      const injected = b64url(
        '{"t":"2026-01-01T00:00:00.000Z\' OR 1=1--","i":"x\' OR \'1\'=\'1"}'
      )
      expect(decodeCursor(injected)).toBeNull()

      // `id` is a bound parameter downstream (plan 35-08 never interpolates it), but it
      // is still constrained: non-empty and length-bounded, so a megabyte-long id
      // cannot be smuggled through the codec.
      const oversizedId = b64url(
        `{"t":"2026-08-15T12:34:56.789Z","i":"${"a".repeat(200)}"}`
      )
      expect(decodeCursor(oversizedId)).toBeNull()
    })

    it("rejects an oversized cursor before decoding it", () => {
      expect(decodeCursor("A".repeat(1_000_000))).toBeNull()
      expect(
        decodeCursor(
          b64url(`{"t":"2026-08-15T12:34:56.789Z","i":"${"a".repeat(500_000)}"}`)
        )
      ).toBeNull()
    })

    it("returns null (never undefined) on every rejection path", () => {
      for (const input of HOSTILE_INPUTS) {
        expect(decodeCursor(input)).toBe(null)
      }
    })
  })

  describe("failure mode", () => {
    it("never throws on hostile input", () => {
      for (const input of HOSTILE_INPUTS) {
        expect(() => decodeCursor(input)).not.toThrow()
      }
      expect(() => decodeCursor(null)).not.toThrow()
      expect(() => decodeCursor(undefined)).not.toThrow()
      expect(() => decodeCursor("")).not.toThrow()
    })
  })
})
