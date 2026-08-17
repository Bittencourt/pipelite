/**
 * The wiring gate for the two bulk dialogs.
 *
 * EVERY ASSERTION HERE IS COMMENT-BLIND BY CONSTRUCTION. Both sources are read through the shared
 * `readStrippedSource` helper, which removes line and block comments in a string-aware pass before
 * a single assertion runs. That is not tidiness. Most of what follows is a NEGATIVE assertion, and a
 * negative source assertion is trivially satisfied — or trivially broken — by prose: a doc comment
 * that merely names the token it forbids invalidates its own gate. Phase 37 lost nine gate runs to
 * exactly that collision, a raw-text grep matching an explanatory comment rather than code.
 *
 * THE CORRECT RESPONSE TO A COLLISION IS TO REWORD THE COMMENT, NEVER TO WEAKEN THE GATE. If an
 * assertion below starts failing because a comment mentions a forbidden idiom, change the comment.
 * Loosening the pattern, adding an exception, or deleting the assertion converts a real constraint
 * into decoration, and both of this repo's earlier source-gate analogs shipped precisely that bug.
 *
 * This repo renders NO client components in tests: there is no jsdom, no happy-dom and no testing
 * library, and adding one is a dependency decision belonging to a phase willing to own it. So the
 * decisions in these two files that have no pure-function home — the client boundary, the absent
 * trigger, the retention two-branch copy, the in-flight spinner, the label/id pairing, the no-email
 * notice, the absent unassign item — are pinned here at the source level, and the rendered result is
 * verified by this phase's browser UAT.
 *
 * Three anti-vacuity requirements, all met below, because a gate without them is a string that
 * happens to be absent:
 *
 *   1. Prove the files were found and read — a helper that silently returned "" would pass every
 *      negative assertion in this file perfectly. Hence the non-empty assertions FIRST.
 *   2. Prove they are the RIGHT files, by asserting a known POSITIVE marker in each before any
 *      negative. If the confirmation moves out of the alert primitive, or the owner list stops
 *      being a Select, this gate must go RED and be reconsidered rather than keep passing over a
 *      file that no longer contains the thing it claims to check.
 *   3. A gate for the gate: two vocabulary tables, one pinning what must be PRESENT and one pinning
 *      what must be LEFT ALONE, each iterated, so a newly introduced idiom cannot sail through
 *      unasserted.
 */
import { describe, expect, it } from "vitest"

import { readStrippedSource } from "@/components/custom-fields/__tests__/source-scan"

const DELETE_DIALOG = readStrippedSource("src/components/bulk/bulk-delete-dialog.tsx")
const REASSIGN_DIALOG = readStrippedSource("src/components/bulk/bulk-reassign-dialog.tsx")

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

/** Reaching for a shared generic label is how a bare "Confirm" button gets shipped. */
const SHARED_LABEL_KEYS = /tCommon|common\.(cancel|delete|confirm|save)/

/** The first non-comment token of a client module. */
const CLIENT_DIRECTIVE = /^\s*(['"])use client\1/

/** A numeric fallback for the retention window, in either of its two spellings. */
const NUMERIC_DEFAULT = /\?\?\s*\d|\|\|\s*\d/

/**
 * VOCABULARY TABLE 1 — RECOGNISED. What this gate requires to be PRESENT in each file. Every entry
 * is a decision with no pure-function home, so its only proof is that it is still written down.
 */
const RECOGNISED: Record<string, { source: string; tokens: string[] }> = {
  "bulk-delete-dialog.tsx": {
    source: DELETE_DIALOG,
    tokens: [
      "AlertDialogContent",
      'useTranslations("bulk")',
      "retentionDays === null",
      "descriptionNoRetention",
      "event.preventDefault()",
      "animate-spin",
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ],
  },
  "bulk-reassign-dialog.tsx": {
    source: REASSIGN_DIALOG,
    tokens: [
      "SelectContent",
      'useTranslations("bulk")',
      'htmlFor="bulk-owner"',
      'id="bulk-owner"',
      "noEmailNotice",
      'variant="default"',
      "animate-spin",
    ],
  },
}

/**
 * VOCABULARY TABLE 2 — LEFT ALONE. What must be ABSENT from BOTH files. Each entry is an idiom that
 * would silently break something: a trigger reintroduces the asChild slot the RSC boundary forbids,
 * an unassign item makes records unreachable, a server-only import breaks the build at the boundary,
 * and the two record pickers cannot address users at all.
 */
const LEFT_ALONE = [
  "AlertDialogTrigger",
  "DialogTrigger",
  'value="none"',
  "entity-combobox",
  "assignee-picker",
  "readTrashRetentionDays",
  "@/lib/bulk/dispatch",
  "@/lib/trash/dispatch",
]

const BOTH: [string, string][] = [
  ["bulk-delete-dialog.tsx", DELETE_DIALOG],
  ["bulk-reassign-dialog.tsx", REASSIGN_DIALOG],
]

// ANTI-VACUITY 1 AND 2. These run before every negative assertion in this file, deliberately.
describe("the gate reads the right two files", () => {
  it("read both dialog sources", () => {
    for (const [name, source] of BOTH) {
      expect(
        source.length,
        `${name} must have been read: a helper returning an empty string would satisfy every negative assertion in this file perfectly`
      ).toBeGreaterThan(0)
    }
  })

  it("found the confirmation inside the alert primitive", () => {
    expect(
      DELETE_DIALOG,
      "bulk-delete-dialog.tsx must render AlertDialogContent. If the confirmation moves to another primitive this gate must go red and be reconsidered, not keep passing over a file that no longer confirms anything"
    ).toContain("AlertDialogContent")
  })

  it("found the owner list inside the vendored Select", () => {
    expect(
      REASSIGN_DIALOG,
      "bulk-reassign-dialog.tsx must render SelectContent. The vendored Select is the locked resolution of the picker deviation; if the owner list moves, this gate must go red rather than keep asserting rules about a control that is gone"
    ).toContain("SelectContent")
  })
})

describe("both dialogs sit on the client side of the RSC boundary", () => {
  it("opens each file with the 'use client' directive", () => {
    for (const [name, source] of BOTH) {
      expect(
        CLIENT_DIRECTIVE.test(source),
        `${name} must open with the 'use client' directive: a server module handing children to a Radix asChild slot renders nothing at all, silently (CFUI-01), and a repo-wide scan fails the build on it`
      ).toBe(true)
    }
  })

  it("gives neither dialog a trigger component of its own", () => {
    for (const [name, source] of BOTH) {
      expect(
        source.includes("AlertDialogTrigger") || source.includes("DialogTrigger"),
        `${name} must be controlled through open/onOpenChange. A trigger reintroduces the asChild slot this phase is required to keep off the RSC boundary, and the caller already owns the open state`
      ).toBe(false)
    }
  })
})

describe("bulk-delete-dialog.tsx never lies about the retention window", () => {
  it("selects between two strings on a strict null check", () => {
    expect(
      DELETE_DIALOG,
      "the description must branch on `retentionDays === null`. A loose check would treat 0 as absent, and 0 is not a value the reader can produce"
    ).toContain("retentionDays === null")

    expect(
      DELETE_DIALOG,
      "the null branch must render deleteDialog.descriptionNoRetention — a DIFFERENT sentence, because in that state nothing is purged automatically at all"
    ).toContain("descriptionNoRetention")
  })

  it("contains no numeric default for the window", () => {
    expect(
      NUMERIC_DEFAULT.test(DELETE_DIALOG),
      "no `?? <number>` and no `|| <number>` may appear in this file. Phase 37's rule is default in data, fail closed in code: the settings reader deliberately has no code-level fallback, so a numeric default here would make the dialog promise a window the deployment does not have"
    ).toBe(false)
  })

  it("stays open with a spinner while the request is in flight", () => {
    expect(
      DELETE_DIALOG,
      "the confirm handler must prevent the default click, or Radix closes the dialog mid-request and the spinner and the disabled Keep-records button are never seen"
    ).toContain("event.preventDefault()")

    expect(
      DELETE_DIALOG,
      "the in-flight confirm must render a spinning Loader2, which is the only signal that a hundred writes are running"
    ).toContain("animate-spin")
  })

  it("reuses the destructive confirm class string the repo already ships", () => {
    expect(
      DELETE_DIALOG,
      "the confirm must carry the same filled-destructive class string as the six existing delete dialogs, so this one does not become a seventh variant"
    ).toContain("bg-destructive text-destructive-foreground hover:bg-destructive/90")
  })
})

describe("bulk-reassign-dialog.tsx names its field and its silence", () => {
  it("pairs a real visible label to the Select trigger by id", () => {
    expect(
      REASSIGN_DIALOG,
      "the owner field needs a Label whose htmlFor is bulk-owner: a placeholder is never an accessible name"
    ).toContain('htmlFor="bulk-owner"')

    expect(
      REASSIGN_DIALOG,
      "the SelectTrigger must carry the matching id. The owner Select this composition is modelled on puts htmlFor on a trigger with no id, so the pairing resolves to nothing — that is the one part of the analog not to copy"
    ).toContain('id="bulk-owner"')
  })

  it("states in writing that the new owner is not emailed", () => {
    expect(
      REASSIGN_DIALOG,
      "reassignDialog.noEmailNotice is required copy. The single-record reassign path DOES email a new assignee, so a user trained by the rest of the product would expect a notification here and bulk sends none — silence would be an implied promise"
    ).toContain("noEmailNotice")
  })

  it("offers no unassign item", () => {
    expect(
      REASSIGN_DIALOG.includes('value="none"'),
      'a SelectItem value="none" must not exist: owner_id is NOT NULL on all four tables and ownerId is how every list scopes visibility, so a bulk unassign would make up to a hundred records unreachable from the surface the user is standing on'
    ).toBe(false)
  })

  it("is a form dialog, not a yes-or-no confirmation", () => {
    expect(
      REASSIGN_DIALOG.includes("AlertDialog"),
      "this surface must use Dialog. The alert variant is for a decision the user must answer; this is a form with a required choice, and reassignment is fully reversible with an audit row per record"
    ).toBe(false)
  })

  it("disables confirm until an owner is chosen", () => {
    expect(
      REASSIGN_DIALOG,
      "the confirm button's disabled expression must include a falsy check on the chosen owner id, or an empty selection is submittable and writes an empty ownerId to a NOT NULL column"
    ).toContain("!ownerId")
  })

  it("keys the reset on the open transition and never on the owners array", () => {
    expect(
      REASSIGN_DIALOG,
      "the choice must be discarded when `open` goes false, so a cancelled pick is not still there on the next open"
    ).toContain("wasOpen !== open")

    expect(
      REASSIGN_DIALOG.includes("[owners]") || REASSIGN_DIALOG.includes("owners,\n  ]"),
      "the reset must NOT be keyed on the owners prop. Phase 35 measured that revalidatePath re-renders the current client tree regardless of the path argument, so a reset keyed on a server-rebuilt prop can fire mid-submit and clear the choice out from under a running request"
    ).toBe(false)
  })
})

describe("neither dialog reaches for a generic label or an off-token colour", () => {
  it("gives every button a label that names its object", () => {
    for (const [name, source] of BOTH) {
      for (const label of BARE_LABELS) {
        expect(
          source.includes(label),
          `a bare ${label.slice(1, -1)} button is forbidden in ${name}: every control on these surfaces names its object and its count`
        ).toBe(false)
      }
    }
  })

  it("uses none of the shared generic label keys", () => {
    for (const [name, source] of BOTH) {
      expect(
        SHARED_LABEL_KEYS.test(source),
        `${name} must not reuse common.cancel / common.delete / common.confirm / common.save. The copy rule forbids a bare Cancel, Delete or Confirm in these surfaces, and reaching for the shared namespace is exactly how such a button gets shipped`
      ).toBe(false)
    }
  })

  it("expresses colour through the design tokens only", () => {
    for (const [name, source] of BOTH) {
      for (const token of FORBIDDEN_COLOURS) {
        expect(
          source.includes(token),
          `${name} must express colour through the design tokens; "${token}" bypasses them and breaks dark mode`
        ).toBe(false)
      }

      expect(
        HEX_LITERAL.test(source),
        `${name} must contain no raw hex colour: every colour on these surfaces is a CSS variable so both themes are covered`
      ).toBe(false)
    }
  })
})

describe("neither dialog pulls a server-only module across the boundary", () => {
  it("imports no bulk or trash dispatch module and reads no setting itself", () => {
    for (const [name, source] of BOTH) {
      expect(
        source.includes("@/lib/bulk/dispatch") || source.includes("@/lib/trash/dispatch"),
        `${name} must not import a dispatch module: both are server-only, and importing one from a client module breaks the build at the boundary`
      ).toBe(false)

      expect(
        source.includes("readTrashRetentionDays"),
        `${name} must not read trash settings itself. retentionDays arrives as a plain serializable prop from the server page; a client-side read would be a database call from the browser`
      ).toBe(false)
    }
  })
})

// ANTI-VACUITY 3. Both vocabulary tables, iterated, so a new idiom cannot sail through unasserted.
describe("the gate's own vocabulary", () => {
  it("finds every RECOGNISED token in the file that must contain it", () => {
    for (const [name, entry] of Object.entries(RECOGNISED)) {
      for (const token of entry.tokens) {
        expect(
          entry.source,
          `${name} must still contain "${token}". This table is the list of decisions with no pure-function home; a missing entry means the decision was edited out silently`
        ).toContain(token)
      }
    }
  })

  it("finds no LEFT-ALONE token in either file", () => {
    for (const [name, source] of BOTH) {
      for (const token of LEFT_ALONE) {
        expect(
          source.includes(token),
          `${name} must not contain "${token}". Every entry in this table would break something silently rather than loudly, which is why it is asserted by iteration rather than one test per token`
        ).toBe(false)
      }
    }
  })
})
