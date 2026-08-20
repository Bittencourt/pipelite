# Phase 39 — Gap Closure Brief

**Source:** plan 39-17 Task 3, the `checkpoint:human-verify` visual pass (UI-SPEC V-6).
**Recorded:** 2026-08-19
**Authority:** the human verifier chose "gap-close D-39-01 + D-39-03 now"; all other findings are
deferred to the backlog and MUST NOT be planned here.

The checkpoint reported 7 of 8 steps observed-as-described. Two defects are in scope.

---

## GAP 1 — D-39-01: the organization create-time duplicate warning cannot fire from any surface

**Severity:** blocks phase success criterion 1 (SC-1) for the organization half.
**Requirement affected:** DEDUP-01. It is NOT yet satisfied and MUST NOT be marked complete until
this gap closes. (Plan 39-14 believed it closed DEDUP-01; the person half works, the organization
half is unobservable in the product.)

### Verified code trace (traced directly by the orchestrator, not taken on trust)

1. `src/lib/dedup/matching.ts` — `findCertainOrganizationMatches` returns `[]` unless
   `draftHasIdentityValue(input.customFields, identityFields)` passes.
2. `src/app/organizations/actions.ts:105` — forwards `data.customFields` into
   `certainMatchesOrNone`.
3. `src/app/organizations/organization-dialog.tsx` — contains ZERO references to `customFields` or
   `CustomField`. It collects `{name, website, industry}` and never sends any custom field value.

Therefore `draftHasIdentityValue` can never pass at create time, and the organization branch
returns `[]` for every submission — even when an admin HAS configured
`dedup.organization_identity_fields` via the `/duplicates` identity-fields form that plan 39-11
shipped. The 39-17 checkpoint confirmed this by observation as well as by trace.

### This is a design mismatch, not a loose wire

Organization identity is defined in terms of CUSTOM fields. Custom fields are only reachable on
DETAIL pages, through `CustomFieldsSection` inline-edit — i.e. strictly AFTER creation, by which
time the create-time check has already run and returned `[]`. The person branch works precisely
because person identity uses NATIVE columns (`people.email`, `phone`, `name`).

### The design is already LOCKED — this is not an open grey area

`39-CONTEXT.md` lines 102-112 lock it:

> **New rule: the organization identity key is ADMIN-CONFIGURABLE.** An admin setting names which
> custom field(s) act as identity keys, checked in order. This deployment will set CNPJ/CPF first,
> then contact email. [...] Rationale for configurability over hardcoding: custom field names are
> per-installation, and baking this install's Portuguese field names into the product would be
> wrong for every other deployment.

And the alternative direction is measurably dead: WITHOUT a custom-field discriminator, **70.7% of
organizations share a normalized name**, which yields **1,030,436 false "certain" pairs**. Native
columns cannot serve as organization identity in this data. So the fix direction is forced:
**the identity custom field(s) must be collectable at organization create time.**

### Scope decision (made by the orchestrator; constraints decide it — do not re-litigate)

Render ONLY the admin-configured identity fields in the create dialog. NOT all custom fields.
Reasons, both structural:
- FILE custom fields need an `entityId` to store under
  (`${UPLOAD_DIR}/${entityId}/${fieldName}/...`), and no id exists before the row is inserted.
- FORMULA custom fields are derived, not entered.

So "render every custom field at create time" is incoherent. The configured identity fields are
exactly the ones whose absence breaks SC-1, and they are text-shaped (CNPJ/CPF, contact email).

### Must hold when this gap closes

- With `dedup.organization_identity_fields` CONFIGURED, creating an organization whose configured
  identity value matches an existing organization shows the advisory, exactly as the person branch
  already does: inside the dialog, above the form, not red, nothing typed is lost, each match shows
  a name + a distinguishing value + a reason, and the submit button relabels to "Create anyway".
- With the setting UNCONFIGURED, behaviour is UNCHANGED — no warning, no new query, no error. This
  graceful degradation is locked in 39-CONTEXT and plan 39-08 built the fail-closed path
  deliberately. Do not turn absence-of-configuration into an error state.
- The second submit still carries `confirmDuplicate: true` and still skips the check (rule W-4 in
  `organizations/actions.ts`), or the user could never get past the warning.
- The importer path must not regress: 39-16 established that neither importer can supply an
  `importSessionId` that resolves to created records, and both live call sites use `{ recordIds }`.

---

## GAP 2 — D-39-03: the `notes` field label renders in English in every locale

**Severity:** real i18n leak on a shipped surface. Visible on the merge screen in pt-BR and es-ES.

`notes` has no entry in `AUDIT_FIELD_LABELS` (see `src/lib/audit/present.ts`, referenced from
`src/components/timeline/audit-entry.tsx:100`), so the merge screen falls back to the raw English
column word "Notes" in all three locales. The 39-17 checkpoint observed this at step 8 and
confirmed that NO raw dot-paths and no other untranslated `dedup.*` strings are present — this is
the single leak.

This is a PHASE 36 omission that the merge screen newly EXPOSED; the merge screen did not cause it.

### The constraint that makes this non-trivial

`src/messages/locale-parity.test.ts:866-868` asserts that the shipped audit key set equals
`REQUIRED_AUDIT_KEYS` EXACTLY, so adding a key fails the contract until the contract is updated in
the same change. Extend the pin deliberately and say so in the summary. Do NOT weaken the
exact-set assertion into a subset check to get around it — that assertion is what stops silent key
drift, and 39-04's locale contract is load-bearing.

Note the precedent for the shape of this fix: `deletedAt` is audited and deliberately has NO
`AUDIT_FIELD_LABELS` entry, with its reasoning recorded in `audit-entry.tsx:111` and defended by
`src/components/timeline/__tests__/deleted-at-wiring.test.ts`. Read both before choosing where the
`notes` decision lives, and follow the existing posture rather than inventing a second one.

---

## EXPLICITLY OUT OF SCOPE — deferred to backlog by the human verifier

Do NOT plan or fix any of these:
- **F-39-04** — `ProgressBar` has no `role="progressbar"`/`aria-valuenow`. Inherited from the
  importer via UI-SPEC P-2; pre-dates this phase.
- **F-39-06** — `text-primary` links measure `lab(90.952)` against a `lab(98.26)` body in dark
  mode, a near-invisible link affordance. App-wide, not phase-39-specific.
- **F-39-05** — the `merged` entry sits behind "Show field changes (1)". This is Phase 36's
  deliberate OFF-by-default and is working as designed.
- **D-39-02** — checklist step 4 in plan 39-17 says the records must be "STACKED ... at a wide
  window", which contradicts UI-SPEC M-1 permitting `sm:grid-cols-2` verbatim. This is a defect in
  the PLAN TEXT, not in the implementation. The code is correct. Fix nothing; the record here is
  the correction.
- **Scan-guard atomicity** — `createScanState`'s running-scan guard is read-then-write and so
  advisory rather than atomic. The airtight fix is a partial unique index on
  `dedup_scans (entity_type) WHERE status = 'running'` plus a `23505` catch rethrowing
  `SCAN_ALREADY_RUNNING`. Needs migration 0018. Deferred.
- **The loser's empty `{name}`** — the loser's own `merged` timeline row renders with an empty
  name; the fix needs a 5th and 6th `audit.entry.merged.*` key and would break 39-04's
  exactly-four pin. The row is currently unreachable (the detail page filters `isNull(deletedAt)`
  before `notFound()`). Deferred.

---

## Standing constraints for any gap plan in this phase

- Postgres at `localhost:5433` is the user's REAL dev database: organizations 46,054, people
  38,348, deals 25,195, notes 75,236, audit_log 213. NEVER `TRUNCATE`, `DROP` or `DELETE FROM` it.
  A separate `pipelite_dedup_test` database exists for destructive tests
  (`scripts/dedup-db-test-setup.sh`, plan 39-10). `duplicate_pairs` currently holds 543 rows and
  `dedup_scans` 1 — real feature state from one real scan, deliberately left in place.
- Do NOT run `shadcn add`: plan 39-15 found it silently bumps `radix-ui` `^1.4.3` → `^1.6.7` and
  rewrites ~1184 lines of `package-lock.json`. Change no dependency; run no `npm install`.
- Do NOT generate any drizzle migration. The journal ends at `idx: 17` and must stay there.
- The Docker image has NO volume mount, so UI changes are invisible to Playwright until
  `docker compose up -d --build app`.
- RAW-GREP ACCEPTANCE CRITERIA ARE A KNOWN TRAP IN THIS PHASE — hit five times (39-08, 39-14,
  39-16, 39-11, 39-15). A grep gate gets tripped by the comment that explains it, and deleting the
  comment also passes, which is the wrong fix. Prefer criteria that assert CALL SITES or parsed
  structure over raw token counts; where a raw grep is unavoidable, say what the intent is.
- Negative proofs must be RUN, not reasoned about. Plan 39-13 discovered its poll gate stayed GREEN
  when the defect was introduced, because the assertion was satisfied by unrelated code — the gate
  was blind to the exact defect it existed to prevent. That was found only by running it.
