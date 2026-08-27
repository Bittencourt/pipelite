---
phase: 50-export-authorization
plan: 02
subsystem: i18n / export-refusal-copy
tags: [SEC-03, SC-3, locale-contract, copy, use-intl]
requires:
  - "src/messages/locale-parity.test.ts REQUIRED_VIEWS_KEYS (the exact-toEqual views contract)"
  - "use-intl (already a production dependency; no package installed by this plan)"
provides:
  - "views.export.tooBroad in en-US, pt-BR and es-ES, carrying {matched} and {total}"
  - "REQUIRED_VIEWS_KEYS at 62, both hard counts moved, group tally 18+22+13+5+4"
  - "src/messages/export-too-broad-copy.test.ts — the behavioural resolution proof (12 cells)"
affects:
  - "50-05 (client wiring: the toast branch and EXPORT_KEYS — this plan deliberately did NOT touch them)"
  - "50-08 (sign-off: carries the count-oracle trade and the no-render limitation)"
tech-stack:
  added: []
  patterns:
    - "createTranslator from use-intl/core over readFileSync'd locale JSON (mirrors src/lib/email/i18n.ts:18)"
    - "a sibling *.test.ts in src/messages/ rather than a one-file __tests__/ directory"
key-files:
  created:
    - src/messages/export-too-broad-copy.test.ts
  modified:
    - src/messages/en-US.json
    - src/messages/pt-BR.json
    - src/messages/es-ES.json
    - src/messages/locale-parity.test.ts
decisions:
  - "The copy keeps SIMPLE ICU arguments ({matched}, not {matched, number}); the typed form is invisible to placeholderDrift's regex and would silently drop the key from that gate"
  - "views.export.disabledReason left byte-identical — Phase 40's G-2 reword (303418b) is not regressed"
  - "EXPORT_KEYS in saved-views-bar-wiring.test.ts NOT touched — 50-05 owns it, in the same commit as the toast branch"
metrics:
  duration: ~20 min
  completed: 2026-08-27
  tasks: 2
  commits: 2
  tests_added: 12
---

# Phase 50 Plan 02: The SC-3 Refusal Copy, in Three Locales — Summary

`views.export.tooBroad` ships in en-US, pt-BR and es-ES naming both server-measured counts, the
62-key views contract moved in one commit with every half-state observed red first, and a 12-cell
proof resolves the sentence through the real `use-intl` — which also **refuted the plan's central
premise about number formatting**, measured both ways.

---

## THE HEADLINE FINDING: the plan's trap was the inverse of what the plan said

The plan, `50-RESEARCH.md` §6 and the task brief all state that `use-intl` locale-formats a numeric
ICU argument, so that `44254` renders as `44,254` in en-US and `44.254` in pt-BR, and therefore that
`toContain("44254")` **fails** against correct code. **Measured in-session, that is backwards.**

```
createTranslator({ locale: "en-US", messages, namespace: "views" })
  ("export.tooBroad", { matched: 44254, total: 46054 })
=> "This filter matches 44254 of 46054 records — too many to export. Narrow it and try again."
```

The numbers come out **bare, with no grouping separator, in all three locales**. The cause is ICU
argument types, confirmed both ways:

| ICU form in the JSON | en-US render | pt-BR render | seen by `placeholderDrift`'s `/\{[a-zA-Z0-9_]+\}/g`? |
|---|---|---|---|
| `{matched}` (simple — what ships) | `44254` | `44254` | **YES** → `["{matched}","{total}"]` |
| `{matched, number}` (typed) | `44,254` | `44.254` | **NO** → `null` |

So the assertion that fails against correct code is the **locale-formatted** one. Its red is recorded
verbatim below as Ablation T2-1, and it is the reason the shipped cells assert `String(MATCHED)`.

**Why the copy keeps the simple form** rather than switching to `{matched, number}` for nicer
typography: the typed form is invisible to `placeholderDrift`'s placeholder regex, so the gate would
compute an empty expected set, `continue` past the key, and **stop covering the only `views` string
that carries two placeholders**. Grouping the digits would have bought typography at the price of
gate coverage. Every interpolating key in all eight contracts in `locale-parity.test.ts` uses the
simple form, so this is also the house convention. A tripwire cell pins the choice with its reason,
so a future switch to `{matched, number}` turns red and prompts extending `placeholders()` in the
same commit. **Recorded for 50-05 / 50-08 as an open copy question, not hidden as a defect.**

---

## SC-3's evidence, and what it is NOT

**NO TEST RENDERS THE TOAST. There is no jsdom and no `@testing-library/react` in this repository**,
so no unit test in it can mount `saved-views-bar.tsx` and read the text `toast.error` puts on screen.
This is stated in the plan, it is stated in the new file's header, and it is stated here so nobody
mistakes 12 green cells for an on-screen observation.

What the evidence actually is:

1. **The string half (this plan):** the sentence RESOLVED through the production translator
   (`createTranslator` from `use-intl/core`, constructed exactly as `src/lib/email/i18n.ts:18`
   constructs it) over the real shipped JSON, in all three locales, with the counts a real refusal
   produces — and asserted distinct from both other outcomes `runExport` can reach.
2. **The structural wiring half:** shipped, and owned by 50-05, not by this plan.
3. **An on-screen observation:** NOT DELIVERED here. 50-08 makes one Playwright attempt and must
   label its verdict by what it actually observes.

### The three rendered sentences, verbatim (matched = 44,254, total = 46,054)

```
en-US: This filter matches 44254 of 46054 records — too many to export. Narrow it and try again.
pt-BR: Este filtro corresponde a 44254 de 46054 registros — muitos para exportar. Restrinja o filtro e tente de novo.
es-ES: Este filtro coincide con 44254 de 46054 registros — demasiados para exportar. Acótalo e inténtalo de nuevo.
```

Formatted forms, for the record: `Intl.NumberFormat("en-US").format(44254)` = `44,254`;
pt-BR and es-ES both = `44.254`. **None of these appears in the rendered sentences** — that is the
finding above.

### The distinguishability comparands, resolved

| outcome | en-US string |
|---|---|
| `views.export.tooBroad` (new — bounded) | `This filter matches 44254 of 46054 records — too many to export. Narrow it and try again.` |
| `bulk.error.exportFailed` (generic breakage) | `The CSV couldn't be created. Refresh the page and try again.` |
| `views.export.refused` (no filter at all) | `That export was refused because no filter was applied.` |

Asserted `not.toEqual` against both, in all three locales, on resolved values.

---

## Task 1 — the four ordered transcripts

The order is the proof: each half-state was observed failing before the next edit closed it.

### Step 1 — key in en-US ONLY → RED (4 soft failures, 2 tests)

```
 ❯ src/messages/locale-parity.test.ts (22 tests | 2 failed) 195ms
     × the notes, audit, trash, bulk, shell, dedup, views and workflows namespaces have identical key sets across all three locales 68ms
     × all three locales have identical whole-file key sets 24ms

AssertionError: views key set differs in es-ES.json: expected [ 'views.allRecords', …(60) ] to deeply equal [ 'views.allRecords', …(61) ]
-   "views.export.tooBroad",
 ❯ expectIdenticalKeySets src/messages/locale-parity.test.ts:1159:79      [1/4]

AssertionError: views key set differs in pt-BR.json: expected [ 'views.allRecords', …(60) ] to deeply equal [ 'views.allRecords', …(61) ]
                                                                          [2/4]

AssertionError: views key set in en-US.json diverges from the checked-in contract: expected [ 'views.allRecords', …(61) ] to deeply equal [ 'views.allRecords', …(60) ]
+   "views.export.tooBroad",
 ❯ src/messages/locale-parity.test.ts:1334:9                              [3/4]

AssertionError: es-ES.json key set diverges from en-US.json: expected { …(2) } to deeply equal { missing: [], extra: [] }
+   "missing": [
+     "views.export.tooBroad",
+   ],
 ❯ src/messages/locale-parity.test.ts:1659:9                              [4/4]

 Test Files  1 failed (1)
      Tests  2 failed | 20 passed (22)
```

Note: `missingIn(REQUIRED_VIEWS_KEYS)` did **not** fire — the key was not in the array yet. Both
directions of the contract are real, and this is the first one.

### Step 2 — key added to pt-BR and es-ES → RED (3 soft failures, contract only)

```
 ❯ src/messages/locale-parity.test.ts (22 tests | 1 failed) 162ms
     × the notes, audit, trash, bulk, shell, dedup, views and workflows namespaces have identical key sets across all three locales 53ms

AssertionError: views key set in en-US.json diverges from the checked-in contract: expected [ 'views.allRecords', …(61) ] to deeply equal [ 'views.allRecords', …(60) ]
+   "views.export.tooBroad",
 ❯ src/messages/locale-parity.test.ts:1334:9                              [1/3]
(then the same for es-ES.json and pt-BR.json)                             [2/3] [3/3]
```

Exactly as predicted: still the contract `toEqual`, now without the missing-locale half, and the
whole-file parity test has gone green.

### Step 3 — dot-path added to `REQUIRED_VIEWS_KEYS`, counts NOT yet moved → RED (the hard count)

```
 ❯ src/messages/locale-parity.test.ts (22 tests | 1 failed) 124ms
     × the checked-in views contract still lists exactly 61 keys 30ms

AssertionError: expected [ 'views.picker.label', …(61) ] to have a length of 61 but got 62
- 61
+ 62
 ❯ src/messages/locale-parity.test.ts:1240:33
    1240|     expect(REQUIRED_VIEWS_KEYS).toHaveLength(61)

 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)
```

Observation worth keeping: this is a **hard** `expect`, not `expect.soft`, so it aborts the test
before the duplicate guard on the next line ever runs. Only one failure is reported where two
assertions are wrong.

### Step 4 — both counts to 62, group comment to `Export — 4`, tally to `18+22+13+5+4` → GREEN

```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

---

## The six ablations (eight runs — two plan-specified ablations were mis-specified and needed a corrected second pass)

### T1-A — delete `{total}` from the pt-BR string → RED, `placeholderDrift`, naming the locale

```
     × interpolation placeholders survive translation for every required notes, audit, trash, bulk, shell, dedup, views and workflows key 38ms

AssertionError: expected { 'views.export.tooBroad': { …(2) } } to deeply equal {}
+ {
+   "views.export.tooBroad": {
+     "expected": [ "{matched}", "{total}" ],
+     "pt-BR": [ "{matched}" ],
+   },
+ }
 ❯ src/messages/locale-parity.test.ts:1531:56
```

### T1-B — pt-BR replaced with the en-US bytes → **GREEN. The plan specified this ablation wrongly.**

```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

The plan says this reddens `untranslatedInBoth`. It does not, and the function name says why
(`locale-parity.test.ts:1008-1016`):

```ts
/** Contract keys whose es-ES and pt-BR values are both byte-identical to en-US. */
return resolve(messages["es-ES"], key) === en && resolve(messages["pt-BR"], key) === en
```

It is an **AND**. A one-locale copy — the more likely translator slip of the two — is invisible to
it. Task 2's ablation 4 in the plan is mis-specified for the same reason.

### T1-B2 — the corrected ablation, en-US bytes into **both** pt-BR and es-ES → RED

```
     × no required notes, audit, trash, bulk, shell, dedup, views or workflows string was left untranslated in both es-ES and pt-BR 12ms

AssertionError: expected [ 'views.export.tooBroad' ] to deeply equal []
+ [
+   "views.export.tooBroad",
+ ]
 ❯ src/messages/locale-parity.test.ts:1410:58
```

### T1-C — the group-comment ablation → **GREEN. The tally has NO detector. This is the finding.**

Reverted the comment to `Export — 3` and the tally to `18+22+13+5+3` while leaving the array at 62
keys and both hard counts at 62:

```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

Widened to every test in the repository that references the parity file by name, plus both suite
hygiene gates:

```
./node_modules/.bin/vitest run merged-entry-wiring deleted-at-wiring templates suite-hook-hygiene suite-timing-hygiene
 Test Files  5 passed (5)
      Tests  191 passed (191)
```

**Nothing detects a wrong per-group tally.** The comment at `:1246-1249` claims it "is what stops
that sum drifting silently"; the honest record is narrower — **the two hard counts catch the ARRAY
drifting, and the per-group sum is unenforced documentation.** It is arithmetic a human reads, and
nothing more. The tally is left CORRECT regardless (`Export — 4`, `18+22+13+5+4`, verified present
after restore), and this asymmetry is reported rather than papered over.

### T2-1 — assert the locale-formatted number instead of the bare digits → RED in all three locales

**This is the decisive transcript.** It is the plan's own prescribed assertion, failing against
correct code:

```
 ❯ src/messages/export-too-broad-copy.test.ts (12 tests | 3 failed) 87ms
       × names both counts the server measured 58ms   (×3, one per locale)

AssertionError: en-US: the refusal must name how many rows matched, or the user cannot act on it: expected 'This filter matches 44254 of 46054 re…' to contain '44,254'
Expected: "44,254"
Received: "This filter matches 44254 of 46054 records — too many to export. Narrow it and try again."
 ❯ src/messages/export-too-broad-copy.test.ts:122:11
        ).toContain(new Intl.NumberFormat(locale).format(MATCHED))          [1/3]

AssertionError: es-ES: … expected 'Este filtro coincide con 44254 de 460…' to contain '44.254'
Expected: "44.254"
Received: "Este filtro coincide con 44254 de 46054 registros — demasiados para exportar. Acótalo e inténtalo de nuevo."
                                                                            [2/3]
(and pt-BR the same)                                                        [3/3]
```

Anyone who "simplifies" the shipped cells toward `Intl.NumberFormat` re-breaks the file. The file's
header and a dedicated tripwire cell both say so.

### T2-2 — render with no values at all → RED, and the behaviour is **build-dependent**

Two different failure modes, caught by two different cells:

**Under the development build (what vitest resolves):** `use-intl` does not throw. It notifies and
falls back to the **key path**:

```
stderr | … > en-US > names both counts the server measured
IntlError: FORMATTING_ERROR: The intl string context variable "matched" was not provided to the string
  "This filter matches {matched} of {total} records — too many to export. Narrow it and try again."
  code: 'FORMATTING_ERROR'

AssertionError: en-US: the refusal must name how many rows matched, or the user cannot act on it: expected 'views.export.tooBroad' to contain '44254'
Expected: "44254"
Received: "views.export.tooBroad"

       × names both counts the server measured           (×3)
     × the three locales render three different sentences 10ms
      Tests  4 failed | 8 passed (12)
```

**Under the production CJS build** (probed directly via `node -e`): no throw, no notify — it returns
the **template with `{matched}` intact**.

So the two cells are complementary rather than redundant, and each covers the other's blind spot:

| build | what the user would read | cell that fires |
|---|---|---|
| development | `views.export.tooBroad` (the dot-path — the Phase 45 finding) | `toContain(String(MATCHED))` + the pairwise-distinct cell (all three locales collapse to the same fallback) |
| production | `This filter matches {matched} of {total} records…` | `not.toContain("{matched}")` |

Note the `{matched}` cell **passes vacuously** under the dev build, because the dot-path fallback has
no braces in it. That is precisely why both cells are kept.

### T2-3 — point the subject at `views.export.refused` → RED, the no-filter cell, ×3

```
       × reads differently from the generic breakage and from the no-filter refusal   (×3)

AssertionError: en-US: a blocked broad export must also be distinguishable from the NO-FILTER refusal — views.export.refused is a different cause with a different remedy: expected 'That export was refused because no fi…' to not deeply equal 'That export was refused because no fi…'
 ❯ src/messages/export-too-broad-copy.test.ts:156:15
        ).not.toEqual(tViews("export.refused"))
```

The plan asks that "both not-equal cells must redden" from this one ablation. **They cannot** — this
substitution can only collide with the `refused` comparand, and the `exportFailed` cell correctly
stays green. A second pass was needed to prove the other cell live.

### T2-3b — point the subject at `bulk.error.exportFailed` → RED, the breakage cell, ×3

```
AssertionError: en-US: a blocked broad export must be distinguishable from a broken one — bulk.error.exportFailed is the generic breakage and tells the user to refresh: expected 'The CSV couldn\'t be created. Refresh…' to not deeply equal 'The CSV couldn\'t be created. Refresh…'
 ❯ src/messages/export-too-broad-copy.test.ts:150:15
        ).not.toEqual(tBulk("error.exportFailed"))
```

Both not-equal cells are now independently proven non-vacuous.

### T2-4 — copy the en-US sentence over the es-ES one, run BOTH files → only ONE detector fires

```
 ❯ src/messages/export-too-broad-copy.test.ts (12 tests | 1 failed) 80ms
     × the three locales render three different sentences 17ms

AssertionError: en-US and es-ES render the same sentence — one locale was copied from the other, and a user in one of them is reading the wrong language: expected 'This filter matches 44254 of 46054 re…' to not deeply equal 'This filter matches 44254 of 46054 re…'                    [1/2]

AssertionError: three locales must yield three distinct sentences: expected 2 to be 3
- 3
+ 2                                                                        [2/2]

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 33 passed (34)
```

**Which fires, and why only one:** this file's pairwise-distinct cell fires; the parity file's
`untranslatedInBoth` stays **green**, because it requires es-ES **AND** pt-BR to both match en-US
(see T1-B). The hoped-for "two independent detectors for one defect" is not what exists — but the
consequence is better than neutral: **the new file's coverage is strictly wider than the parity
file's in this respect.** A single-locale copy-paste is caught only here.

---

## Verification, all re-measured (nothing inherited)

| check | result |
|---|---|
| `vitest run src/messages/export-too-broad-copy.test.ts src/messages/locale-parity.test.ts` | **34 passed (2 files)** |
| `npm test` (base) | **5708 passed / 32 skipped over 186 files** (188 incl. 2 skipped files) |
| `npm test` (rsc) | **8 passed (2 files)** |
| `tsc --noEmit` | **0** (no output) |
| `npm run lint` | **0 errors**, 118 warnings |
| `git diff --exit-code -- src/` after every ablation | **clean (exit 0)** |
| deletions in this plan's commits | **none** (`git diff --diff-filter=D` empty) |

**Baseline discrepancy resolved, as `50-VALIDATION.md` required.** The task environment's figure was
right and `.planning/STATE.md:30` is stale:

| source | claim | verdict |
|---|---|---|
| task environment block | 5696 / 32 over 185 files | **correct** — 5696 + 12 new = **5708**, 185 + 1 new file = **186** |
| `.planning/STATE.md:30` | 5659 / 32 over 184 files | **stale** |

Lint warnings read 118 against the environment's 117. My new file contributes **zero** lint output
(`npm run lint | grep -c export-too-broad-copy` → `0`), so this is the known
non-reproducible-across-trees warning total. Gated on errors = 0, per project memory.

`npm run test:db` and `npm run test:live` were **NOT** run: this plan is neither `db_test_owner` nor
`live_test_owner`, it touches no database and no export code, and the wave rules forbid a
non-owner from running the suite that writes `audit_log` in the real database.

---

## Constraint compliance, checked rather than assumed

| constraint | evidence |
|---|---|
| `views.export.disabledReason` untouched | asserted byte-identical against the pre-plan values in all three locales, via `node -e`, after every edit. History read first: `01406e6` introduced the pre-G-2 text, **`303418b` (`fix(40-verify)`) is the G-2 reword** that ships today. |
| `REQUIRED_BULK_KEYS` does not move | verified **structurally**, not by grep: of 54 changed lines in the parity diff, **zero** mention `BULK`, and the only changed array-entry line is `+ "views.export.tooBroad"`. (A naive `git diff | grep -c REQUIRED_BULK_KEYS` returned `1` — a **context** line — which is exactly the pipe hazard the environment warns about.) |
| `bulk.error.tooMany` not reused | no component touched; the shipped `occurrences(source, 'tBulk("error.tooMany"') === 0` gate is unmodified and green in the full suite. |
| `EXPORT_KEYS` in `saved-views-bar-wiring.test.ts` untouched | `git diff --stat` on that path is empty. 50-05 owns it, in the same commit as the toast branch that references the key. Note this **departs from `50-RESEARCH.md` §6 edit #6**, which lists it here; the plan's constraint 3 supersedes, and the reason is sound — adding it now would make a gate assert a reference that does not exist yet. |
| all six edits in ONE commit | `2400b0d` carries all of them; the intermediate states were observed and never committed. |
| no `Date.now()` / no elapsed assertion | none present; `suite-timing-hygiene.test.ts` green in the full suite. |
| named-integer floors | `MATCHED = 44_254`, `TOTAL = 46_054`, `max = 50_000`, `toBe(LOCALES.length)`; the discriminating cell has its own floor. |
| no package installed | `use-intl` was already a production dependency (`src/lib/email/i18n.ts`); `Intl` is built in. The Package Legitimacy Gate does not apply. |

---

## Deviations from Plan

### 1. [Rule 1 — the plan's assertion was wrong] The number-formatting premise is inverted

- **Found during:** Task 2, before writing any assertion.
- **Issue:** the plan, `50-RESEARCH.md` §6 and the task brief all require asserting
  `Intl.NumberFormat(locale).format(44254)` (`44,254` / `44.254`) and driving `toContain("44254")` as
  a deliberate red. Measured, the truth is the exact reverse: `{matched}` is a simple ICU argument, so
  `use-intl` renders `44254` bare and the **formatted** assertion is the one that fails.
- **Fix:** asserted the true rendered form; drove the plan's prescribed formatted assertion as the
  red instead (T2-1) and recorded it verbatim; added a tripwire cell pinning the simple-argument
  choice with its reason. **The plan's mandated copy text was kept exactly as written** — the copy and
  the plan's assertion contradicted each other, and the copy is what `placeholderDrift` needs.
- **Not escalated to Rule 4** because the conservative option required changing nothing shared: the
  alternative (typed `{matched, number}`) would have needed an edit to `placeholders()`, a function
  eight contracts depend on. That trade is recorded below for 50-08 rather than taken unilaterally.

### 2. [Rule 1 — mis-specified ablations] Two plan ablations cannot redden what the plan says they redden

- `untranslatedInBoth` is an **AND** over es-ES and pt-BR, so Task 1's single-locale ablation and
  Task 2's ablation 4 are both green by construction. Corrected passes T1-B2 and T2-3b were added so
  every gate is proven live. Both the mis-specification and the corrected red are recorded above.

### 3. [Rule 2 — documentation accuracy] Refreshed the stale figures the parity file calls load-bearing

The file states "the per-group counts in the comments are load-bearing" and that every key count
quoted in the phase-40 planning documents was wrong. Adding a 62nd key would have staled four more
such claims, so they were corrected in the same commit:

| location | before | after |
|---|---|---|
| `REQUIRED_VIEWS_KEYS` doc-block | "61 keys" / "a 62nd `views` string" | "62 keys — 61 from phase 40, plus … 50-02" / "a 63rd" |
| the views exact-contract comment | "a 62nd key added without its dot-path" | "a 63rd …" |
| the `placeholderDrift` tally | "Ten of the 61 views keys interpolate" | "Eleven of the 62 …", naming `tooBroad` as the only one with two distinct numeric arguments |
| the `placeholderCounts` comment | "Not one of the 61 `views.*` strings repeats a placeholder — the ten that interpolate" | "…the 62 … the eleven that interpolate", noting `{matched}` once + `{total}` once is two tokens, not one twice |
| the WR-02 block | "REQUIRED_VIEWS_KEYS stays at 61" | restated **without a figure** ("WR-02 added no entry"), so it cannot go stale again |

Deliberately **not** changed: the count-drift claim in the `:1246` comment is now known to be
unenforced (T1-C), but the comment's arithmetic is left correct and the limitation is reported here
rather than by deleting a comment another plan may rely on.

---

## Authentication Gates

None. This plan touched no authenticated surface.

---

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The only trust
boundary this plan crosses is server-measured counts → a translated sentence, which is
`T-50-02-01`/`T-50-02-06` in the plan's own register and is addressed below.

### The count-oracle trade, recorded for 50-08 to carry as a named limitation

`T-50-02-06` — the refusal discloses `matched` and `total` to any authenticated user, which is a
count oracle. **Accepted, with reasons, not overlooked:**

- 50-CONTEXT locks the numbers into the message: *"the refusal must carry the numbers (`matched`,
  `total`) so SC-3 is satisfiable with an actionable message rather than a generic one."*
- The same totals are **already** obtainable by the same user from `/api/v1/organizations`
  `meta.total` (`route.ts:35-38`) and from the list surfaces, so the message adds no capability.
- **No row CONTENT is disclosed** — two integers only.
- The trade resolves in favour of the numbers, because a refusal a user cannot act on reads as a bug
  (`T-50-02-01`), which is the SC-3 failure this plan exists to prevent.

**50-08 should carry this as a stated limitation**, alongside the two below.

---

## Known Stubs

None. No placeholder text, no empty-value stub, no unwired component. The key exists in the JSON
before its consumer does, which is green today and is proven so by the full suite.

---

## Limitations for 50-08's sign-off

1. **No test renders the toast.** No jsdom, no `@testing-library/react`. The string half is proven;
   the on-screen observation is not, and 50-08's Playwright attempt must label its verdict by what it
   actually observes rather than by this plan's green.
2. **The counts are not locale-grouped.** `44254`, not `44,254` / `44.254`. Deliberate, because the
   typed ICU form would silently remove the key from `placeholderDrift`. An open copy question, with
   a tripwire cell attached; fixing it requires extending `placeholders()` in the same commit.
3. **The per-group tally in `REQUIRED_VIEWS_KEYS` has no detector** (T1-C). The two hard counts catch
   the array drifting; the `18+22+13+5+4` sum is documentation a human reads. The comment claiming
   otherwise overstates it.
4. **The count oracle** above.

---

## HANDOFF — text for the orchestrator to apply (this plan edited NEITHER file)

`.planning/STATE.md` and `.planning/ROADMAP.md` were **not** modified by this plan, per instruction.
The orchestrator owns them. Suggested content:

### STATE.md

- Advance Current Plan past `50-02`.
- **Correct the stale baseline at `:30`**: `5659 / 32 over 184 files` → **`5708 passed / 32 skipped
  over 186 files`** (measured this wave; the pre-plan value was 5696 / 185, so the environment block
  was right and STATE.md was wrong by 49 tests and 2 files). Lint: **0 errors**, 118 warnings.
- Decisions to record:
  - `views.export.tooBroad` keeps SIMPLE ICU arguments; `{matched, number}` would group per locale but
    is invisible to `placeholderDrift`'s regex and would drop the key from that gate.
  - `views.export.disabledReason` is untouched; Phase 40's G-2 reword (`303418b`) stands.
  - `EXPORT_KEYS` in the wiring test is 50-05's, not 50-02's — this departs from `50-RESEARCH.md` §6
    edit #6 on purpose.
- Observations to record:
  - `OBS-50-01` — `50-RESEARCH.md` §6 and `50-02-PLAN.md` state the number-formatting behaviour
    backwards; `use-intl` renders simple ICU arguments bare. Any later plan quoting `44,254` as an
    expected substring is quoting a red.
  - `OBS-50-02` — `untranslatedInBoth` is an AND over es-ES and pt-BR; a one-locale copy-paste is
    invisible to it. Two plan ablations were mis-specified on this basis.
  - `DEF-50-02` (minted as `DEF-50-01`; renumbered on merge — 50-01 minted the same id in the same wave) — the `REQUIRED_VIEWS_KEYS` per-group tally is unenforced; the `:1246` comment claims
    it prevents silent drift and it does not.
  - `DEF-50-02` — the refusal's counts are not locale-grouped; grouping requires extending
    `placeholders()` in `locale-parity.test.ts` in the same commit.

### ROADMAP.md

- Phase 50 progress: plan `02` of 8 complete (2 of 2 tasks, 2 commits).
- SC-3: **string half delivered and proven; on-screen half NOT delivered** (no jsdom in the repo).
  Do not mark SC-3 met on the strength of this plan alone.

### REQUIREMENTS.md

- `SEC-03`: partial. This plan delivers only the refusal copy; the guard itself is 50-01/50-03+.
  **Do not check `SEC-03` complete on this plan.**

---

## Commits

| task | commit | what |
|---|---|---|
| 1 | `2400b0d` | `feat(50-02): views.export.tooBroad in three locales, contract moved 61 -> 62` |
| 2 | `a8d105c` | `test(50-02): prove the refusal RESOLVES with both counts, in three locales` |

Base: `9f8cfb4` (worktree was stale at `a58b9e1` on spawn — the 34th consecutive occurrence —
corrected with `merge --ff-only`, never `reset --hard`).

## TDD Gate Compliance

Plan `type: tdd`. Both gates present and in order:

- **RED:** driven and recorded four times over in Task 1 (steps 1-3, each a distinct half-state) and
  in Task 2's T2-1, whose red is the plan's own prescribed assertion failing against correct code.
- **GREEN:** `2400b0d` (`feat`) closes Task 1's contract; `a8d105c` (`test`) lands the resolution
  proof green.
- **Gate-sequence note:** the commit ORDER is `feat` then `test`, inverted from the canonical
  `test`-then-`feat`, and that is correct here rather than a violation. Task 1's RED is produced by a
  **pre-existing** shipped gate (`locale-parity.test.ts`, whose exact-`toEqual` cannot be
  half-satisfied), so there was no new failing test to commit first — committing the JSON without the
  contract edits would have shipped a red suite, which the plan forbids in constraint 4. Task 2's file
  is a proof of already-landed behaviour, so it lands after it. Every red is recorded verbatim above.
- **REFACTOR:** not needed; no commit made.

## Self-Check: PASSED

- `src/messages/export-too-broad-copy.test.ts` — FOUND (246 lines, ≥ the 110-line artifact floor)
- `src/messages/en-US.json`, `pt-BR.json`, `es-ES.json` — FOUND, each carrying `tooBroad` with both
  placeholders (verified by `node -e`, parsed not grepped)
- `src/messages/locale-parity.test.ts` — FOUND, `REQUIRED_VIEWS_KEYS` length 62
- commit `2400b0d` — FOUND in `git log`
- commit `a8d105c` — FOUND in `git log`
- `git diff --exit-code -- src/` — clean
