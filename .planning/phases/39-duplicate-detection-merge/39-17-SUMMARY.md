---
phase: 39-duplicate-detection-merge
plan: 17
subsystem: testing
tags: [playwright, e2e, responsive, dark-mode, next-intl, dedup, uat, tailwind]

# Dependency graph
requires:
  - phase: 39-11
    provides: "`/duplicates` shell and its admin-only layout gate, plus `identity-fields-form.tsx` — the surface whose save button this plan's measurement found overflowing"
  - phase: 39-13
    provides: "the scan panel, the pair card, the dismissed view and the lifted `ProgressBar` — the surfaces measured and observed here"
  - phase: 39-15
    provides: "`/duplicates/[pairId]`, `merge-form.tsx` and the `-conflict-…-loser` DOM-id derivation the new spec anchors on"
  - phase: 39-09
    provides: "`mergeRecordsMutation` — the merge actually performed during the visual pass"
  - phase: 39-07
    provides: "the scan engine and `getPairDetail`; the 20.6s organization scan timing this plan re-measured at 20s"
  - phase: 39-05
    provides: "`duplicate_pairs` and its canonical-ordering rule, which the new spec's fixture obeys"
  - phase: 45-02
    provides: "the whole Playwright harness — `playwright.config.ts`, `e2e/auth.setup.ts`, `e2e/seed-admin.ts`, the storageState posture and `ignoreDefaultArgs: --hide-scrollbars`"
  - phase: 45-08
    provides: "`e2e/viewport-320.spec.ts` (the `AnchorCatalog` shape extended here) and `e2e/deals-drag.spec.ts` (the create-use-hard-delete-prove fixture rule)"
provides:
  - "`e2e/viewport-320.spec.ts` extended from 6x3 = 18 to 7x3 = 21 assertions — `/duplicates` measured at 305/305 in three locales behind a catalog-read `h1`-by-role anchor"
  - "`e2e/merge-screen-320.spec.ts` — `/duplicates/[pairId]` measured at 305/305 in three locales against a self-created, self-destroyed duplicate pair shaped to fill all three M-3 field groups"
  - "the identity-fields save button fixed to wrap, closing the phase's one measured 320px overflow"
  - "the UI-SPEC V-6 dark-mode pass, driven against the rebuilt image, with eight steps reported and six findings raised"
affects: [39-verification, 40, 41]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "an e2e anchor that proves GROUP membership structurally (a `[id*=\"-conflict-\"][id$=\"-loser\"]` radio inside its own `label` card) rather than by ICU-rendering a plural legend in the spec"
    - "a spec whose fixture pins WHICH record survives through `created_at`, because the field group a value lands in depends on the survivor and an unpinned fixture measures a different screen"
    - "a visual checkpoint driven by scripts held OUTSIDE the repo (in the session scratchpad) rather than by a temporary spec under `e2e/`, so there is nothing to forget to delete"
    - "a grep-vs-comment collision resolved by rewording the rule into prose that still states it, never by deleting the comment"

key-files:
  created:
    - e2e/merge-screen-320.spec.ts
  modified:
    - e2e/viewport-320.spec.ts
    - src/app/duplicates/identity-fields-form.tsx

key-decisions:
  - "The plan's `grep -c \"ignoreDefaultArgs\" playwright.config.ts = 1` criterion is stale: the true count is 2 and always has been (one in the DO-NOT-REMOVE comment, one in code), exactly as STATE.md's 45-11 entry records. The config was NOT edited to satisfy the number."
  - "`grep -ci \"password\" e2e/merge-screen-320.spec.ts = 0` was satisfied by wording the no-credential rule with the word \"credential\", not by deleting the rule. Sixth occurrence of this phase's grep-vs-comment trap."
  - "The plan's premise for the merge spec's second anchor is wrong in one detail and the spec says so: `page.tsx`'s `goneState` renders NO `h1`, so anchor 1 already distinguishes it. The second anchor's real value is proving the field partition produced option cards — the only part of that screen whose width is driven by stored data."
  - "Checklist step 1 was run against a PERSON as the carry-forward permits, AND against an organization with `dedup.organization_identity_fields` deliberately configured. The organization run is what produced finding D-39-01."
  - "The organization scan was run for real against 46,054 live records because steps 2-4 have no other input. Its 543 surviving `duplicate_pairs` rows and 1 `dedup_scans` row were left in place as legitimate feature state, per the plan's instruction; `app_settings` was restored to its pre-plan state (zero `dedup.*` rows)."
  - "Two option cards of ONE field sitting two-up at >=sm is CORRECT per UI-SPEC M-1, which permits `grid gap-2 sm:grid-cols-2` in as many words. Checklist step 4's demand that the records be stacked at a wide window is a misstatement of M-1 and was reported as such rather than filed against the implementation."

patterns-established:
  - "Measure the populated render, not just the empty one: `/duplicates` was green at 305 on its empty state and stayed green at 305 with 25 pair cards, and both runs are recorded."
  - "Report a checklist item that cannot be satisfied by a CORRECT implementation as a checklist defect with the authoritative rule quoted, never by relaxing the implementation or by silently passing the step."

requirements-completed: [DEDUP-01, DEDUP-02, DEDUP-03]

# Metrics
duration: ~75min
completed: 2026-08-19
---

# Phase 39 Plan 17: The 320px Matrix, the Merge-Screen Spec and the Dark-Mode Pass Summary

**`/duplicates` and `/duplicates/[pairId]` both measure 305/305 in three locales behind anchors proven capable of failing, a real 7px es-ES overflow was found and fixed, and the dark-mode pass ran end to end against the rebuilt image — eight steps observed, six findings raised, one of them UAT-critical.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-08-19T16:05Z (approx; first rebuild)
- **Completed:** 2026-08-19T16:29Z (last code commit) + the visual pass
- **Tasks:** 2 auto tasks committed, 1 checkpoint driven and reported
- **Files modified:** 3 (1 created, 2 modified)
- **Docker rebuilds:** **2**, against a budget of 2 to 4

## Accomplishments

- The viewport matrix went from 18 to **21 assertions**; the run reports **`22 passed`** (1 setup + 21 routes), and 18 would have meant the seventh route never ran.
- `e2e/merge-screen-320.spec.ts` measures the merge screen against a REAL pair with fixtures it creates and destroys itself, leaving verified zero rows behind and byte-perfect `count(*)` parity on four tables.
- One real layout defect found by measurement and fixed without weakening anything: the identity-fields save button overflowed 312 vs 305 at es-ES.
- The UI-SPEC V-6 dark-mode debt is discharged by observation of the running application, including a real merge performed on records created for the purpose.

## Task Commits

1. **Task 1 (RED half): the seventh route in the 320px viewport matrix** — `21f7024` (test)
2. **Task 1 (GREEN half): the identity-fields save button wraps at 320px** — `4f3f20b` (fix)
3. **Task 2: the merge screen measured at 320x640 in three locales** — `4e53e91` (test)
4. **Task 3: checkpoint — driven and reported below.** No code; the driver scripts live in the session scratchpad and never entered `e2e/`.

## Files Created/Modified

- `e2e/merge-screen-320.spec.ts` — NEW. Three locale assertions, two anchors before each measurement, self-created and self-proved-clean fixtures.
- `e2e/viewport-320.spec.ts` — `AnchorCatalog` gains `dedup: { scan: { title: string } }`; `ROUTES` gains `/duplicates`; the "six routes" prose corrected to seven and the new route's admin-gate consequence recorded.
- `src/app/duplicates/identity-fields-form.tsx` — `h-auto whitespace-normal` on the save `Button`, with the measurement written down beside it.

## Phase Gate

| Gate | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **0 errors**, 127 warnings (unchanged baseline) |
| `npm run test` | **126 files passed / 1 skipped; 2,674 passed / 21 skipped**, plus the RSC project **2 files / 8 passed** |
| `npm run test:db` | **1 file / 22 passed** (the induced-failure log line is the deliberate 39-10 Test 5 probe) |
| `./node_modules/.bin/playwright test` | **29 passed** — baseline 23, plus 3 new viewport assertions, plus 3 merge-screen assertions |
| `scripts/dedup-checks.sql` | **0 result-row FAILs**, 77 PASS rows; Part 4's five EXPLAIN index probes all PASS; Part 10's `notes_migration_uniq` 23505 EXPECTED-ERROR appeared as required |
| `git diff --stat .github/workflows/ci.yml` | empty (0 bytes); `grep -c playwright ci.yml` = **0** |
| `git diff --stat package.json package-lock.json` | empty (0 bytes) — no dependency touched, no `npm install`, no `shadcn add` |
| Migrations | latest is `0017_dedup_schema.sql`; **no 0018 generated** |
| `git status --porcelain e2e/.auth/` | empty — no token committed |
| Boot reaper | `[dedup-scan-cleanup] Starting` / `Done: 0 stranded scan(s) marked error, 0 idle deleted, 0 expired deleted` present after rebuild 1 |

### Measured widths

| Route | en-US | pt-BR | es-ES |
|---|---|---|---|
| `/duplicates` (empty state) | 305 / 305 | 305 / 305 | **312 / 305 RED**, then 305 / 305 after the fix |
| `/duplicates` (543 pairs, 25 cards) | 305 / 305 | 305 / 305 | 305 / 305 |
| `/duplicates/[pairId]` | 305 / 305 | 305 / 305 | 305 / 305 |
| both routes, DARK theme | 305 / 305 | 305 / 305 | 305 / 305 |

### Anti-vacuity, RUN not reasoned about

**Task 1.** `/duplicates` re-pointed at `/duplicates-anti-vacuity-probe`: all three locales failed on the ANCHOR, not the measurement —
`Error: expect(locator).toBeVisible() failed / Locator: getByRole('heading', { name: 'Duplicados', level: 1 })`. The failure quotes the LOCALE'S heading, which independently proves the locale cookie applies. Path restored.

The two lines proving the anchor runs before the measurement:

```ts
      await expect(
        page.getByRole("heading", { level: 1, name: route.anchor(messages) })
      ).toBeVisible()

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
```

**Task 2, run A (the plan's version).** Fixture pair deleted immediately after creation so the page renders the server refusal: the spec FAILED, on `getByRole('heading', { name: 'Merge duplicates', level: 1 })`. It did NOT pass on the measurement. Note the correction: the refusal state renders no `h1` at all, so it fails on anchor 1 — the plan's "the gone state would satisfy the h1 check" is not true of `page.tsx`'s `goneState`.

**Task 2, run B (the option-card anchor's own capability).** With the pair intact, the anchor's filter re-pointed at a value on no card: anchor 1 passed and the spec FAILED on anchor 2 —
`Locator: locator('label:has([role="radio"][id*="-conflict-"][id$="-loser"])').filter({ hasText: 'https://this-value-is-on-no-card.invalid/probe' })`. Restored.

The second anchor, quoted:

```ts
    const conflictLoserCard = page
      .locator('label:has([role="radio"][id*="-conflict-"][id$="-loser"])')
      .filter({ hasText: BETA_WEBSITE })
    await expect(conflictLoserCard).toBeVisible()
```

### Teardown proof (Task 2)

```
orgs_with_prefix|0        -- organizations where name like '[e2e] Merge Screen%'
duplicate_pairs |0        -- and zero pair rows referencing either fixture id
```

`count(*)` parity across the whole run: organizations 46,054 -> 46,054 · people 38,348 -> 38,348 · deals 25,195 -> 25,195 · notes 75,236 -> 75,236 · `duplicate_pairs` 0 -> 0 · `audit_log` 213 -> 213.

---

## Task 3 — the dark-mode and end-to-end visual pass (UI-SPEC V-6)

**How it was driven.** The 45-11 posture, exactly: an agent driving a real headless Chromium against the image rebuilt in Task 1, reusing the existing gitignored `e2e/.auth/admin.json` storageState, so **no credential was handled**. Theme set to **dark through the user menu**, not by writing localStorage — verified `documentElement.className = "dark"`, `style.colorScheme = "dark"`, `body` background `lab(2.75381 0 0)`, `localStorage.theme = "dark"`, and the three theme rows present only after the menu opened (`Light`/`Dark`/`System`, `System` checked before the click). The driver scripts live in the session scratchpad and **never entered `e2e/`**, which now holds exactly the five pre-existing specs plus `merge-screen-320.spec.ts`.

**Fixtures.** Every record touched was created for this pass under a `[UAT39]` / `[UAT39-L10N]` prefix: 6 organizations, 2 people, 3 deals, 3 notes, 2 duplicate-pair rows. **No real user record was read, mutated, merged or deleted.** All of it removed afterwards — see Row Counts below.

**THE PHASE IS NOT SELF-APPROVED.** What follows is observation. The accept/reject decision is the human verifier's.

### Step-by-step

**Step 1 — `/organizations` create-time warning: OBSERVED WITH A DEFECT (D-39-01), and separately observed working on a PERSON.**

Run against an organization, with `dedup.organization_identity_fields` deliberately configured to `["CNPJ / CPF"]` first (through the `/duplicates` form, which showed the toast `Identity fields saved.` and listed `Segmento Organização` ONCE despite two definitions sharing that name — the documented blob-key dedup): typed the exact name of an existing organization that carries a CNPJ, submitted. **No warning appeared. The dialog closed and the record was created** (`toast: Organization created!`, submit label never changed from `Create Organization`). See D-39-01 — this is a real gap, not the known carry-forward item.

Run against a person (`marina.uat39@example.com`, matching an existing fixture person): **everything the step asks for was observed.** The advisory appeared INSIDE the dialog ABOVE the form; it is the DEFAULT Alert with a `TriangleAlert` glyph and is **not red** (C-1 holds in dark mode); the dialog did not close and all four typed values survived (`[UAT39] Marina` / `Aurora Compras` / the email / `+55 11 90000-0001`); the matched record showed its **name**, a **distinguishing value** (`marina.uat39@example.com`) and a **reason** (`Same email address`); the submit button relabelled to **`Create anyway`**; the matched name is `<a target="_blank" rel="noopener noreferrer" href="/people/8f34…">` and clicking it **really opened a second tab** (context pages 1 -> 2 at that URL); `Create anyway` then created the record with the warning **not** reappearing.

**Step 2 — `/duplicates` scan: OBSERVED, with one accessibility observation (F-39-04).**
Dark mode, two tabs with counts (`Organizations(0)` / `People(0)`). Started an organization scan. A **determinate** bar appeared — `71%`, a `bg-primary` fill on a `bg-muted` track, and the sentence `32,549 of 46,058 records compared` — **not a bare spinner**. `This runs in the background. You can leave this page and come back.` visible throughout. `Cancel scan` present as an outline button. The scan **finished and stopped updating** after **20 s** (the poll cleared: spinners 0, bar gone, `Last scanned 1 second ago` + `Scan again`). The pair list then rendered **544 possible duplicates** with confidence badges reading **words** — `Almost certain` and `Likely` — each beside a `dedup.reason.*` sentence. Tier split: 405 `likely` + 139 `certain`, the 405 matching plan 39-07's recorded measurement exactly.

**Step 3 — dismiss / dismissed view: OBSERVED.**
Dismissed the fixture pair: toast `Marked as not a duplicate.`, the card left the list, the tab count went `544` -> `543`. `Show dismissed pairs` is a **link**, not a button (`Button asChild` + `Link` — semantically right for navigation; noted only because a role-based locator must know). It sits below the list and appeared once there was something behind the flag. In `?dismissed=1` the pair was there, the tab read `Organizations(1)`, the card rendered **without** `Review and merge` and **with** `Move back to the list`, and `Hide dismissed pairs` was present. Clicking `Move back to the list` returned it with toast `Back in the list.`

**Step 4 — `/duplicates/<pair>`: OBSERVED, with one checklist-wording defect (D-39-02).**
- Survivor selector **FIRST** (y=314, above the conflicts card at y=522). ✓
- Stacking: at **320px every one of the 8 option cards is at x=57** — one column, fully stacked. At **1280px the two options of one field sit two-up** (x=57 and x=637). That is **correct** per UI-SPEC M-1; see D-39-02.
- Selected state has **BOTH** carriers: `border-color: lab(90.952 0 0)` (= `border-primary`, dark `oklch(0.922 0 0)`) versus `lab(100 0 0 / 0.1)` unselected, **plus** the filled radio dot and `aria-checked="true"`. ✓
- An empty side reads the WORD: `empty` / `vacío` in italic muted, never a blank. ✓
- `What moves to the record you keep`: `2 deals`, `2 notes`, `1 person`, then `Activities stay attached to their deals and move with them.` and `Uploaded files stay where they are and keep working from the record you keep.` ✓
- The submit row does **NOT** float: **zero `sticky`/`fixed` ancestors** on the `Merge records` button at both 320px and 1280px. (A y-coordinate scroll probe returned an inconsistent number — 883 then 1036 after `window.scrollTo(0,400)` — which I record as a measurement artifact of reading the box across a disclosure reflow, not as evidence; the ancestor-position check is the conclusive one and agrees with 39-15's source gate.)
- `Show identical fields` expanded to `3 fields are identical` — `Industry / Metalworking`, `Default currency / BRL`, `CNPJ / CPF / 55.444.333/0001-22`, the custom field under its **user-authored name** (M-4). ✓
- The long URL **wrapped across two lines with nothing truncated** at both widths. ✓

**Step 5 — the confirmation and the merge: OBSERVED.**
`AlertDialog` titled `Merge these records?`, body naming **both** records: `[UAT39] Metalurgica Aurora LTDA ME moves to Trash and [UAT39] Metalurgica Aurora Ltda keeps the values you chose. You can restore [UAT39] Metalurgica Aurora LTDA ME from Trash, but the merge itself isn't undone.` The action button **is red**: `background: oklab(0.704006 0.176798 0.0722319 / 0.6)` (the dark-mode `--destructive` token at `/60`) with `rgb(255,255,255)` text — legible on the dark surface. Confirmed it. Redirected to `/duplicates` with toast `Records merged. [UAT39] Metalurgica Aurora LTDA ME is in Trash.` Database after: loser `deleted_at` set, survivor live, **3 deals / 3 notes / 1 person all on the survivor and 0 left on the loser**, pair `status = merged`, and `merged` audit rows on **both** sides carrying `__mergedFrom`/`__mergedFromName`/`__mergedChildren` and `__mergedInto`/`__mergedIntoName`/`__mergedChildren` respectively, plus the loser's `deleted` tombstone from the event bus — exactly the shape carry-forward #5 predicted.

**Step 6 — the survivor's timeline: OBSERVED, behind a toggle (F-39-05).**
The entry reads `merged [UAT39] Metalurgica Aurora LTDA ME into this organization`, states `5 linked records moved to this one` (2 deals + 2 notes + 1 person — the loser's children, correct), the losing record's name is **NOT a link** (zero anchors inside the entry), and the field change is listed the same way any other change entry lists them: `Notes  empty → Importado da planilha antiga; …` with the arrow. **But it is hidden by default** behind `Show field changes (1)` — see F-39-05.

**Step 7 — `/trash`: OBSERVED.**
`Organizations(1)`; the row reads `[UAT39] Metalurgica Aurora LTDA ME | https://aurora-me-uat39.example.com/contato | 3 minutes ago | Pipelite E2E Admin | Restore | Delete permanently`. Attributed to me. (`/trash` opens on the Deals tab, so the Organizations tab has to be selected — expected, not a defect.)

**Step 8 — pt-BR and es-ES: OBSERVED WITH A DEFECT (D-39-03).**
Both surfaces, both locales, at **1280px and 320px**, in dark mode: correct `h1` per locale (`Duplicados` / `Mesclar duplicados` / `Fusionar duplicados`), **zero raw dot-paths** (scanned for the `dedup|audit|review|merge|scan|identity|common|nav|trash|bulk|notes` namespaces), and **zero of the 28 checked `dedup.*` English strings** surviving in either non-English locale. No overflow: 305/305 at 320px in all three locales on both routes. **However** the merge screen's field label for the `notes` column renders the hardcoded English word `Notes` in all three locales — see D-39-03.

### Findings, with surface / locale / viewport

**D-39-01 — UAT-CRITICAL. The organization create-time duplicate warning cannot fire from any surface in the product, even with the identity fields configured.**
*Surface:* `/organizations` Add Organization dialog. *Locale:* all. *Viewport:* all (not viewport-dependent).
This goes **beyond** the known carry-forward item, which said only that the warning is off until an admin configures `dedup.organization_identity_fields`. I configured it (`["CNPJ / CPF"]`, saved through the real form) and the warning **still cannot fire**. Chain, verified by observation and then in source:
`createOrganization` has exactly **one** caller — `src/app/organizations/organization-dialog.tsx:246` — which submits `{ name, website, industry }` and nothing else; `src/app/organizations/actions.ts:105` passes `data.customFields` (undefined) into `certainMatchesOrNone`; `src/lib/dedup/matching.ts:191` returns `[]` at `if (!draftHasIdentityValue(input.customFields, identityFields)) return []` **before issuing any query**. And the create dialog renders **no custom-field inputs at all** (its four ids are `name`, `website`, `industry`, `notes`), so a user has no way to supply the identity value the certain tier requires. Consequence: **SC-1's organization half is not observable in the product**, only its person half. The person path is complete and works (step 1 above).
*Not a Phase 39 coding error in the dedup library* — the library behaves as designed. The gap is that the surface which must feed it does not collect the field it needs.

**D-39-02 — checklist wording defect, NOT an implementation defect. Step 4's "STACKED, never side by side, at both a wide window and a narrow one" contradicts the authoritative UI-SPEC.**
*Surface:* `39-17-PLAN.md` Task 3 step 4. UI-SPEC M-1 says, in as many words: *"At `sm` (640px) and up, the two options of a single field group **may** sit in a `grid gap-2 sm:grid-cols-2`. That is a two-up of one field's two options, not a two-column comparison of two records… Below `sm` the grid collapses to one column and the options stack."* The implementation does exactly that, and 39-15's source gate exists to forbid only the **unprefixed** `grid-cols-2`. The property M-1 actually protects — that every option carries its own record-name caption, so no header can scroll away — **holds**: each card's caption is the record's name. As written, step 4 would fail a correct implementation.

**D-39-03 — a hardcoded English field label on the merge screen in every locale.**
*Surface:* `/duplicates/[pairId]`, the "filled only on the other record" group. *Locale:* pt-BR **and** es-ES (and en-US, where it is invisible). *Viewport:* both 320px and 1280px.
Measured label sets: en-US `["Name","Website"]` + `["Notes"]`; pt-BR `["Nome","Website"]` + `["Notes"]`; es-ES `["Nombre","Sitio web"]` + `["Notes"]`. Cause: `notes` has **no entry in `AUDIT_FIELD_LABELS`** (`src/lib/audit/present.ts:89-108` lists 20 columns; `notes` is not among them), so `resolveLabel`'s `tRoot.has(...)` test fails and `humaniseColumn("notes")`'s English output is rendered verbatim. Root cause is a Phase 36 omission that Phase 39 is the first surface to **expose**, because `organizations.notes` is a dormant legacy column no other screen edits — UI-SPEC A-4/A-8 declares `present.ts` unchanged in this phase, so this was structurally invisible to every gate. Two candidate fixes, both needing a decision the verifier owns: add a 21st `audit.field.*` key (which collides with 39-04's `REQUIRED_AUDIT_KEYS` exact-set contract, the same blocker as the loser-timeline follow-up), or add `notes` to `MERGE_EXCLUDED_COLUMNS` on the grounds that asking a user to choose between two values of a dormant column is itself wrong.

**F-39-04 — the determinate progress bar is not exposed to assistive technology.**
*Surface:* `/duplicates` scan panel (and, identically, both importers). *Locale:* all. *Viewport:* all.
`src/components/ui/progress-bar.tsx` renders a `bg-muted` track containing a width-styled `bg-primary` div, with **no `role="progressbar"`, no `aria-valuenow`/`valuemin`/`valuemax` and no live region** — a DOM query for `[role="progressbar"]` found zero elements at every sample. Sighted users get 71% and `32,549 of 46,058 records compared`; a screen-reader user gets the numbers as static text that is never announced when it changes. **Inherited verbatim from the importer's bar by P-2's deliberate lift, so it is a pre-existing property rather than a Phase 39 regression** — recorded because this phase is the first to put the bar behind a 20-second wait where the announcement would matter.

**F-39-05 — the `merged` timeline entry is hidden by default.**
*Surface:* the survivor's record detail page. *Locale:* all. *Viewport:* all.
The entry renders correctly but only after `Show field changes (1)` is switched on. That OFF default is Phase 36's explicit decision (`audit-filter-toggle.tsx`: *"a sticky preference would hand an audit-dominated timeline to a user who once opened changes on a single deal — precisely the failure the OFF default exists to prevent"*), and the toggle does report `(1)` so nothing is silently lost. Recorded because SC-5 is phrased as *"the merge visible in the survivor's history"*, and a merge is arguably a structural event rather than a field change. A decision for the verifier, not a bug I would fix unasked.

**F-39-06 — `text-primary` is a near-invisible link affordance in dark mode.**
*Surface:* the pair card's two record names and the create-time warning's matched-record link. *Locale:* all. *Viewport:* all.
Measured: link colour `lab(90.952 0 0)` against body colour `lab(98.26 0 0)` — a 7-point lightness difference and no underline until hover. UI-SPEC § Color item 6 sanctions `text-primary hover:underline` for exactly these links, and the dark value it records **is** `oklch(0.922 0 0)`, so this is a consequence of the neutral palette rather than a coding error (light mode has the mirror problem: `oklch(0.205)` is near-black). The links **are** real anchors with real hrefs — verified `/organizations/817f3da8…`. Recorded so it is a known property rather than a surprise.

### Not performed, and why

- **The import flagged-rows notice (I-1) was not observed in dark mode.** Reaching `/import`'s confirm step or the Pipedrive progress step requires running a real import against the live database, which would create records the merge fixtures rule forbids and which the eight-step checklist does not ask for. UI-SPEC V-6's "four new surfaces" — the create-time warning, `/duplicates`, the merge screen and the `merged` audit entry — were all observed; the import notice is I-1's surface and remains **unobserved in dark mode**. Its geometry is covered by nothing in this plan either. Flagging it for the verifier.
- **No keyboard-only check was attempted.** The plan records that the `computer`-tool keyboard delivers zero key events in this environment; I drove Playwright instead, whose key input IS trusted, but the checklist asked for none and I added none.

### Row Counts — before, after, and what I created

| Table | Before | After | Note |
|---|---|---|---|
| `organizations` | 46,054 | **46,054** | +6 fixtures created, all 6 removed |
| `people` | 38,348 | **38,348** | +2 fixtures created, both removed |
| `deals` | 25,195 | **25,195** | +3 fixtures created, all 3 removed |
| `notes` | 75,236 | **75,236** | +3 fixtures created, all 3 removed |
| `audit_log` | 213 | **213** | every row my actions wrote belonged to a fixture entity and went with it |
| `duplicate_pairs` | 0 | **543** | **left deliberately** — real feature state from one real scan (405 likely + 139 certain, less the 1 fixture pair removed with its records) |
| `dedup_scans` | 0 | **1** | **left deliberately** — one `completed` organization scan |
| `app_settings` where `key like 'dedup%'` | 0 rows | **0 rows** | configured to `["CNPJ / CPF"]` during step 1, then **restored to the pre-plan state**. Re-enable it deliberately if you want to reproduce D-39-01; note that a rescan with it unset drops the certain tier and the list falls from 543 to ~405. |

Fixtures created and removed, explicitly: organizations `[UAT39] Transportadora Horizonte Ltda` (x2 — the second one created by the step-1 organization attempt), `[UAT39] Metalurgica Aurora Ltda`, `[UAT39] Metalurgica Aurora LTDA ME`, `[UAT39-L10N] Comercial Bandeirantes Ltda`, `[UAT39-L10N] Comercial Bandeirantes LTDA ME`; people `[UAT39] Marina Aurora Compras` (x2 — the second created by `Create anyway`); 3 `[UAT39]` deals; 3 `[UAT39]` notes; 2 fixture `duplicate_pairs` rows. Verified afterwards: 0 rows with either prefix in `organizations`, `people`, `deals`, `notes`, and **0 dangling pair rows**. The `[e2e] Merge Screen` fixtures from Task 2 are created and destroyed by the spec on every run and are likewise at 0.

---

## Decisions Made

See `key-decisions` in the frontmatter. The load-bearing one: **no assertion was weakened and no spec was edited to avoid a rebuild.** The single RED assertion was answered by fixing the layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The identity-fields save button overflowed a 320px viewport at es-ES**
- **Found during:** Task 1, by the assertion the task added
- **Issue:** `documentElement.scrollWidth` 312 vs `clientWidth` 305 on `/duplicates @ es-ES` only. `buttonVariants`' base carries `whitespace-nowrap` and `shrink-0`, and the default size a fixed `h-9`; es-ES's `identity.save` is a 255px unbreakable line in a 248px content box.
- **Fix:** `className="h-auto whitespace-normal"` on the `Button`, with the measurement and the reason `h-auto` is not optional recorded in a comment beside it.
- **Files modified:** `src/app/duplicates/identity-fields-form.tsx`
- **Verification:** rebuild 2, then 305/305 in all three locales on both the empty state and the populated 25-card list; full suite 29 passed.
- **Committed in:** `4f3f20b`

**2. [Rule 3 - Blocking, documentation] Two of the plan's grep criteria are unsatisfiable as written**
- **Found during:** Tasks 1 and 2
- **Issue (a):** `grep -c "ignoreDefaultArgs" playwright.config.ts = 1`. The real count is **2** and always has been — once in the DO-NOT-REMOVE comment that explains it, once in the code — exactly as STATE.md's 45-11 entry records ("`ignoreDefaultArgs` still at 2 occurrences"). Editing the config to make the number true would have deleted the comment that stops the flag being removed.
- **Issue (b):** `grep -ci "password" e2e/merge-screen-320.spec.ts = 0`, while the file must also state the never-inline-a-credential rule. **Sixth occurrence of this phase's grep-vs-comment trap** (after 39-08, 39-14, 39-16, 39-11, 39-15).
- **Fix:** (a) the criterion is recorded as stale and the config left untouched at 2. (b) the rule is worded with "credential" instead, and the paragraph says why in prose — the comment was **reworded, never deleted**, per the phase's recorded remedy.
- **Files modified:** `e2e/merge-screen-320.spec.ts` (comment only)
- **Verification:** `grep -ci "password" e2e/merge-screen-320.spec.ts` = **0**; `grep -c "ignoreDefaultArgs" playwright.config.ts` = 2, `git diff` on that file empty.
- **Committed in:** `4e53e91`

**3. [Rule 2 - Correctness, documentation] The viewport spec's prose said "six routes"**
- **Found during:** Task 1
- **Issue:** the plan said "Change nothing else in the file", but leaving the header and the `ROUTES` docblock saying **six** when there are **seven** is exactly the stale-comment drift this phase has been burned by five times.
- **Fix:** both counts corrected to seven, plus a note that `/duplicates` has no pre-existing UAT baseline (it did not exist in Phase 45) and that its anchor doubles as the one assertion that would notice the admin gate refusing the wrong people.
- **Files modified:** `e2e/viewport-320.spec.ts`
- **Verification:** 21 assertions, `22 passed`.
- **Committed in:** `21f7024`

**4. [Rule 4 territory, NOT auto-fixed] Three defects found by the visual pass were reported, not fixed**
D-39-01 (the organization warning is unreachable), D-39-03 (`notes` renders an English label in every locale) and F-39-05 (the `merged` entry is hidden by default) are all **out of this plan's scope** and each needs a decision this plan is not authorised to make: D-39-01 changes a create dialog's payload and possibly its fields; D-39-03 collides with 39-04's `REQUIRED_AUDIT_KEYS` exact-set contract (the same blocker as the already-tracked loser-timeline item) or else changes `MERGE_EXCLUDED_COLUMNS`; F-39-05 would override a Phase 36 default with a documented rationale. **Nothing was changed for any of them.** They are the verifier's to triage.

---

**Total deviations:** 3 auto-fixed (1 bug, 2 documentation/criteria), plus 3 findings deliberately NOT fixed.
**Impact on plan:** the one code fix is a real 320px defect the plan's own assertion existed to find. No scope creep, no dependency touched, no migration generated, no assertion weakened.

## Issues Encountered

- **Rebuild discipline.** 2 rebuilds against a 2-to-4 budget. Rebuild 1 brought waves 3-6 into the image (the container was 27 h stale and contained none of them) and made the es-ES overflow visible; rebuild 2 carried the fix. `/duplicates` answering **307** rather than 404 unauthenticated is what proved rebuild 1 picked up the phase before anything was measured.
- **Known-limitation checks, confirmed rather than re-reported.** Carry-forward #5's audit shape, #2's ~20 s scan timing (measured 20 s) and #3's 405 likely pairs (measured 405) all reproduced exactly. The `createScanState` non-atomicity (#7) and the loser-timeline empty `{name}` (#6) were **not** re-reported; the loser's row remains unreachable because the detail page filters `isNull(deletedAt)` before `notFound()`.
- **Measurement artifact, recorded not hidden.** The submit-row scroll probe returned an inconsistent y (883 -> 1036 across a disclosure reflow). The conclusive check — zero `sticky`/`fixed` ancestors at both widths — was used instead, and the artifact is written down rather than quietly dropped.
- **A `grep`-based h1 search initially missed `[pairId]/page.tsx`** (bracketed path); a second grep found both `h1` sites. Worth knowing before trusting a single grep over a Next.js dynamic-segment path.

## User Setup Required

None — no external service configuration. One local prerequisite is unchanged: `./node_modules/.bin/playwright install chromium` is a machine-local step (~300 MB into `~/.cache/ms-playwright`), which is what keeps CI from downloading browsers it never uses.

## Next Phase Readiness

- **The automated half of the phase gate is closed.** typecheck 0, lint 0, 2,674 + 8 + 22 unit/RSC/DB tests green, 29 Playwright assertions green, 0 FAIL rows in `dedup-checks.sql`, `ci.yml` byte-identical with zero occurrences of `playwright`.
- **The phase is NOT approved.** The visual pass is complete and reported; the accept/reject decision belongs to the human verifier, who now has one UAT-critical finding (D-39-01), one plan-text defect (D-39-02), one localization defect (D-39-03) and three recorded observations (F-39-04/05/06) to triage.
- `duplicate_pairs` holds 543 real open pairs and `dedup_scans` one completed scan — a genuinely populated review queue, which also means the one manual-only verification in 39-VALIDATION (reading 20 `likely` pairs and judging precision by eye) can now be performed without any further setup.

---
*Phase: 39-duplicate-detection-merge*
*Completed: 2026-08-19*

## Self-Check: PASSED

- `e2e/merge-screen-320.spec.ts` — FOUND
- `e2e/viewport-320.spec.ts` — FOUND
- `src/app/duplicates/identity-fields-form.tsx` — FOUND
- `.planning/phases/39-duplicate-detection-merge/39-17-SUMMARY.md` — FOUND
- commit `21f7024` — FOUND
- commit `4f3f20b` — FOUND
- commit `4e53e91` — FOUND
- `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` — 0 bytes of diff, untouched (the orchestrator owns those writes)
