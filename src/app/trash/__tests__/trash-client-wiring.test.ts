/**
 * The wiring gate for `/trash`'s two client leaves.
 *
 * THIS REPO DOES NOT RENDER CLIENT COMPONENTS IN TESTS, and this phase must not be the one that
 * changes that: rendering a `'use client'` component needs jsdom plus a testing library, neither
 * of which is installed, and adding them is a dependency decision that belongs to a phase willing
 * to own it (Phase 44 recorded the same constraint). So the behaviour these two files depend on
 * is unit-tested where it actually lives — `src/lib/trash/present.ts` (100 tests) and
 * `src/lib/trash/entity-types.ts` — and this file exists to prove the components CALL them, and
 * that the handful of decisions with no pure-function home (the hidden purge control, the
 * controlled dialog, the two failure sentences) survive the next edit.
 *
 * Every assertion runs against COMMENT-STRIPPED source, via the shared helper. That is not
 * tidiness: most of what follows is a negative assertion, and a negative source assertion is
 * trivially satisfied — or trivially broken — by prose. Phase 35 recorded a doc comment that
 * NAMED a token gated at zero occurrences and thereby invalidated its own gate; stripping first
 * is what makes these honest, and it is why the helper is shared rather than re-written here.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const TABLE = readStrippedSource("src/app/trash/trash-table.tsx")
const COLUMNS = readStrippedSource("src/app/trash/trash-columns.tsx")

/** Every colour the UI contract forbids on these surfaces, plus any raw hex literal. */
const FORBIDDEN_COLOURS = [
  "text-red-",
  "text-green-",
  "bg-red-",
  "bg-green-",
  "bg-white",
  "text-black",
]
const HEX_LITERAL = /#[0-9a-fA-F]{3,6}/

/** A button that does not name its object, per the copy contract. */
const BARE_LABELS = [">Save<", ">Cancel<", ">Confirm<", ">OK<", ">Yes<", ">Apply<"]

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

describe("trash-table.tsx wiring", () => {
  it("is a client module, so its dialog never crosses the RSC boundary (CFUI-01)", () => {
    expect(
      CLIENT_DIRECTIVE.test(TABLE),
      "trash-table.tsx must open with the 'use client' directive: it owns an AlertDialog, and a server module handing children to a Radix asChild slot renders nothing at all, silently"
    ).toBe(true)
  })

  it("restores a single record through the server action", () => {
    expect(
      TABLE,
      "the Restore row action must call restoreRecord from ./actions — the action is where the owner-or-admin check lives, and a client-side restore has no gate at all"
    ).toContain("restoreRecord")
  })

  it("restores a record together with its trashed parents", () => {
    expect(
      TABLE,
      "the Restore-with-linked row action must call restoreWithLinked, which re-derives the parent set server-side; a client-supplied list of records to restore is a client-supplied list of records to write"
    ).toContain("restoreWithLinked")
  })

  it("purges a record through the server action", () => {
    expect(
      TABLE,
      "the purge confirmation must call purgeRecord, whose admin gate runs before any lookup so a non-admin cannot use it as an existence oracle"
    ).toContain("purgeRecord")
  })

  it("runs every write inside a transition", () => {
    expect(
      TABLE,
      "each action must run inside startTransition so the in-flight row can disable itself and the confirm button can show a spinner"
    ).toContain("startTransition")
  })

  it("owns a controlled AlertDialog with no trigger component of its own", () => {
    expect(
      TABLE,
      "the purge confirmation must be an AlertDialog — focus trap, ESC and focus restoration come from Radix"
    ).toContain("AlertDialog")

    expect(
      TABLE.match(/AlertDialogTrigger/g),
      "the dialog must be controlled through open/onOpenChange; an AlertDialogTrigger reintroduces the asChild slot this phase is required to keep off the RSC boundary"
    ).toBeNull()
  })

  it("keeps the dialog open while the purge request is in flight", () => {
    expect(
      TABLE,
      "the confirm handler must call event.preventDefault() first, or Radix closes the dialog mid-request and the spinner and disabled Cancel are never seen"
    ).toContain("event.preventDefault()")
  })

  it("tells an already-purged record apart from a generic failure", () => {
    expect(
      TABLE,
      "the restore failure path must branch on the NOT_IN_TRASH code rather than on prose"
    ).toContain("NOT_IN_TRASH")

    expect(
      TABLE,
      "NOT_IN_TRASH must map to error.alreadyPurged: a user told to 'try again' about a record that no longer exists will try again forever"
    ).toContain("alreadyPurged")
  })

  it("names the admin-only refusal on the purge path", () => {
    expect(
      TABLE,
      "a NOT_ADMIN purge result must map to error.purgeNotPermitted — the control is hidden, not disabled, so the action is still reachable by POST"
    ).toContain("purgeNotPermitted")
  })

  it("renders the purge control conditionally rather than disabling it", () => {
    expect(
      TABLE,
      "the Delete permanently button must be gated on the isAdmin prop; a permanently disabled destructive button is furniture and invites 'how do I enable this?'"
    ).toContain("isAdmin")
  })

  it("wires up no keyboard shortcuts that have no meaning on a trashed record", () => {
    expect(
      TABLE.match(/useDataTableKeyboard/g),
      "the shared list-table keyboard hook must not be used here: its open/edit/create contract would give the user shortcuts that either do nothing or navigate to a 404"
    ).toBeNull()
  })

  it("uses no colour outside the token set", () => {
    for (const token of FORBIDDEN_COLOURS) {
      expect(
        TABLE.includes(token),
        `trash-table.tsx must express colour through the design tokens only; "${token}" bypasses them and breaks dark mode`
      ).toBe(false)
    }

    expect(
      HEX_LITERAL.test(TABLE),
      "trash-table.tsx must contain no raw hex colour: every colour on this surface is a CSS variable so both themes are covered"
    ).toBe(false)
  })

  it("gives every button a label that names its object", () => {
    for (const label of BARE_LABELS) {
      expect(
        TABLE.includes(label),
        `a bare ${label.slice(1, -1)} button is forbidden on this surface, including inside the confirmation dialog — every control must name what it does`
      ).toBe(false)
    }
  })
})

describe("trash-columns.tsx wiring", () => {
  it("is a client module", () => {
    expect(
      CLIENT_DIRECTIVE.test(COLUMNS),
      "trash-columns.tsx must open with the 'use client' directive: it calls useTranslations and useFormatter and is consumed by a client table"
    ).toBe(true)
  })

  it("renders every one of the seven deleted-by presentations", () => {
    const kinds = [
      "user",
      "unknownUser",
      "workflowRun",
      "apiKey",
      "import",
      "system",
      "notRecorded",
    ]

    for (const kind of kinds) {
      expect(
        COLUMNS,
        `the deleted-by cell must handle the "${kind}" presentation; an unhandled kind is a blank cell where SC-1 requires the actor`
      ).toContain(`case "${kind}":`)
    }
  })

  it("keeps 'Not recorded' and 'Unknown user' as two different sentences", () => {
    expect(
      COLUMNS,
      "the cell must render trash.actor.notRecorded when no audit row exists — that is 100% of the current live dataset"
    ).toContain("notRecorded")

    expect(
      COLUMNS,
      "the cell must render audit.unknownActor for a user whose row is gone. Collapsing the two claims a user acted when nobody recorded that anyone did (T-37-REP2)"
    ).toContain("unknownActor")
  })

  it("lets a long record name wrap so the linked-in-trash badge can sit beneath it", () => {
    expect(
      COLUMNS,
      "the record cell must override TableCell's default whitespace-nowrap; without whitespace-normal a 120-character title pushes the badge off the row"
    ).toContain("whitespace-normal")
  })

  it("prints no api-key name", () => {
    expect(
      COLUMNS.match(/apiKeyName/g),
      "the api_key badge must carry the kind label only: audit_log holds no key reference, and resolving one through the key's owner would print an arbitrary key as fact (T-37-09)"
    ).toBeNull()
  })

  it("uses no colour outside the token set", () => {
    for (const token of FORBIDDEN_COLOURS) {
      expect(
        COLUMNS.includes(token),
        `trash-columns.tsx must express colour through the design tokens only; "${token}" bypasses them. A trashed record is not an error and must never be rendered in red`
      ).toBe(false)
    }

    expect(
      HEX_LITERAL.test(COLUMNS),
      "trash-columns.tsx must contain no raw hex colour"
    ).toBe(false)
  })
})
