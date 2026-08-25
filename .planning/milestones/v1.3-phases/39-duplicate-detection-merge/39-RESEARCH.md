---
phase: 39
slug: duplicate-detection-merge
researched: 2026-08-19
domain: Postgres fuzzy matching at scale, transactional record merge, background jobs in Next.js
confidence: HIGH (every scale claim measured against the live database this session)
---

# Phase 39: Duplicate Detection & Merge — Research

**Researched:** 2026-08-19
**Domain:** Postgres trigram/blocking-based entity resolution; single-transaction polymorphic record merge; Next.js background job with progress
**Confidence:** HIGH — the load-bearing numbers were measured against the live Docker Postgres (46,054 organizations, 38,348 people), not estimated. All probe artifacts were dropped afterwards; `\dx` shows `plpgsql` only and `organizations` is byte-identical to its pre-research shape.

---

## Summary

Three of this phase's design assumptions do not survive contact with the live data, and one of them is a locked decision. **Organizations have no website data at all — the `website` column is NULL on all 46,054 rows** `[VERIFIED: live DB]`, so the locked *certain* tier for organizations ("identical normalized name + identical domain") can never fire on this deployment. Separately, **70.7% of organizations share a normalized name with at least one other organization** `[VERIFIED: live DB]` — and inspection shows these are mostly *genuine* duplicates from a broken import (634 byte-identical "MITRA ARQUIEPISCOPAL DO RIO DE JANEIRO" rows sharing 5 distinct emails between them), not distinct branches. The feature is badly needed; the matching rule as locked would either fire on nothing (with the domain conjunct) or on a million pairs (without it).

The scale problem has a clean, measured solution that the CONTEXT did not anticipate. The dominant cost is not similarity computation — it is **clique expansion**. Running the trigram self-join over *rows* produces 27,156 near-match pairs in 67 seconds; running the identical join over the 21,503 *distinct normalized names* produces **419 pairs in 18.2 seconds** `[VERIFIED: EXPLAIN ANALYZE + wall clock]`. Combined with star (canonical-representative) pairing for exact-name groups — 24,551 pairs instead of 1,030,436 — the whole scan lands at roughly **20 seconds and ~25,000 persisted pairs**, versus the ~26 minutes and ~14.5 million pairs a naive row-level trigram join at the default threshold costs `[VERIFIED: measured on a 500-row sample and extrapolated]`.

The merge side is in much better shape than the matching side. `purgeOrganizationMutation` (`src/lib/mutations/organizations.ts:544-640`) is a shipped, working, single-transaction, multi-child, in-transaction-audit mutation and is a near-exact template for the merge. The heaviest organization in the database carries **114 child rows total** `[VERIFIED: live DB]`, so a single transaction is not merely feasible, it is trivially small — **M-8 is confirmed with numbers, not conceded.** Two landmines sit in that path: a partial unique index (`notes_migration_uniq`) that will abort roughly 40% of organization merges unless handled explicitly, and the fact that `AuditAction` is declared in **two** files (the UI-SPEC's A-1 says one), making the new `merged` literal a four-file compile cascade that Phase 37 explicitly chose to avoid.

**Primary recommendation:** Build the matching layer on a **STORED generated column** holding an IMMUTABLE-wrapped normalized name, indexed with GIN `gin_trgm_ops` plus a plain btree; drive the scan from a **distinct-name group table**, not from rows; emit **star pairs** against each group's canonical record. Renegotiate the organization *certain* tier before planning — the locked one cannot fire. Build the merge as a direct copy of `purgeOrganizationMutation`'s transaction shape, with explicit handling for the migration-note unique index.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Matching Strategy at Scale**
- **Fuzzy matching runs in Postgres via `pg_trgm`**, installed by migration with a GIN index on the compared expressions. `pg_trgm`, `fuzzystrmatch` and `unaccent` are all *available but not installed* in this database (verified). Rationale: this is not a preference, it is a scale constraint — 46,054 organizations compared pairwise is ~2.1 billion comparisons and cannot happen inside a request or in application memory.
- **Block first, compare within blocks.** Candidate pairs must share a cheap blocking key (normalized first significant token of the name, or email domain) before any similarity function runs. A trigram index alone still degrades badly on this dataset because it is full of shared prefixes ("CONDOMINIO …", "COND DO ED …", "SUPERMERCADO …" all appear many times in the live data).
- **Compared fields.** Organization: normalized name plus website domain. Person: email as an exact match first, then normalized name plus phone. Name-only matching is explicitly rejected — the live organization table has heavy shared prefixes and would produce an unusable false-positive rate.
- **Two confidence tiers, not one threshold.** *Certain* = identical email, or identical normalized name + identical domain. *Likely* = above the similarity threshold. Only *certain* matches are surfaced at create time; *likely* matches belong to the scan. A single flat threshold would leave nothing trustworthy enough to interrupt a user mid-create.

**Create-Time Warning**
- **Fires server-side on submit, before the insert commits.** Not on field blur. A client-side blur check is bypassable and — decisively — the importer never blurs anything, so a client-only check cannot cover the phase goal's stated duplicate source.
- **Advisory, never blocking.** Show the matches and require an explicit "create anyway". A user with legitimate knowledge (two genuinely distinct companies sharing a name) must be able to proceed.
- **Three actions offered: open the existing record, create anyway, cancel.** Deliberately NOT "merge now" — merging an unsaved draft into an existing record is a different operation with no losing record to trash and no field history to reconcile. Keep merge to two persisted records.
- **The importer gets a report, not a prompt.** An import of thousands of rows cannot stop for each match. Matched rows are flagged in the import summary and the user runs a scan afterwards.

**On-Demand Scan**
- **Runs as a background job with progress**, not inside the HTTP request.
- **Results are persisted** in a `duplicate_pairs` table.
- **A pair can be dismissed as "not a duplicate", and the dismissal sticks** across future scans. This is a functional requirement, not a nicety.
- **Scan scope is a whole entity type, one type at a time.**

**Merge Semantics**
- **The losing record is soft-deleted to Trash, attributed to the user who merged.**
- **The field picker pre-selects the survivor's value, except where the survivor's is empty and the loser's is not.**
- **File blobs stay where they are; the survivor's field reference keeps the loser's id in the path.** The download route must therefore resolve the stored path rather than assuming it matches the record being viewed.
- **Audit shape:** one explicit `merged` entry on the survivor naming the losing record and the field choices made, alongside the normal per-field diff; the loser gets its usual `deleted` entry.

### Claude's Discretion

- The exact similarity threshold value, and whether it is a constant or an app setting.
- The normalization function's specifics (case folding, accent stripping via `unaccent`, punctuation and legal-suffix handling such as LTDA / ME / S.A.).
- The `duplicate_pairs` table's exact columns and how dismissal is represented (a status column versus a separate dismissals table).
- Background job mechanism — whether it reuses any existing worker/processor pattern in the repo or introduces a minimal one.
- Merge UI layout (side-by-side columns versus a stacked field list). **[Already resolved by 39-UI-SPEC rule M-1: stacked field list.]**

### Deferred Ideas (OUT OF SCOPE)

- Automatic/unattended merging of high-confidence pairs.
- Deduplication of deals and activities.
- Cross-entity-type matching.
- Relocating file blobs to the survivor's path.
- Any redesign of the Pipedrive importer's field mapping.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEDUP-01 | User is warned of likely duplicates when creating an organization or person, and can scan an entity type for existing duplicates on demand | § Matching Layer (normalization function, generated column, index, certain/likely tiers); § Blocker B1 (the organization certain tier must be redefined); § Background Job Mechanism (the scan) |
| DEDUP-02 | User can merge two records, choosing the winning value per conflicting field | § The Merge Transaction; § Default-Selection Rule; 39-UI-SPEC M-1..M-9 |
| DEDUP-03 | Merging reassigns all child records (deals, activities, notes, files, custom field values) to the surviving record rather than orphaning them | § Exhaustive Child Inventory (verified against `pg_constraint` + `information_schema`); § Blocker B4 (`notes_migration_uniq`); § Files and Custom Fields |

---

## Project Constraints (from CLAUDE.md / memory)

There is no `./CLAUDE.md` in this repo `[VERIFIED: ls]`. The binding operational constraints come from project memory and are non-negotiable:

| Constraint | Consequence for this phase |
|------------|---------------------------|
| **Docker only.** `docker compose up -d`. `docker` needs **no** `sudo`. App at `http://localhost:3001`, Postgres at `localhost:5433`. | Never `npm run dev`. Never embed a password in a command. |
| **Never pass a sudo password.** | Any task needing elevation must ask the user to run it via `! <command>`. |
| Tests / typecheck / lint run on the HOST: `npm run test`, `npm run typecheck`, `npm run lint`. | Wave gates run on the host, e2e runs against Docker. |
| Migrations: `npx drizzle-kit migrate` against `localhost:5433`. **Also auto-applied at container start** — `docker compose logs app` shows `applying migrations... migrations applied successfully` `[VERIFIED]`. | The `pg_trgm` migration will run unattended on `docker compose up -d --build`. |
| The Docker image has **no volume mount** — source changes need `docker compose up -d --build` before Playwright sees them. | Every e2e task must rebuild first. |
| `.planning` is gitignored but tracked — the GSD commit helper fails; force-add individual files. | `git add -f .planning/phases/39-duplicate-detection-merge/39-RESEARCH.md` |

**No project skills directory exists** (`.claude/skills/`, `.agents/skills/` both absent) `[VERIFIED: ls]`.

---

## BLOCKERS — decisions the plan cannot make silently

These five items each contradict something written in CONTEXT.md or 39-UI-SPEC.md. They are stated first because the planner must resolve them before writing tasks, and three of them touch **locked** decisions, which means they belong in front of the user rather than being quietly designed around.

### B1 — The organization *certain* tier cannot fire. `website` is NULL on 100% of rows.

```
 nulls | empties
-------+---------
 46054 |       0
```
`[VERIFIED: live DB, 2026-08-19]`

The locked rule is *certain* = "identical normalized name + identical domain". There is no domain on any organization, and none is being collected — `organization-dialog.tsx` has a website field but the 46,054 imported rows have nothing in it. Therefore:

- With the domain conjunct: **zero** organization create-time warnings, ever. DEDUP-01's first half is dead on arrival for organizations.
- Without the domain conjunct (name alone): **1,030,436 certain pairs** `[VERIFIED: measured]`, i.e. the warning fires on ~70% of organization creates.

**What discriminators actually exist**, measured across the organization `custom_fields` JSONB:

| Custom field | Rows populated | Coverage | Suitability |
|---|---|---|---|
| `E-mail de Contato 1` | 25,533 | 55.4% | Good — a real contact identity |
| `Telefone de Contato 1` | 24,265 | 52.7% | Good |
| `CNPJ / CPF` | 5,312 | 11.5% | **Strongest** — a legally unique Brazilian company registration number. 15 organizations already share one CNPJ. |
| `Segmento Organização` | 6,279 | 13.6% | Useless as a discriminator (a category) |

`[VERIFIED: live DB]`

**The tension the planner must resolve, not paper over:** these field *names* are deployment-specific. `custom_field_definitions` shows they were created by the Pipedrive import with Portuguese human labels, and `customFields` is keyed by that label, not by the definition id `[VERIFIED]`. Hardcoding `'CNPJ / CPF'` makes the feature work on this deployment and nowhere else, in a product that ships as a general CRM.

Three viable resolutions, in the order I would recommend them:

1. **An admin setting naming the identity field per entity type** (`app_settings` already exists as a table). *Certain* = identical normalized name **AND** identical non-empty value of the configured identity field; falls back to name-only-is-not-certain when unconfigured. Generic, honest, and it makes the 5,312 CNPJ rows immediately useful.
2. **Widen the certain conjunct to "name + any one non-empty shared discriminator among {website, and the entity's own native email/phone if present}"** — for organizations this still yields nothing, because organizations have no native email or phone columns `[VERIFIED: `\d organizations`]`.
3. **Accept that organizations have no create-time certain tier**, and satisfy DEDUP-01's warning half for **people only** (where it works well — see B2). Document it. This is the smallest plan but it visibly under-delivers success criterion 1.

**This must go back to the user.** It is a locked decision invalidated by the data, not a discretion item.

### B2 — Person email matching must reject sentinel values, or it fires on garbage

Exact-email grouping over people, unfiltered:

```
 groups | rows | pairs | biggest
--------+------+-------+---------
   2879 | 6695 | 28032 |     212
```

The largest group is 212 people whose email is literally `#`. Next: `-` (25), `teste@gmail.com` (23), `teste@teste.com` (16). One junk value alone contributes 22,366 of the 28,032 pairs (80%).

Requiring a syntactically valid address (`email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'`):

```
 groups | rows | pairs | biggest
--------+------+-------+---------
   2865 | 6429 |  5338 |      23
```

`[VERIFIED: live DB]`

**5,338 pairs, max group 23 — this is a genuinely usable certain tier and it delivers DEDUP-01 for people.** The format predicate is not defensive polish; it is a 5.25× precision improvement and the difference between the feature working and the feature being switched off by its first user. A separate sentinel denylist (`teste@teste.com`, `teste@gmail.com`) is optional refinement on top.

The same problem exists for person names: the normalized name `"nao encotrado"` appears 559 times, and single-first-name rows (`"marcelo"` ×78, `"eduardo"` ×71) are common `[VERIFIED]`. A person name-based tier needs a minimum-token / minimum-length guard.

### B3 — `AuditAction` is declared **twice**, not once. The UI-SPEC's A-1 is factually wrong.

39-UI-SPEC A-1: *"`AuditAction` in `src/lib/timeline/types.ts:105` gains a fourth member… It is declared in exactly one place today; keep it that way."*

Reality `[VERIFIED: grep across `src/`]`:

| # | Site | What breaks |
|---|------|-------------|
| 1 | `src/db/schema/audit-log.ts:23` | `export type AuditAction = "created" \| "updated" \| "deleted"` — the column's `$type<>`. Without this, `tx.insert(auditLog).values({ action: "merged" })` does not typecheck. |
| 2 | `src/lib/timeline/types.ts:105` | The second declaration, the one A-1 names. |
| 3 | `src/app/workflows/[id]/runs/[runId]/components/run-changed-records.tsx:54` | `const ACTION_BADGE_VARIANT: Record<AuditAction, "outline" \| "secondary">` — **exhaustive**, fails to compile without a `merged` entry. |
| 4 | `src/lib/audit/linked-records.ts:40` | `const ACTION_RANK: Record<AuditAction, number>` — **exhaustive**, and its precedence comment ("deleted > created > updated") must be extended to say where `merged` ranks. |

`src/lib/audit/present.ts:463` also takes `action: AuditAction` (non-exhaustive, no change needed).

This is not a surprise to the codebase — Phase 37 wrote it down and deliberately avoided it:

> `src/lib/mutations/organizations.ts:188-190`: *"`action` stays `"deleted"` deliberately. A fourth `AuditAction` literal would be a four-file compile cascade: the type is declared TWICE (`db/schema/audit-log.ts` and `lib/timeline/types.ts`) and consumed by two exhaustive `Record<AuditAction, …>` maps."*

Phase 39 is choosing to pay that cost (A-1 mandates it, and unlike a purge marker a `merged` entry genuinely needs a distinct predicate). **The plan must budget all four sites plus a decision on `merged`'s rank in `ACTION_RANK`.** Recommendation: rank `merged` at 2 alongside `deleted` on the loser's side is wrong — a `merged` row is written on the **survivor**, which is alive, so rank it **1.5-equivalent**, i.e. above `created`, below `deleted`. State it explicitly; the map is exhaustive and someone must choose.

### B4 — `notes_migration_uniq` will abort roughly 40% of organization merges

`src/db/schema/notes.ts:42-44`:
```sql
uniqueIndex('notes_migration_uniq') ON (entity_type, entity_id) WHERE source = 'migration'
```

Its own comment: *"This is a permanent database invariant, not a one-shot script guard… it keeps a re-run of the legacy-notes migration from inserting duplicate rows, forever, on every deployment (T-35-11)."* So the merge **may not drop it**.

Measured `[VERIFIED: live DB]`:

| entity_type | source | rows |
|---|---|---|
| organization | migration | **29,037** |
| activity | migration | 46,198 |
| deal | user | 1 |

**29,037 of 46,054 organizations (63%) carry a `source='migration'` note.** A naive `UPDATE notes SET entity_id = <survivor> WHERE entity_type='organization' AND entity_id=<loser>` violates the partial unique index whenever both records have one — which, if independent, is ~40% of merges, and is very likely *higher* among actual duplicate pairs since they were created by the same import.

The failure mode is the worst possible one: a `23505 unique_violation` raised at the notes UPDATE **aborts the entire merge transaction**, so the user sees a bare `dedup.merge.failed` toast with no explanation, deterministically, for most organization merges.

Three resolutions (all fit inside the "`duplicate_pairs` columns are Claude's discretion" spirit — this is merge mechanics, not a locked decision):

1. **Demote the loser's migration note to `source='user'` when the survivor already has one.** Single statement, no data loss, the note stays on the survivor's timeline, and the invariant holds (one migration note per entity). Downside: it silently reclassifies a migrated note as user-authored, which is the exact distinction D-09 introduced `source` to preserve.
2. **Concatenate:** append the loser's migration-note content to the survivor's migration note, and soft-delete the loser's. Preserves the invariant and the classification; loses the loser's note as a distinct row.
3. **Conditional reassignment:** move the loser's migration note only when the survivor has none; otherwise soft-delete it (it lands in no trash UI, since notes have no trash tab). Simplest, but it destroys content.

**Recommendation: (1).** It is the only option that loses nothing, and the `source` reclassification can be recorded in the merge's audit `changes` map so it is not silent.

Whatever is chosen, the notes step must be written to be *provably* collision-free — a `WHERE NOT EXISTS` guard or an explicit pre-check inside the transaction — because the polymorphic table has no FK and nothing else will catch it.

### B5 — The file download route needs **no** change. CONTEXT assumed otherwise.

CONTEXT.md states: *"The download route must therefore resolve the stored path rather than assuming it matches the record being viewed."*

It already does `[VERIFIED: source read]`:

- `src/app/api/upload/route.ts:100` stores `publicUrl = \`/api/files/${entityId}/${fieldName}/${storedName}\`` **into the custom field value itself**.
- `src/components/custom-fields/file-field.tsx:169` opens `file.publicUrl` verbatim.
- `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts:71` resolves `path.resolve(UPLOAD_DIR, entityId, fieldName, filename)` from the **URL path**, never from a database lookup of the record being viewed.

So moving a file custom field's value from loser to survivor carries the loser's `entityId` inside the stored URL, and the download resolves correctly with zero code change. **This removes a task from the plan.** Do not "fix" the route.

(Two related notes, both out of scope but worth the planner knowing: the DELETE handler on the same route means deleting a merged-in file from the survivor removes the blob at the loser's path — correct. And a file uploaded to the survivor *after* the merge lands under the survivor's id, so one field can legitimately hold files under two entity ids — also correct, and invisible because the URL is stored.)

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Name/email normalization | **Database (IMMUTABLE SQL function + STORED generated column)** | `src/lib/dedup/normalize.ts` mirror for unit tests | The index must be built on the exact expression the query uses, or it is silently unused. One canonical definition lives in SQL; a TS mirror exists only so pure-function tests can run without a database, guarded by a parity test (the `buildClientFieldValues`/`buildFormulaFieldValues` precedent, STATE.md Phase 44). |
| Candidate generation (blocking + similarity) | **Database** | — | 46,054 rows cannot be compared in Node. Measured: the whole scan is one SQL statement family. |
| Scan orchestration, progress, cancellation | **API / server action + `dedup_scans` row** | — | Mirrors `import_sessions` exactly. |
| Scan progress display | **Browser (client poll)** | — | `progress-step.tsx:26-46` precedent (P-3). |
| Create-time duplicate check | **API / server action, inside `createOrganization`/`createPerson`** | — | Locked: server-side on submit. A client blur check cannot cover the importer. |
| Pair list + dismissal | **Frontend server (RSC) for reads, server action for writes** | Browser for transitions/toasts | The `/trash` pattern verbatim (L-1). |
| Merge execution | **API / server action → `src/lib/mutations/` → one `db.transaction`** | — | `purgeOrganizationMutation` is the template. |
| Merge field-default resolution | **`src/lib/dedup/` pure function** | Browser renders it | V-4 requires it be unit-testable; the repo has no jsdom. |
| Formula recalculation after merge | **API / server action, AFTER commit** | — | `recalculateFormulas` uses module-level `db`, not `tx` — it cannot participate in the transaction. |
| Audit rows for the merge | **Database, inside the transaction (`tx.insert(auditLog)`)** | — | The bus subscriber writes with module-level `db`, fire-and-forget, outside any transaction. |

---

## Standard Stack

**No new npm package is required by this phase.** `radio-group` is a shadcn *source* block whose only dependency is `radix-ui@^1.4.3`, already installed `[CITED: 39-UI-SPEC § Registry Safety, `./node_modules/.bin/shadcn view radio-group` run 2026-08-18]`.

### Core (all already present)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg_trgm` (Postgres extension) | **1.6** available | Trigram similarity + GIN index | The only mechanism in this stack that makes 46k×46k tractable. `[VERIFIED: pg_available_extension_versions]` |
| `unaccent` (Postgres extension) | **1.1** available | Accent folding for pt-BR names | 2,784 organizations (6.0%) and 2,896 people (7.6%) carry accents, and the *same* company appears both accented and unaccented — that IS the duplicate signal. `[VERIFIED]` |
| `drizzle-orm` | ^0.45.1 | Schema, migrations, `db.transaction` | Already the repo's DB layer; `db.transaction` is used in 6 places today. `[VERIFIED: package.json, grep]` |
| `postgres` (postgres.js) | ^3.4.8 | Driver | Existing. Supports transactions used by the 6 sites. |
| `radix-ui` | ^1.4.3 | `RadioGroup` for M-1 | Already installed; the unified import (K-5). |
| PostgreSQL | **16.13** | — | `[VERIFIED: select version()]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_trgm` GIN | `fuzzystrmatch` (`levenshtein`, `soundex`, `metaphone`) | `levenshtein` has **no index support** — it is a per-row function, so it cannot generate candidates, only score them after blocking. `soundex`/`metaphone` are English-phonetics and are actively wrong for Portuguese. Available if the plan wants a *secondary* scoring pass over an already-small candidate set. |
| GIN `gin_trgm_ops` | GiST `gist_trgm_ops` | GiST supports `<->` distance ordering (KNN), GIN does not. GIN is faster for the containment/`%` predicate this phase needs, and 3.8 MB vs. a larger, slower-to-build GiST. Choose GIN. |
| Postgres-side matching | `src/lib/import/fuzzy-match.ts` (existing, in-memory Levenshtein) | **Do not use.** See § Don't Hand-Roll. It is O(n·m²) in Node over an array of every organization. |
| A new job runner | `import_sessions` + fire-and-forget server action, or the `execution-processor` polling pattern | Both already exist in this repo. See § Background Job Mechanism. |

**Installation:** none. The migration installs extensions:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

**Superuser question, answered:** `pipelite` has `rolsuper = t` `[VERIFIED: pg_roles]`, and both extensions are marked **trusted** (`pg_available_extension_versions.trusted = t`) `[VERIFIED]`, so even a non-superuser database owner could install them on PG16. **The migration runs unattended in the container.** Docker logs confirm migrations auto-apply at boot `[VERIFIED: `docker compose logs app`]`.

---

## Package Legitimacy Audit

This phase installs **no external packages**. The audit below covers the existing dependencies the phase leans on, scanned this session.

| Package | Registry | Source Repo | slopcheck | Disposition |
|---------|----------|-------------|-----------|-------------|
| `radix-ui` | npm | radix-ui/primitives | `[OK]` | Approved — already installed, no version change |
| `drizzle-orm` | npm | drizzle-team/drizzle-orm | `[OK]` | Approved — already installed |
| `lucide-react` | npm | lucide-icons/lucide | `[OK]` | Approved — already installed |
| `vitest` | npm | vitest-dev/vitest | `[SUS]` "suspiciously close to `vite`" | **False positive.** It is the repo's incumbent test runner (2,224 passing tests, `package.json` devDependency since before this phase). No action. |

`slopcheck scan package.json` → **55 OK, 1 SUS, 0 SLOP** across 56 packages `[VERIFIED: run 2026-08-19]`.

**Packages removed due to `[SLOP]`:** none.
**Packages flagged `[SUS]`:** `vitest` — dismissed as a known-good incumbent, no checkpoint needed.

> ⚠️ **Tooling pitfall discovered this session, for the executor's benefit:** `slopcheck install <pkg>` *actually installs* — it modified `package.json` and `package-lock.json` (592 insertions / 594 deletions) before I reverted with `git checkout --` and `npm ci`. **Use `slopcheck scan <file>`, never `slopcheck install`, inside this repo.**

---

## The Matching Layer

### 1. Normalization must be IMMUTABLE, and `unaccent` is not

`unaccent(text)` and `unaccent(regdictionary, text)` are both **STABLE**, not IMMUTABLE `[VERIFIED: pg_proc.provolatile = 's']`. Postgres therefore rejects any index built on them. Proven empirically this session:

```
postgres=# CREATE INDEX test_bad_idx ON organizations
             USING gin (unaccent(lower(name)) gin_trgm_ops);
ERROR:  functions in index expression must be marked IMMUTABLE
```
`[VERIFIED: live DB]`

This is the classic failure the research brief warned about — and it is worth noting that it fails **loudly**, not silently. The silent variant of this failure is different and still live: *if the query's normalization expression differs by even one character from the index's, the index is not used and nothing errors.* That is the case a plan must EXPLAIN-verify.

The standard remedy is an IMMUTABLE wrapper, schema-qualified so a restricted `search_path` cannot repoint it:

```sql
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
```
`[CITED: PostgreSQL docs — unaccent is STABLE because it depends on a text-search dictionary; the IMMUTABLE-wrapper pattern is the documented workaround]` `[VERIFIED: created and used successfully this session]`

**Honest caveat, which the plan should record in the migration's comment:** marking a STABLE function IMMUTABLE is a declaration the database trusts and does not check. If the `unaccent` dictionary file ever changes, existing index entries become stale and the index is silently wrong. This is universally accepted practice for exactly this use case, and the dictionary is fixed for a given Postgres image — but it is a lie told deliberately, and deliberate lies belong in comments.

`upper`, `lower`, `btrim`, `regexp_replace`, `translate` and `similarity` are all already IMMUTABLE `[VERIFIED: pg_proc]`, so the rest of the chain composes.

### 2. The normalization function

Working definition, exercised against the live data this session:

```sql
CREATE OR REPLACE FUNCTION public.dedup_norm_org(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
SELECT btrim(regexp_replace(
  regexp_replace(
    regexp_replace(lower(public.immutable_unaccent(coalesce($1,''))),
                   '[^a-z0-9]+', ' ', 'g'),
    '\m(ltda|me|epp|eireli|sa|cia|mei)\M', ' ', 'g'),
  '\s+', ' ', 'g'))
$$;
```

Measured output `[VERIFIED]`:

| Input | Output |
|---|---|
| `COGUMELO INDUSTRIA E COMERCIO LTDA` | `cogumelo industria e comercio` |
| `AUTO POSTO MR DA TAQUARA LTDA ME` | `auto posto mr da taquara` |
| `Condomínio do Edifício Internacional RIo` | `condominio do edificio internacional rio` |
| `Ramada Hotel & Suítes Recife Boa viagem` | `ramada hotel suites recife boa viagem` |

**Legal-suffix prevalence: 16,763 organizations (36.4%) carry one** `[VERIFIED]`, so this step is load-bearing, not cosmetic.

**Design warnings for the plan:**
- My probe version also stripped standalone `s` and `a`. **Do not ship that** — `a` is a Portuguese article and a legitimate token; stripping it changes `casa a casa` into `cas`-adjacent nonsense. The version above drops them.
- `sa` strips `S.A.` correctly *after* punctuation removal (`S.A.` → `s a` → needs a two-token rule, or normalize `s a` → `sa` first). **The plan must decide the ordering explicitly and test it** — `UNIAO DE LOJAS LEADER S A` appears in the live data and is a real case `[VERIFIED: appears in the 0.85 sample]`.
- 9 of 46,054 organizations produce no token of length ≥ 3 `[VERIFIED]`. An empty normalized name must never match another empty normalized name — guard with `length(norm) >= 3` on both sides of every comparison, or those 9 rows become a clique.
- **A TypeScript mirror is needed** for the create-time path? **No — it is not.** The create-time check should run the *same SQL function* via a parameterized query, not reimplement it in TS. A TS mirror is needed only if a pure unit test wants to assert normalization behaviour without a database; if so, guard it with a parity test the way Phase 44 guards `buildClientFieldValues` against `buildFormulaFieldValues` `[CITED: STATE.md Phase 44]`.

### 3. Materialize the normalized value — measured 5× faster

Two index strategies were measured against the identical query. The difference is not marginal.

| Strategy | Index build | Index size | 500-row self-join @ 0.85 | Heap blocks touched |
|---|---|---|---|---|
| Expression index on `dedup_norm_org(name)` | 1.87 s | 3800 kB | 1.57 s | **207,765** |
| **STORED generated column + GIN on the plain column** | 0.48 s (+2.39 s for the `ALTER TABLE`) | 3832 kB | **1.27 s** | **6,472** |

`[VERIFIED: `\timing`, `EXPLAIN (ANALYZE, BUFFERS)`]`

The 32× reduction in heap blocks is the whole story: with an expression index, Postgres re-evaluates the normalization function on every row of the **bitmap recheck**. With a stored column it reads a value. The gap widens as the candidate set grows.

```sql
ALTER TABLE organizations
  ADD COLUMN norm_name text
  GENERATED ALWAYS AS (public.dedup_norm_org(name)) STORED;      -- 2.39 s

CREATE INDEX org_norm_trgm_idx  ON organizations USING gin (norm_name gin_trgm_ops)
  WHERE deleted_at IS NULL;                                       -- 0.48 s
CREATE INDEX org_norm_btree_idx ON organizations (norm_name)
  WHERE deleted_at IS NULL;                                       -- 0.13 s
```

**Total migration cost for organizations: ~3 seconds** `[VERIFIED]`. The `ALTER TABLE` takes an ACCESS EXCLUSIVE lock and rewrites the table; at 46k rows / 13 MB this is 2.4 s and entirely acceptable for a container-boot migration. The btree index serves the exact-match (*certain*) tier and the create-time check; the GIN index serves the fuzzy (*likely*) tier.

**Drizzle support:** Drizzle ORM supports `.generatedAlwaysAs(sql\`...\`, { mode: "stored" })` on pg columns. `[ASSUMED — from training knowledge of drizzle-orm's pg-core API; the repo has no existing generated column to copy.]` **The plan should verify this against the installed `drizzle-orm@0.45.1` typings before committing to it, and fall back to a hand-written SQL migration + a `text()` column marked in the schema if the builder is unavailable.** `drizzle-kit generate` producing the right DDL for a generated column with a custom function is the specific risk.

### 4. The scan: drive it from distinct names, not from rows

This is the finding that turns the phase from "a 26-minute job producing millions of unusable pairs" into "a 20-second job producing a reviewable backlog".

**Measured, full table, organizations (46,054 rows):**

| Approach | Threshold | Wall clock | Pairs produced |
|---|---|---|---|
| Row self-join, expression index | 0.30 (default) | **~26 min** (extrapolated from 16.9 s / 500 rows) | **~14.5 M** (extrapolated from 157,763 / 500 rows) |
| Row self-join, generated column | 0.75 | 80.0 s | 44,522 |
| Row self-join, generated column | 0.85 | 67.1 s | 27,156 |
| Row self-join, generated column | 0.92 | 62.5 s | 1,474 |
| **Distinct-name self-join, generated column** | **0.85** | **18.2 s** | **419** |

`[VERIFIED: all rows measured this session; the 0.30 row is extrapolated from a measured 500-row sample and is labelled as such]`

The 27,156 → 419 collapse (65×) is **not** a precision change — it is the same pairs with clique cross-products removed. Sampling the 0.85–0.92 band shows why:

```
0.914 | IGREJA EVANGELICA ASSEMBLEIA DE DEUS | IGREJA EVANGELICA ASSEMBLEIA DE
0.914 | IGREJA EVANGELICA ASSEMBLEIA DE DEUS | IGREJA EVANGELICA ASSEMBLEIA DE
0.914 | IGREJA EVANGELICA ASSEMBLEIA DE DEUS | IGREJA EVANGELICA ASSEMBLEIA DE
0.872 | ASSOC DA UNIAO ESTE BRAS DOS ADVENTISTAS | ASSOC DA UNIAO E BRAS DOS ADVENTISTAS
0.875 | UNIAO DE LOJAS LEADER S A | UNIAO DE LOJAS LEADER S A EM
```

Group A has 216 members, group B has N — the row-level join emits 216×N identical-looking pairs. The name-level join emits **one**. (The match quality in this band is excellent, incidentally: these are all genuine truncation/typo variants. 0.85 is a defensible threshold.)

**The recommended scan, in three statements:**

```sql
-- 1. Group table. 21,503 rows for organizations, 26,425 for people. ~0.4 s.
CREATE TEMP TABLE scan_groups AS
SELECT norm_name, min(id) AS canonical_id, count(*) AS n
FROM organizations WHERE deleted_at IS NULL AND length(norm_name) >= 3
GROUP BY 1;
CREATE INDEX ON scan_groups USING gin (norm_name gin_trgm_ops);
ANALYZE scan_groups;

-- 2. CERTAIN tier: star pairs inside each exact-name group. Sub-second.
--    Every non-canonical member pairs with the canonical one: n-1 pairs, not n(n-1)/2.
INSERT INTO duplicate_pairs (...)
SELECT g.canonical_id, o.id, 'certain', ...
FROM scan_groups g JOIN organizations o
  ON o.norm_name = g.norm_name AND o.id <> g.canonical_id AND o.deleted_at IS NULL
WHERE g.n > 1;

-- 3. LIKELY tier: name-level trigram join, canonical representatives only. 18.2 s.
SET LOCAL pg_trgm.similarity_threshold = 0.85;
INSERT INTO duplicate_pairs (...)
SELECT a.canonical_id, b.canonical_id, 'likely', similarity(a.norm_name, b.norm_name)
FROM scan_groups a JOIN scan_groups b
  ON b.norm_name % a.norm_name AND b.norm_name > a.norm_name;
```

**Resulting persisted pair counts** `[VERIFIED: all four numbers measured]`:

| Entity | Certain (star) | Likely (name-level, 0.85) | Total |
|---|---|---|---|
| Organizations | 24,551 | 419 | **24,970** |
| People (exact valid email) | 5,338 | — | |
| People (name + normalized phone) | 1,997 | — | |
| People (name-level fuzzy, 0.85) | — | 316 | **~7,651** |

Compare to the clique-pairing alternative: **1,030,436 + 27,156 = 1,057,592** for organizations alone. Star pairing is a **42× reduction** and is mathematically lossless for exact-match groups, because exact equality is transitive — collapsing the 634-member Mitra cluster to 633 star pairs loses no information a user could act on, whereas 200,661 clique pairs is 2,000 pages of noise.

**`SET LOCAL`, not `SET`.** The `%` operator reads `pg_trgm.similarity_threshold` from the session GUC. This app uses `postgres.js` with connection pooling, so a plain `SET` leaks the threshold to whatever query runs next on that connection. Use `SET LOCAL` inside the scan's transaction, or pass the threshold as an explicit `similarity(a,b) >= $1` filter alongside `%` for index access. `[VERIFIED: default is 0.3; confirmed via `show pg_trgm.similarity_threshold`]` `[ASSUMED: the pooling-leak consequence — reasoned from postgres.js's documented connection reuse, not measured this session]`

### 5. Blocking keys — measured, and the CONTEXT's suggestion is the worst option

CONTEXT proposes "normalized first significant token of the name, or email domain". Measured against the live data:

| Blocking strategy | Blocks | Candidate pairs | Largest block |
|---|---|---|---|
| No blocking (naive all-pairs) | 1 | **1,060,462,431** | 46,054 |
| **First token** (CONTEXT's suggestion) | 9,655 | **7,698,277** | 2,307 (`CONDOMINIO`) |
| Rarest token (df-weighted), len ≥ 3 | 15,263 | 1,127,788 | 636 |
| **Exact normalized name (as an equality key)** | 21,503 | 1,030,436 clique / **24,551 star** | 634 |
| **GIN trigram over distinct names** | — | **419** | — |

`[VERIFIED: all measured this session]`

First-token blocking gives a 138× reduction from naive but leaves 7.7 M comparisons, **98.6% of which sit in blocks larger than 50 rows**. The top blocks are exactly the ones CONTEXT predicted (`CONDOMINIO` 2,307, `IGREJA` 1,775, `MITRA` 1,219, `POSTO` 1,036, `BANCO` 818, `SUPERMERCADO` 474). It does not tame this dataset.

**The GIN trigram index *is* the blocking mechanism.** It is not "a trigram index alone", which is what CONTEXT correctly rejects — it is a trigram index over a *deduplicated name dictionary*, which is a fundamentally smaller problem. The plan should say so rather than implementing a token-blocking layer that the index makes redundant.

Rarest-token blocking is a reasonable fallback if the GIN approach disappoints on a different dataset, and it is worth a one-line comment in the migration for whoever comes next.

### 6. Create-time check cost

A single-record trigram lookup against the expression index, worst case (`Supermercado Bom Preco`, a high-frequency prefix): **60 ms, 976 candidates at threshold 0.3, index correctly chosen** `[VERIFIED: EXPLAIN ANALYZE, "Bitmap Index Scan on org_norm_trgm_idx"]`.

That confirms two things: (a) the create-time check fits comfortably inside a submit, and (b) **976 matches is exactly why the create-time tier must be *certain* (exact), not fuzzy** — the locked decision is right. The certain tier is a btree equality lookup on `norm_name`, sub-millisecond.

---

## The Merge Transaction

### M-8 is settled and the numbers support it comfortably

**Measured worst case across all 46,054 organizations** `[VERIFIED: live DB]`:

| Organization | deals | people | notes | audit rows | **total child rows** |
|---|---|---|---|---|---|
| Teste Felipe | 114 | 0 | 0 | 0 | **114** |
| JSL S.A (REDE - BRASIL) | 90 | 1 | 0 | 0 | 91 |
| REDE BIGBOX | 33 | 0 | 0 | 0 | 33 |

The heaviest organization in the database moves **114 rows**. The `audit_log` table holds 213 rows total across 85 entities. A single transaction is not a stretch — it is smaller than several statements the app already runs. **M-8 is confirmed with measurement; there is no scenario in this dataset where a single transaction is infeasible, and the plan should not hedge.**

For context on what would have been dangerous: one deal has **17,253 activities** `[VERIFIED]` (they are the `deal_id IS NULL` orphan bucket, actually — `61,769` activities have a deal, `17,253` do not). Since **activities are never reassigned** (they follow their deal), no merge ever touches that volume. The plan should state this explicitly rather than writing a no-op activity UPDATE, per CONTEXT.

### `runWithActor` composes with a transaction — and the audit bus does not

`runWithActor` is `AsyncLocalStorage.run` (`src/lib/audit/actor-context.ts`) `[VERIFIED: source read]`. ALS context propagates through every `await` inside the callback, so a `db.transaction` opened inside `runWithActor` sees the actor. **Confirmed by working precedent**, not inference: `purgeOrganizationMutation` does exactly this today.

But the composition has a specific shape that must be copied verbatim:

```ts
export async function mergeOrganizationsMutation(...) {
  // Captured synchronously at entry, BEFORE the transaction promise exists.
  const actor = getCurrentActor()
  // ...
  await db.transaction(async (tx) => {
    // ... every write uses tx ...
    await tx.insert(auditLog).values({ ..., ...auditActorColumns(actor) })
  })
}
```
`[VERIFIED: `src/lib/mutations/organizations.ts:544-640`]`

**The bus is the trap.** `src/lib/events/subscribers/audit.ts:70` writes audit rows with the **module-level `db`, fire-and-forget, with a `.catch()`** — deliberately, so an audit failure cannot break a user's write. Consequences for the merge:

1. **Audit rows written via the bus are outside the transaction.** If the merge rolls back, a bus-emitted audit row survives, and the timeline shows a merge that never happened.
2. **`merged` is not one of the twelve `AUDITED_EVENTS`.** There is no `organization.merged` event and CONTEXT introduces none.
3. Therefore **the merge must write its audit rows directly with `tx.insert(auditLog)`**, exactly as `purgeOrganizationMutation` does, and must NOT reuse `deleteOrganizationMutation` for the loser (which emits `organization.deleted` on the bus and does its `UPDATE` outside any transaction) `[VERIFIED: `src/lib/mutations/organizations.ts:409-446`]`.

**The event-emission decision the plan must make explicitly:** if the merge does not emit `organization.deleted` for the loser, no webhook fires and no workflow triggers on the merge. Phase 37's purge made the same choice and documented it. Recommendation: **emit the CRM event(s) after the transaction commits**, outside it, so webhooks and workflow triggers still see the deletion while the transaction stays pure. State the ordering in a comment; a reader will otherwise assume the bus emit belongs inside.

### Exhaustive child inventory — verified against the catalog, not the source files

**Foreign keys referencing `organizations` or `people`, from `pg_constraint`** `[VERIFIED: live DB]`:

| Constraint | Child table | Child column | Parent | ON DELETE |
|---|---|---|---|---|
| `deals_organization_id_organizations_id_fk` | `deals` | `organization_id` | organizations | NO ACTION |
| `people_organization_id_organizations_id_fk` | `people` | `organization_id` | organizations | NO ACTION |
| `deals_person_id_people_id_fk` | `deals` | `person_id` | people | NO ACTION |

**Exactly three.** No others exist anywhere in the 32-table schema.

**Polymorphic references (no FK — nothing at the database level catches a miss)** `[VERIFIED: `information_schema.columns` scan for `%entity%`, `%organization%`, `%person%`, `%people%`, `%org_%`]`:

| Table | Columns | Live rows for `entity_type='organization'` | Note |
|---|---|---|---|
| `notes` | `entity_type`, `entity_id` | **29,037** | **See B4 — `notes_migration_uniq`** |
| `audit_log` | `entity_type`, `entity_id` | 0 today, but grows | **DO NOT reassign** — see below |
| `custom_field_definitions` | `entity_type` only | — | A *type* discriminator, not a record reference. Untouched. |

The scan turned up **no other column anywhere in the schema** that could hold an organization or person id. `activities`, `workflow_runs`, `webhook_deliveries` were individually described and confirmed clean `[VERIFIED: `\d`]`.

**The complete merge write set for an organization merge:**

| # | Statement | Rows (worst case measured) | Notes |
|---|---|---|---|
| 1 | `UPDATE deals SET organization_id = survivor WHERE organization_id = loser` | 114 | `.returning({id})` — needed for per-child audit rows and for the post-commit recalc |
| 2 | `UPDATE people SET organization_id = survivor WHERE organization_id = loser` | 2 | same |
| 3 | Notes reassignment, **collision-guarded** (B4) | 1 migration note + user notes | `entity_type = 'organization' AND entity_id = loser` |
| 4 | `UPDATE organizations SET <chosen field values>, custom_fields = <merged blob>, updated_at WHERE id = survivor` | 1 | The field-picker result |
| 5 | `UPDATE organizations SET deleted_at = now(), updated_at WHERE id = loser AND deleted_at IS NULL` | 1 | Soft delete, in-transaction. **Not** `deleteOrganizationMutation`. |
| 6 | `tx.insert(auditLog)` — the `merged` row on the survivor | 1 | `action: 'merged'`, `changes` = the per-field diff, plus the loser's id/name and the child counts |
| 7 | `tx.insert(auditLog)` — the `deleted` row on the loser | 1 | `action: 'deleted'` |
| 8 | `tx.insert(auditLog)` — one `updated` row per reparented child | up to 116 | Follows the purge precedent exactly: *"a live deal or person silently loses its organization with no trace"* — the same argument applies to gaining one |
| 9 | `UPDATE duplicate_pairs SET status = 'merged' WHERE …` | small | Both the merged pair and any other pair referencing the loser |

**Do NOT reassign `audit_log` rows.** The loser's history belongs to the loser. `src/db/schema/audit-log.ts:41-46` states the posture explicitly: *"an audit row for a DELETED record must survive that record… Do not 'fix' this by copying the notes defence over — its absence is the design."* The loser is soft-deleted and restorable from Trash; moving its audit rows to the survivor would both falsify the survivor's history and empty the loser's. The survivor's `merged` entry (A-7's `audit.entry.mergedChildren` line) is how the merge becomes visible, which is what success criterion 5 asks for.

**`activities` are correctly absent from this table.** `activities` has `deal_id` only — no `organization_id`, no `person_id` `[VERIFIED: `\d activities`]`. They follow their deal transitively. 39-UI-SPEC M-6's `dedup.merge.activitiesFollowDeals` sentence is the user-facing statement of this, and the plan should carry the same statement as a comment at the point where a reader would expect an activity UPDATE and not find one.

### Person merge — the same shape, one fewer child table

| # | Statement |
|---|---|
| 1 | `UPDATE deals SET person_id = survivor WHERE person_id = loser` |
| 2 | Notes reassignment (`entity_type = 'person'`) — **zero migration notes exist for people today** `[VERIFIED]`, but the guard must still be written; a future import would create them |
| 3–8 | identical to the organization merge, minus the `people` reparenting step |

Note `people.organization_id` is *not* touched by a person merge — it is the person's own field and is resolved by the field picker like any other.

### Custom fields

Custom field values live in the `custom_fields` JSONB column on each entity `[VERIFIED: `\d organizations`, `\d people`]`, keyed by the definition's **`name`** (its human label), not its id `[VERIFIED: live JSONB key inspection — keys are `CNPJ / CPF`, `E-mail de Contato 1`, …]`.

Consequences for the merge:
- Custom fields are **not** child rows. They are resolved by the field picker alongside native columns and written as one merged blob in statement 4. There is no separate reassignment step.
- 39-UI-SPEC M-4 routes every label through `AUDIT_FIELD_LABELS` / `describeField` in `src/lib/audit/present.ts`, which already handles the `custom:` prefix `[VERIFIED: 39-UI-SPEC records the source read]`. No new label map.
- **Pre-existing data anomaly, flagged not fixed:** `custom_field_definitions` contains **two rows named `Segmento Organização`** for `entity_type='organization'` (ids `cb90431a…` and `4d479dc9…`) `[VERIFIED: live DB]`. Since the JSONB is keyed by name, these two definitions address the same blob key. This predates Phase 39 and is out of scope, but a merge UI that enumerates definitions will render the field twice unless it dedupes by name. **The plan should dedupe by name when building the field list**, with a comment naming this row as the reason.
- File custom fields: covered in **B5** — no route change, the value carries its own URL.

### Formula recalculation after a merge

**The good news, and it is genuinely good:** the call that Phase 37 could not make for purge **is** makeable for merge, and for exactly the reason the brief anticipated — a merge has a live parent to resolve against.

`RecalculateFormulasInput` accepts `changedRelatedFields` and `relatedEntities` at the top level `[VERIFIED: `src/lib/formula-recalc.ts:650+`]`:

```ts
await recalculateFormulas({
  entityType: "deal",
  entityId: reparentedDealId,
  changedFields: [],
  changedRelatedFields: { Organization: ORG_REF_NAMES },
  relatedEntities:      { Organization: survivorRow },   // ← the live parent purge lacked
  cascade: false,
  definitionsCache,                                       // shared across the loop
})
```

The cascade prefixes are `Organization`, `Person`, `Deal`; activities have none `[VERIFIED: `CASCADE_CHILD_RELATIONS`, `src/lib/formula-recalc.ts:225+`]`.

**Three constraints the plan must respect:**

1. **It cannot run inside the transaction.** `recalculateFormulas` and its cascade use the module-level `db`, never a `tx` — Phase 37 recorded this as one of its three blocking reasons `[VERIFIED: `src/lib/formula-recalc.ts` child lookup uses `db.select()`]`. Run it **after commit**, best-effort, wrapped so a failure logs and does not undo a committed merge. This is consistent with D-05's resolve-don't-reject posture.

2. **Do not rely on a survivor-rooted cascade.** `cascadeToChildren` short-circuits on `if (changed.size === 0) return 0` `[VERIFIED: source]`. If the merge's field picker left the survivor unchanged (a legitimate and common outcome — the survivor wins every field), a `recalculateFormulas({entityType:'organization', entityId: survivor, changedFields: [...]})` call recomputes **nothing**, and the newly reparented children keep the *loser's* `Organization.*` values. **Iterate the reparented children explicitly** with the call above; do not depend on the parent cascade to reach them.

3. **One hop only, and say so.** `recalculateFormulas` is documented as single-hop, budget-capped at `FORMULA_EVALUATION_BUDGET = 500` `[VERIFIED: `src/lib/formula-recalc.ts:197`]`. An organization merge reparents deals *and* people; a reparented deal's own formula values feed `Deal.*` into its activities, and a reparented person's feed `Person.*` into deals. Those second- and third-hop values stay stale. Worst case measured: 116 children × ~1 evaluation each fits inside the 500 budget comfortably, so budget exhaustion is not the issue — **hop depth is.** Follow the purge precedent: state the limitation in a comment at the recalc site rather than implying full correctness.

---

## Background Job Mechanism

The repo has **two** working patterns. Reuse beats inventing, and both are already load-bearing in production.

### Pattern A — `import_sessions` + fire-and-forget server action + client poll (the UI-SPEC's reference)

| Piece | File | Shape |
|---|---|---|
| Job row | `import_sessions` table | `{ id, status, progress jsonb, cancelled bool, user_id, created_at, updated_at }` `[VERIFIED: `\d import_sessions`]` |
| State module | `src/lib/import/pipedrive-import-state.ts` | `createImportState`, `getImportState`, `updateImportState`, `cancelImport`, `isCancelled`, `incrementImportedCount`, `addImportError` — all `db`-backed |
| Launch | `src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx:80-96` | client generates `crypto.randomUUID()`, calls the server action **without `await`**, immediately switches to the progress step |
| Work | `src/lib/import/pipedrive-api-import-actions.ts:296+` | `runWithActor({kind:'import', …}, async () => { … })` around the whole run |
| Poll | `src/app/admin/import/pipedrive-api/steps/progress-step.tsx:25-46` | `useEffect` → initial fetch → `setInterval(poll, 1000)` → `mounted` flag → `clearInterval` |
| Read | `getImportProgress(importId)` server action | auth check → `getImportState(id)` |
| Crash recovery | `src/lib/import/import-session-cleanup.ts` | at boot: `running` → `error`; delete `idle` > 1 h; delete anything > 30 d |

`[VERIFIED: all source read]`

**`dedup_scans` should be `import_sessions` with a different name.** The column set maps 1:1 onto the UI-SPEC's requirements: `status` → P-4's four renderings, `progress` JSONB → P-1's `{current, total}`, `cancelled` → P-4's cancel button, `user_id` → **P-6's `dedup.scan.startedBy` and the rule that a non-starter sees no cancel button.**

**Honest caveats about Pattern A:**

- A fire-and-forget server action has **no guaranteed lifetime** in Next.js. It works here because the deployment is a long-lived Node container (`next start` under `docker compose`), so the promise outlives the request and survives the client navigating away — which is precisely what P-5's `dedup.scan.backgroundHint` promises the user. `[VERIFIED: the Pipedrive importer works this way in production today]` **This would not hold on a serverless platform**, and if the project ever targets one, both this scan and the existing importer break together. Worth one comment.
- A container restart mid-scan strands the row at `status='running'` forever. That is exactly why `cleanupStaleImportSessions` exists, and **a `dedup_scans` equivalent is mandatory, not optional** — without it P-7 disables the scan CTA permanently after one unlucky restart.

### Pattern B — a self-scheduling processor (more robust, more machinery)

`src/lib/execution/execution-processor.ts` is the alternative: `setTimeout`-chained ticks (never `setInterval`, to prevent overlap), a claim-with-lease model, and `reclaimStaleRuns()` for crash recovery. Six such processors run today `[VERIFIED: container logs show `[webhook-processor]`, `[email-processor]`, `[schedule-processor]`, `[execution-processor]`, `[audit-prune]`, `[trash-prune]` all starting]`.

**Recommendation: Pattern A**, for three reasons. The UI-SPEC's P-3 already names `progress-step.tsx` as the poll to copy; the scan is user-initiated and interactive rather than queued; and 18–20 seconds of work does not justify a queue. **But take Pattern B's stale-reclaim idea** — reuse the boot-time cleanup, not the tick loop.

### ⚠ `instrumentation.ts` is fragile and it has already failed once in production

```
// Dockerfile:24 copies the built instrumentation.js into .next/standalone/ with a step
// that ends in `2>/dev/null || true`, so a build whose chunk layout changes fails silently
// and this whole function never runs. That exact breakage killed all four processors in
// production on 2026-08-08 while every test passed.
// The gate is behavioural: `docker compose logs app | grep -F '[trash-prune] Starting'`
```
`[VERIFIED: verbatim from `instrumentation.ts`]`

If the plan adds a `cleanupStaleDedupScans()` to `register()`, it inherits this exact fragility. **Its verification must be behavioural** — grep the container logs for the startup line — not a unit test asserting the function is imported. Confirmed working right now:

```
app-1  | [webhook-processor] Starting with initial delay of 5s
app-1  | [execution-processor] Starting with initial delay of 5s
app-1  | [trash-prune] Starting with initial delay of 60s, ticking daily
```
`[VERIFIED: `rtk proxy docker compose logs app --tail 200`]`

> Note for the executor: `docker compose logs` is intercepted by the RTK hook and summarised into an error/warning digest that **hides** these startup lines. Use `rtk proxy docker compose logs app` to see raw output.

---

## Architecture Patterns

### System Architecture Diagram

```
CREATE-TIME PATH
  Browser: organization-dialog / person-dialog  ──submit──▶  createOrganization / createPerson
                                                                      │
                                                       ┌──────────────┴──────────────┐
                                                       │  confirmDuplicate flag set? │
                                                       └──────┬───────────────┬──────┘
                                                          no  │               │ yes (W-4)
                                                              ▼               │
                                                  findCertainMatches()        │
                                                   btree = on norm_name       │
                                                   (sub-ms, ≤5 rows, W-8)     │
                                                              │               │
                                                   ┌──────────┴────────┐      │
                                                   │ matches.length>0? │      │
                                                   └────┬─────────┬────┘      │
                                                    yes │         │ no        │
                                       {success:false,  │         └───────────┴──▶ runWithActor
                                        duplicates:[…]} │                             └▶ createXMutation ─▶ crmBus ─▶ audit subscriber
                                                        ▼
                                        Browser renders <DuplicateWarning> INSIDE the
                                        open dialog (W-1). Form state preserved (W-2).


SCAN PATH
  Browser: /duplicates scan-panel ──fire&forget──▶ startDuplicateScan(scanId, entityType)
        │                                                    │
        │                                          runWithActor({kind:'user'})
        │                                                    │
        │                                          INSERT dedup_scans (status='running')
        │                                                    │
        │                                    ┌───────────────┴────────────────┐
        │                                    │ 1. build name-group temp table │  ~0.4 s
        │                                    │ 2. star pairs  (exact / certain)│  <1 s   24,551
        │                                    │ 3. SET LOCAL threshold=0.85     │
        │                                    │    name-level trigram self-join │  18.2 s    419
        │                                    │    (skips pairs already         │
        │                                    │     dismissed — dismissal       │
        │                                    │     survives rescans)           │
        │                                    └───────────────┬────────────────┘
        │                                          UPDATE dedup_scans.progress
        │                                          each chunk; check .cancelled
        │                                                    │
        └──poll every 1 s──▶ getScanProgress(scanId) ────────┘
                                     │
                             P-4 four renderings; P-6 hides cancel from non-starters


MERGE PATH
  Browser: /duplicates/[pairId] merge-form  ──submit──▶ mergeRecords(pairId, survivorId, choices)
                                                              │
                                                    runWithActor({kind:'user', userId})
                                                              │
                                                  const actor = getCurrentActor()   ◀── synchronous, BEFORE the tx
                                                              │
                            ┌─────────────────── db.transaction(async tx => { ────────────────────┐
                            │  re-read both records FOR UPDATE  →  either gone? throw (M-8 "gone")│
                            │  UPDATE deals    SET organization_id/person_id = survivor .returning│
                            │  UPDATE people   SET organization_id = survivor          .returning │  ≤116 rows
                            │  reassign notes, GUARDED against notes_migration_uniq  (B4)         │  total
                            │  UPDATE survivor SET <chosen values>, custom_fields                 │
                            │  UPDATE loser    SET deleted_at = now()                             │
                            │  tx.insert(auditLog) × { merged | deleted | updated-per-child }     │
                            │  UPDATE duplicate_pairs SET status='merged' (this pair + any        │
                            │         other pair referencing the loser)                           │
                            └──────────────────────────── }) ─────────────────────────────────────┘
                                                              │  committed
                                        ┌─────────────────────┼─────────────────────┐
                                        ▼                     ▼                     ▼
                          recalculateFormulas per       crmBus.emit(          revalidatePath
                          reparented child, ONE hop,    'organization.        ('/duplicates',
                          best-effort, logged           deleted')             '/organizations')
                          (module `db`, not `tx`)       → webhooks, workflows
```

### Recommended Project Structure

```
src/lib/dedup/
├── normalize.ts            # TS mirror of the SQL function + a parity test (only if needed)
├── normalize.test.ts       # legal suffixes, accents, empties, the `S A` case
├── blocking.ts             # blocking-key derivation, if a fallback path is kept
├── scoring.ts              # tier classification: certain vs likely
├── scoring.test.ts
├── merge-defaults.ts       # V-4: survivor wins, EXCEPT survivor-empty + loser-populated
├── merge-defaults.test.ts  # the phase's highest-consequence silent default
├── field-groups.ts         # M-3: conflicts / filled-only / identical partitioning
├── field-groups.test.ts
└── scan-state.ts           # dedup_scans CRUD — the pipedrive-import-state.ts shape

src/lib/mutations/
└── dedup.ts                # mergeOrganizationsMutation, mergePersonsMutation,
                            # findCertainMatches, dismissPair, undismissPair

src/db/schema/
├── duplicate-pairs.ts      # the pair table
└── dedup-scans.ts          # the job table

src/app/duplicates/
├── page.tsx                # RSC; tabs, counts, cursor, scan state (L-1)
├── actions.ts              # startDuplicateScan, getScanProgress, cancelScan, dismiss, merge
├── duplicates-tabs.tsx     # trash-tabs.tsx shape
├── scan-panel.tsx          # P-3 poll, P-4 four states
├── pair-card.tsx           # L-3..L-8, reused by the dismissed view
└── [pairId]/
    ├── page.tsx            # RSC; loads pair, both records, child counts
    └── merge-form.tsx      # M-1..M-9

src/components/dedup/
├── duplicate-warning.tsx        # W-1..W-10
└── import-duplicate-notice.tsx  # I-1..I-5

drizzle/
└── XXXX_dedup.sql          # extensions, immutable_unaccent, dedup_norm_*,
                            # generated columns, GIN + btree indexes, both tables
```

### Pattern: the transactional multi-child mutation

The template is `purgeOrganizationMutation` (`src/lib/mutations/organizations.ts:544-640`). Its five load-bearing properties, all of which the merge needs:

```ts
// 1. Actor captured synchronously at entry, BEFORE the transaction promise exists.
const actor = getCurrentActor()

// 2. Existence/eligibility read OUTSIDE the transaction, returning a discriminated
//    code (not prose) so the UI can branch — M-8's "one record already gone" needs this.
const organization = await db.query.organizations.findFirst({ where: ... })
if (!organization) return { success: false, error: "NOT_IN_TRASH" }

try {
  const detached = await db.transaction(async (tx) => {
    // 3. Polymorphic notes handled EXPLICITLY, with a comment saying nothing in the
    //    database enforces it.
    await tx.delete(notes).where(and(eq(notes.entityType, ENTITY), eq(notes.entityId, id)))

    // 4. `.returning({ id })` on every child UPDATE, because each one needs its own audit row.
    const detachedDeals = await tx.update(deals).set({...}).where(...).returning({ id: deals.id })

    // 5. Audit written with `tx`, INSIDE the transaction, "so a rollback cannot leave a
    //    record of a purge that did not happen".
    await tx.insert(auditLog).values({ ..., ...auditActorColumns(actor) })
    return detachedDeals.length + detachedPeople.length
  })
  return { success: true, detached }
} catch (error) {
  console.error("Failed to purge organization:", error)
  return { success: false, error: "Failed to purge organization" }
}
```
`[VERIFIED: source read]`

`auditActorColumns` is a **private** helper duplicated in `organizations.ts:176` and `people.ts:172` `[VERIFIED]`. The merge will need a third copy or a shared extraction. Extracting it is cleaner but touches two shipped files; duplicating a 6-line pure function a third time is the lower-risk option and matches what the repo already tolerates. **Planner's call — state which, don't leave it to the executor.**

### Anti-Patterns to Avoid

- **Building the index on one expression and querying with another.** The failure is silent: no error, no plan warning, just a sequential scan. Every index-backed query in this phase must be EXPLAIN-verified to show `Bitmap Index Scan on <the dedup index>`. The generated-column approach makes this nearly impossible to get wrong, which is a second reason to prefer it.
- **Clique pairing.** Emitting `n(n-1)/2` pairs for an exact-match group. Measured cost: 1,030,436 rows instead of 24,551.
- **Reassigning `audit_log` rows to the survivor.** The schema comment explicitly forbids the reasoning that leads there.
- **Reusing `deleteOrganizationMutation` for the loser.** It writes outside a transaction and emits on the bus. Both break M-8.
- **Plain `SET pg_trgm.similarity_threshold`.** Use `SET LOCAL` — the connection is pooled.
- **A no-op `UPDATE activities`.** Activities have no organization or person column. Write the *comment*, not the statement.
- **Optimistic removal of a pair on dismiss.** L-8 requires the pair stay in the list if the write fails.
- **Copying `progress-step.tsx`'s presentation.** K-2: it uses `text-green-600` / `text-orange-500` and 11 hardcoded English literals. Copy the poll loop only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Fuzzy string similarity | A JS Levenshtein loop | `pg_trgm`'s `similarity()` + GIN index | `src/lib/import/fuzzy-match.ts` **already does this** and is the cautionary example: O(n) over an in-memory array of every organization × O(len²) per comparison. Used at `src/app/import/actions.ts:191`. At 46,054 rows this is ~2.1 billion character-cell operations per lookup. |
| Accent folding | A hand-written character map | `unaccent` + an IMMUTABLE wrapper | The dictionary handles the full Latin-1/Latin Extended range; a hand map will miss `ç`/`ñ`/`õ` combinations and drift from the index. |
| Blocking / candidate generation | A token-inverted index in Node | GIN `gin_trgm_ops` over a distinct-name table | Measured: 18.2 s in Postgres for 21,503 names. Any Node implementation must first pull 46,054 rows over the wire. |
| Job progress + cancellation | A new queue, Redis, or `setInterval` in a route | `import_sessions`' schema and `pipedrive-import-state.ts`'s API, renamed | Battle-tested in this repo, DB-backed so it survives restarts, and it is exactly what P-3/P-4/P-6/P-7 describe. (`ioredis` **is** a dependency, but nothing in the repo uses it as a queue — do not start here.) |
| Transaction orchestration | A hand-rolled compensating-action rollback | `db.transaction` | Six existing call sites. `purgeOrganizationMutation` is the multi-child precedent. |
| Field labels for the merge picker | A new `MERGE_FIELD_LABELS` map | `AUDIT_FIELD_LABELS` / `describeField` in `src/lib/audit/present.ts` | M-4. A second map guarantees the merge picker and the audit receipt eventually disagree about what a column is called. |
| A second progress bar | A new 12-line bar component | Lift the presentational half of `src/components/import/progress-bar.tsx` per P-2 | Two visually different progress bars in one app. |

**Key insight:** every hard part of this phase already has a working implementation in this repository — the transactional multi-child mutation, the background job with progress, the polymorphic-notes handling, the in-transaction audit write, the client poll. The phase's real risk is not building the wrong thing from scratch; it is **failing to notice that the right thing already exists and quietly building a fifth variant of it.**

### The `fuzzy-match.ts` collision — decide explicitly

`src/lib/import/fuzzy-match.ts` will, after this phase, be the **second** normalization implementation in the codebase, and it disagrees with the new one on every axis that matters:

| | `fuzzy-match.ts` `normalize()` | Phase 39's `dedup_norm_org` |
|---|---|---|
| Suffixes stripped | `inc, corp, corporation, ltd, llc, co, company, group, gmbh, sa, ag` | `ltda, me, epp, eireli, sa, cia, mei` |
| `LTDA` (36% of live rows) | **not stripped** | stripped |
| Accents | **not stripped** | stripped via `unaccent` |
| Scoring | Levenshtein + substring bonus | trigram |
| Runs | in Node, over all rows | in Postgres, index-backed |

`[VERIFIED: source read + live-data suffix counts]`

Its single caller is `src/app/import/actions.ts:191` (the CSV importer's organization resolution). Three options, and the plan must pick one rather than leaving two matchers to drift:

1. **Leave it entirely alone**, and add a comment at the top of each file pointing at the other. Smallest diff. Accepts that the CSV importer and the dedup feature will report different things about the same two names — which is *visible to users* the moment the importer's flagged-rows notice (I-1) and the scan disagree.
2. **Repoint `src/app/import/actions.ts:191` at the new Postgres-backed matcher**, and delete `fuzzy-match.ts`. Correct, and it fixes a real scale bug in the CSV importer for free. But it touches the importer, and CONTEXT scopes the importer to "reporting matched rows" only.
3. **Keep `fuzzy-match.ts` but extend its `normalize()` to match the SQL function**, guarded by a parity test.

**Recommendation: (1) for this phase, with the cross-reference comments mandatory**, and log (2) as a follow-up. Option 2 is the right end state but it widens the phase past its stated boundary, and CONTEXT was explicit about the importer.

---

## Common Pitfalls

### Pitfall 1 — The index is built but never used
**What goes wrong:** the query normalizes slightly differently from the index expression (an extra `coalesce`, a different regex, a missing `WHERE deleted_at IS NULL` to match the partial index) and Postgres silently sequential-scans.
**Why it happens:** expression indexes match textually after parse; there is no warning for a near-miss.
**How to avoid:** use a STORED generated column so the query references a *column*, not an expression. Then EXPLAIN-verify anyway.
**Warning signs:** `Seq Scan on organizations` in the plan; a scan that takes minutes instead of ~20 s.

### Pitfall 2 — `notes_migration_uniq` aborts the merge (B4)
**What goes wrong:** SQLSTATE 23505 at the notes UPDATE rolls back the whole transaction; the user sees `dedup.merge.failed` with no cause.
**Why it happens:** 63% of organizations have a `source='migration'` note and the partial unique index permits only one per entity.
**How to avoid:** guard the reassignment (see B4's three options); add a unit or integration test that merges two organizations that *both* have migration notes.
**Warning signs:** merges failing on real data while every synthetic-fixture test passes — because fixtures rarely include migration notes.

### Pitfall 3 — Clique explosion in `duplicate_pairs`
**What goes wrong:** a 634-member exact-name cluster writes 200,661 pair rows.
**Why it happens:** the obvious self-join is `a.id < b.id`.
**How to avoid:** star pairing against each group's canonical record for the exact tier; name-level (not row-level) joining for the fuzzy tier.
**Warning signs:** the pair count exceeds the row count of the entity being scanned. Add an assertion.

### Pitfall 4 — `pg_trgm.similarity_threshold` leaks across pooled connections
**What goes wrong:** a scan sets 0.85; an unrelated later query on the same pooled connection inherits it.
**How to avoid:** `SET LOCAL` inside the scan transaction, or an explicit `similarity(a,b) >= $1` predicate.
**Warning signs:** non-deterministic match counts between runs.

### Pitfall 5 — Fire-and-forget work dies with the process
**What goes wrong:** a container restart mid-scan leaves `dedup_scans.status = 'running'` forever, and P-7 disables the scan CTA permanently.
**How to avoid:** a boot-time reaper modelled on `cleanupStaleImportSessions`, registered in `instrumentation.ts` — and **verified behaviourally via container logs**, because `instrumentation.ts` registration has silently failed in production before.

### Pitfall 6 — `AuditAction` compile cascade (B3)
**What goes wrong:** adding `'merged'` in one place typechecks locally and fails in another file, or worse, typechecks everywhere because someone widened a `Record<AuditAction, …>` to `Partial<>`.
**How to avoid:** change all four sites in one task; never relax the two exhaustive maps to `Partial`.
**Warning signs:** `Partial<Record<AuditAction, …>>` appearing in a diff.

### Pitfall 7 — Audit rows written outside the transaction
**What goes wrong:** the merge rolls back but the timeline shows a merge.
**Why it happens:** the bus subscriber writes with module-level `db`, fire-and-forget, by design.
**How to avoid:** `tx.insert(auditLog)` for everything the merge records; emit bus events only after commit.

### Pitfall 8 — The create-time warning fires on nothing (B1) or on everything (B2)
Covered above. Both are data-shape problems that no amount of threshold tuning fixes.

### Pitfall 9 — `docker compose logs` is filtered by the RTK hook
**What goes wrong:** an executor greps for `[dedup-scan-cleanup] Starting`, sees nothing, and concludes the reaper is broken.
**How to avoid:** `rtk proxy docker compose logs app` for raw output. `[VERIFIED: reproduced this session]`

### Pitfall 10 — `slopcheck install` installs
**What goes wrong:** a legitimacy check mutates `package.json` and `package-lock.json`.
**How to avoid:** `slopcheck scan package.json`. `[VERIFIED: reproduced and reverted this session]`

### Pitfall 11 — Playwright runs against a stale image
**What goes wrong:** the image has no volume mount, so source edits are invisible to e2e until a rebuild.
**How to avoid:** `docker compose up -d --build` before every Playwright run. `[CITED: 45-RESEARCH § Sampling Rate]`

---

## Code Examples

### Migration skeleton (verified working against the live DB)

```sql
-- Both are TRUSTED on PG16; `pipelite` is additionally a superuser. Runs unattended.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- `unaccent` is STABLE, so it cannot appear in an index expression. This wrapper is a
-- DELIBERATE declaration the database does not verify: if the unaccent dictionary file
-- ever changes, index entries built with this become stale. Schema-qualified so a
-- restricted search_path cannot repoint it.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION public.dedup_norm_org(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
SELECT btrim(regexp_replace(
  regexp_replace(
    regexp_replace(lower(public.immutable_unaccent(coalesce($1,''))),
                   '[^a-z0-9]+', ' ', 'g'),
    '\m(ltda|me|epp|eireli|sa|cia|mei)\M', ' ', 'g'),
  '\s+', ' ', 'g'))
$$;

-- STORED, not an expression index: 32x fewer heap blocks on the bitmap recheck.
ALTER TABLE organizations
  ADD COLUMN norm_name text GENERATED ALWAYS AS (public.dedup_norm_org(name)) STORED;

CREATE INDEX org_norm_trgm_idx  ON organizations USING gin (norm_name gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX org_norm_btree_idx ON organizations (norm_name)
  WHERE deleted_at IS NULL;
```
`[VERIFIED: every statement executed successfully this session and was then rolled back]`

### The create-time certain check (btree, sub-millisecond)

```sql
-- W-8 caps at 5. `length(...) >= 3` keeps the 9 token-less organizations from
-- forming a clique with each other.
SELECT id, name, custom_fields
FROM organizations
WHERE deleted_at IS NULL
  AND norm_name = public.dedup_norm_org($1)
  AND length(public.dedup_norm_org($1)) >= 3
LIMIT 5;
```

### The `merged` audit row, inside the transaction

```ts
// Follows purgeOrganizationMutation:625-634 exactly. `tx`, not `db`.
await tx.insert(auditLog).values({
  entityType: "organization",
  entityId: survivorId,
  action: "merged",                       // B3: the fourth literal, four files
  changes: {
    ...fieldDiff,                         // A-4: the same shape every `updated` entry uses
    __merged: { from: loserId, to: null },// names the loser for A-2's predicate
  },
  ...auditActorColumns(actor),            // actor captured synchronously at entry
})
```
`[Pattern VERIFIED against `src/lib/mutations/organizations.ts:625-634`; the `changes` key names are ASSUMED — the planner should pick shapes that `describeField` and `AuditEntry` render sensibly, and A-4 requires the per-field diff live in the normal `changes` array.]`

### Post-commit formula recalculation for reparented children

```ts
// AFTER the transaction commits. recalculateFormulas uses module-level `db`, never `tx`.
// Best-effort by design (D-05): a recalc failure must not undo a committed merge.
const definitionsCache = new Map<EntityType, CustomFieldDefinition[]>()
for (const child of [...reparentedDeals, ...reparentedPeople]) {
  try {
    await recalculateFormulas({
      entityType: child.kind,          // "deal" | "person"
      entityId: child.id,
      changedFields: [],               // the child's OWN fields did not change
      changedRelatedFields: { Organization: ORG_REF_NAMES },
      relatedEntities:      { Organization: survivorRow },  // the live parent purge lacked
      cascade: false,
      definitionsCache,
    })
  } catch (e) {
    console.warn(`[dedup-merge] recalc failed child=${child.kind} id=${child.id}`, e)
  }
}
// LIMITATION, stated rather than implied: this is ONE hop. A reparented deal's own
// formula values feed Deal.* into its activities, and a reparented person's feed
// Person.* into deals; those stay stale. Same class as the purge limitation recorded
// in STATE.md — but unlike purge, the first hop IS repairable here because the parent
// row exists.
```
`[Call shape VERIFIED against `RecalculateFormulasInput` at `src/lib/formula-recalc.ts:650+`; `ORG_REF_NAMES` must be derived from the organization's `ENTITY_NATIVE_ATTRIBUTES` + custom field names — the planner should confirm the exact derivation `parentChangedRefNames` expects.]`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `soundex` / `metaphone` phonetic matching | Trigram similarity with an IMMUTABLE normalization pipeline | `pg_trgm` GIN support has been standard since PG 9.1 | The phonetic functions in `fuzzystrmatch` encode **English** phonetics. On Portuguese names they are actively misleading. Do not reach for them. |
| Expression indexes on normalized text | **STORED generated columns** + a plain index | Generated columns arrived in PG 12; PG16 here | Measured 32× reduction in heap blocks on the bitmap recheck, and it removes the entire class of "the query's expression drifted from the index's" bugs. |
| Row-level pairwise blocking | Dictionary/name-level candidate generation, then expansion | Standard entity-resolution practice | Measured 65× fewer pairs and 3.7× faster on this dataset. |
| `unaccent()` directly in an index | `immutable_unaccent()` wrapper | Long-standing; `unaccent` has always been STABLE | Postgres rejects the direct form with a hard error. |

**Deprecated / outdated in this repo:**
- `src/lib/import/fuzzy-match.ts` — superseded in capability by the Postgres path. See § Don't Hand-Roll for the disposition decision.

---

## Runtime State Inventory

*(Not a rename/refactor phase, but this phase mutates live data and installs database-level objects, so the equivalent audit is worth having.)*

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `organizations` (46,054), `people` (38,348) gain a `norm_name` generated column; `notes` (29,038 organization rows) get reassigned by merges; `deals` (25,195) and `people` get reparented | Migration adds the column (2.4 s, ACCESS EXCLUSIVE, acceptable at boot). Merges mutate live rows inside a transaction. |
| Database objects | `pg_trgm` + `unaccent` extensions, `immutable_unaccent()`, `dedup_norm_*()`, 2 indexes per entity, `duplicate_pairs`, `dedup_scans` | All created by migration; all verified installable by the `pipelite` role unattended. |
| Live service config | **None.** No external service holds dedup state. | None |
| OS-registered state | **None.** | None |
| Secrets / env vars | **None new.** `UPLOAD_DIR`, `FILE_STORAGE` unchanged (B5 — no file movement). | None |
| Build artifacts | `instrumentation.js` copy into `.next/standalone` — pre-existing fragility, inherited if a boot-time reaper is added | Behavioural log gate, not a unit test |
| In-flight jobs | `dedup_scans` rows stranded at `status='running'` by a restart | A boot-time reaper is **mandatory** (see Pitfall 5) |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| PostgreSQL | everything | ✓ | **16.13** (alpine) | — |
| `pg_trgm` | fuzzy tier | ✓ *available, trusted, not installed* | 1.6 | — |
| `unaccent` | normalization | ✓ *available, trusted, not installed* | 1.1 | Skip accent folding; costs the 2,784 accented organizations |
| `fuzzystrmatch` | optional rescoring | ✓ *available, trusted, not installed* | 1.2 | Not needed |
| `btree_gin` | composite GIN, if ever needed | ✓ *available, trusted* | 1.3 | Not needed |
| Superuser / extension-create rights | the migration | ✓ `pipelite` has `rolsuper = t`, **and** both extensions are trusted | — | — |
| Docker + compose | app, DB, e2e | ✓ 3 services up | — | — |
| Playwright | R-1, R-2 | ✓ `node_modules/.bin/playwright`, `playwright.config.ts`, `e2e/.auth/` all present | ^1.62.1 | — |
| `shadcn` CLI | `radio-group` install | ✓ `node_modules/.bin/shadcn` | ^3.8.5 | Hand-write the 45-line component |
| vitest | unit gates | ✓ two projects | ^4.0.18 | — |
| `slopcheck` | package audit | ✓ `/home/pedro/.local/bin/slopcheck` | — | — |

`[All rows VERIFIED this session]`

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — everything needed is installed or trusted-installable.

> `npx` is broken in this repo for tool invocation: it resolves to `npm run` and fails with "Missing script" `[CITED: 39-UI-SPEC § Component Inventory]`. Use `./node_modules/.bin/<tool>`. The exception is `npx drizzle-kit migrate`, which project memory records as working — the plan should prefer `npm run db:migrate` (defined in `package.json`) to sidestep the question entirely.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` `[VERIFIED]`. This phase inherits Phase 45's topology verbatim.

### Test Framework

| Property | Value |
|---|---|
| Unit framework | vitest **4.0.18**, two projects: `vitest.config.ts` (`environment: 'node'`) and `vitest.rsc.config.ts` (`react-server` condition) |
| Unit include glob | `src/**/*.{test,spec}.?(c\|m)[jt]s?(x)` — **anchored at `src/`** |
| Quick run | `./node_modules/.bin/vitest run <path>` |
| Full suite | `npm run test` (= both projects; currently 2,224 + 8 passing) |
| Gates | `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint`) |
| E2E framework | Playwright ^1.62.1, config at `playwright.config.ts`, **no `webServer`** — attaches to the Docker app |
| E2E run | `./node_modules/.bin/playwright test` (23 assertions green today) |
| E2E auth | `e2e/auth.setup.ts` → `e2e/.auth/admin.json` storageState (gitignored) |
| CI | `.github/workflows/ci.yml`: `npm ci`, typecheck, lint, test. **No Docker, no DB.** Playwright must not enter it. |
| DOM testing | **None. There is no jsdom.** Component contracts use comment-stripped source scans via `readStrippedSource` from `src/components/custom-fields/__tests__/source-scan.ts` |

`[All VERIFIED: 45-RESEARCH cross-checked against the live filesystem this session]`

### Phase Requirements → Test Map

| Req | Behaviour | Test type | Automated command | File exists? |
|---|---|---|---|---|
| DEDUP-01 | Normalization: legal suffixes, accents, punctuation, the `S A` case, empty/short guard | unit | `./node_modules/.bin/vitest run src/lib/dedup/normalize.test.ts` | ❌ Wave 0 |
| DEDUP-01 | SQL↔TS normalization parity (only if a TS mirror is built) | unit | same file | ❌ Wave 0 |
| DEDUP-01 | Tier classification: certain vs likely vs neither, incl. the invalid-email rejection (B2) | unit | `./node_modules/.bin/vitest run src/lib/dedup/scoring.test.ts` | ❌ Wave 0 |
| DEDUP-01 | Blocking-key derivation (if a fallback path is kept) | unit | `./node_modules/.bin/vitest run src/lib/dedup/blocking.test.ts` | ❌ Wave 0 |
| DEDUP-01 | **The index is actually used** — `EXPLAIN` shows `Bitmap Index Scan on org_norm_trgm_idx` | manual/script | `docker compose exec -T postgres psql -U pipelite -d pipelite -c "EXPLAIN …"` | ❌ Wave 0 (a `scripts/dedup-checks.sql`, following the `scripts/audit-log-checks.sql` precedent) |
| DEDUP-01 | W-1..W-10: warning renders in-dialog, `target="_blank"` present, `dedup.merge.` appears **zero** times in both create dialogs (W-6) | source gate | `./node_modules/.bin/vitest run src/components/dedup/__tests__/duplicate-warning-wiring.test.ts` | ❌ Wave 0 |
| DEDUP-01 | P-3/P-4: poll shape — `setState` never in the effect body (K-7); four status branches present | source gate | `./node_modules/.bin/vitest run src/app/duplicates/__tests__/scan-panel-wiring.test.ts` | ❌ Wave 0 |
| DEDUP-01 | 69 `dedup.*` keys × 3 locales, exact-set `REQUIRED_DEDUP_KEYS`; `REQUIRED_AUDIT_KEYS` +4 | unit | `./node_modules/.bin/vitest run src/messages/locale-parity.test.ts` | ✅ **exists — must be extended** |
| DEDUP-02 | **Default-selection rule** (V-4): survivor wins, EXCEPT survivor-empty + loser-populated | unit | `./node_modules/.bin/vitest run src/lib/dedup/merge-defaults.test.ts` | ❌ Wave 0 |
| DEDUP-02 | M-3 field partitioning: conflicts / filled-only / identical (incl. both-empty → identical) | unit | `./node_modules/.bin/vitest run src/lib/dedup/field-groups.test.ts` | ❌ Wave 0 |
| DEDUP-02 | R-3: no unprefixed `grid-cols-2` in any merge component; M-9: no `sticky`/`fixed` on the submit row | source gate | `./node_modules/.bin/vitest run src/app/duplicates/__tests__/merge-form-wiring.test.ts` | ❌ Wave 0 |
| DEDUP-02 | R-2: `/duplicates/[pairId]` has no horizontal overflow at 320×640 in all three locales, with self-created + hard-deleted fixtures | e2e | `./node_modules/.bin/playwright test e2e/merge-screen-320.spec.ts` | ❌ Wave 0 |
| DEDUP-02 | R-1: `/duplicates` joins the viewport matrix (6×3 → 7×3 = 21) | e2e | `./node_modules/.bin/playwright test e2e/viewport-320.spec.ts` | ✅ **exists — must be extended** |
| DEDUP-03 | **Merge reassigns every child and orphans nothing** — deals, people, notes; loser soft-deleted; audit rows written | integration (real DB) | `./node_modules/.bin/vitest run src/lib/mutations/dedup.test.ts` | ❌ Wave 0 |
| DEDUP-03 | **B4: merging two records that BOTH have a `source='migration'` note succeeds** | integration (real DB) | same file | ❌ Wave 0 — **the single highest-value test in this phase** |
| DEDUP-03 | Transaction atomicity: an induced failure mid-merge leaves *both* records exactly as they were | integration (real DB) | same file | ❌ Wave 0 |
| DEDUP-03 | Activities are NOT reassigned and still resolve through their deal | integration (real DB) | same file | ❌ Wave 0 |
| DEDUP-03 | A-5/A-6 audit branches, brace-scoped so a negative assertion is not answered by unrelated code | source gate | `./node_modules/.bin/vitest run src/components/timeline/__tests__/merged-entry-wiring.test.ts` | ❌ Wave 0 |
| — | P-2 refactor did not leak: zero-line diff at both `ProgressBar` call sites | source gate / `git diff` | `git diff --stat src/app/import/import-wizard.tsx src/app/admin/import/pipedrive-api/steps/progress-step.tsx` | ❌ Wave 0 |

**Open question the planner must settle:** the four DEDUP-03 rows are marked *integration (real DB)*. **This repo has no existing DB-backed vitest precedent** — every mutation test in `src/lib/mutations/*.test.ts` mocks `db` `[VERIFIED: `grep`]`. Two options: (a) mock `db.transaction` and assert the *statements issued* (matches the repo, but proves nothing about `notes_migration_uniq`, which is a database-level constraint a mock cannot enforce); or (b) add a real-DB integration path against `localhost:5433`. **Option (a) cannot detect B4 — the exact bug most likely to ship.** Recommend (b) for `dedup.test.ts` only, or failing that, a `scripts/dedup-checks.sql` executed as an explicit verification step, following the `scripts/audit-log-checks.sql` precedent already in the repo.

### Sampling Rate

- **Per task commit:** `npm run typecheck && npm run lint` plus the one vitest file the task touches.
- **Per wave merge:** `npm run test` (both projects).
- **Before any Playwright run:** `docker compose up -d --build`, then wait for `http://localhost:3001`.
- **Before any migration verification:** `npm run db:migrate`, then `docker compose exec -T postgres psql -U pipelite -d pipelite -f scripts/dedup-checks.sql`.
- **Phase gate:** typecheck + lint + `npm run test` green, `./node_modules/.bin/playwright test` green (21 viewport + merge-screen + the existing 23), and the EXPLAIN check confirming index usage, before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `src/lib/dedup/` — the whole directory, with `normalize`, `scoring`, `merge-defaults`, `field-groups` and their tests
- [ ] `src/lib/mutations/dedup.test.ts` — and a decision on the real-DB question above
- [ ] `scripts/dedup-checks.sql` — EXPLAIN assertions, index existence, function volatility, `notes_migration_uniq` still present
- [ ] `src/messages/locale-parity.test.ts` — `REQUIRED_DEDUP_KEYS` (69, exact-set), `REQUIRED_AUDIT_KEYS` +4, ICU-plural coverage for the ten new plural keys
- [ ] `e2e/merge-screen-320.spec.ts` — with self-created, self-hard-deleted fixtures (45-08's rule)
- [ ] `e2e/viewport-320.spec.ts` — extend to `/duplicates`, with a per-route visible-element anchor before measuring (45-02's anti-vacuity rule)
- [ ] Four new `*-wiring.test.ts` source gates (warning, scan panel, merge form, merged audit entry)

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS category | Applies | Standard control in this phase |
|---|---|---|
| V2 Authentication | **yes** | Every new server action must open with `const session = await auth(); if (!session?.user?.id) return { success:false, error:"Not authenticated" }` **before** `runWithActor` — the T-36-02 ordering rule, so an unauthenticated call establishes no actor at all `[VERIFIED: `src/app/organizations/actions.ts:32-42`]` |
| V3 Session Management | **yes (test tier)** | `e2e/.auth/admin.json` holds a live JWT session cookie and is gitignored. The new merge-screen spec must reuse the existing storageState, never inline a password |
| V4 Access Control | **yes** | **`/duplicates` and `/duplicates/[pairId]` are new routes with no gate today.** `middleware.ts` gates `/admin/*` only. The merge is the most destructive operation in the app — the plan must decide whether it is admin-only or owner-scoped, and enforce it **server-side** in the page and in every action, not in the component. `deleteOrganization` already does a per-record ownership check `[VERIFIED]`; the merge touches two records and should check both |
| V5 Input Validation | **yes** | `pairId`, `survivorId` and the field-choice map all arrive from the client. **The survivor must be validated as one of the pair's two members**, server-side — otherwise a crafted request merges arbitrary records. Use `zod` (already a dependency) as the other actions do. Every dynamic value must reach Postgres as a **bound parameter**; the trigram queries in particular must never interpolate a name into SQL |
| V6 Cryptography | no | Nothing new |
| V7 Error Handling / Logging | **yes** | The merge's `catch` must return a fixed sentinel (`"Failed to merge"`), never the raw Postgres error — a 23505 message leaks the index name and the schema. The mutation-layer precedent already does this `[VERIFIED: `purgeOrganizationMutation`'s catch]` |

### Known Threat Patterns

| Pattern | STRIDE | Standard mitigation | Status here |
|---|---|---|---|
| Merging records the user cannot see | Elevation of privilege / Tampering | Server-side per-record permission check on **both** records | **Action required** — new routes, no gate yet |
| Survivor id not a member of the pair | Tampering | Validate `survivorId ∈ {pair.aId, pair.bId}` server-side | **Action required** |
| SQL injection via a name in a similarity query | Tampering | Bound parameters only; the normalization runs as a SQL *function*, never string concatenation | Drizzle parameterizes by default; **audit any raw `sql\`\`` template the plan introduces** |
| Raw DB error prose reaching the browser | Information disclosure | Fixed sentinel in the catch | Precedent exists; the new code must follow it |
| Enumeration via the create-time warning | Information disclosure | The warning reveals existing record names to any authenticated user creating a record | **Accepted** — it is the feature. But it means the warning must respect the same visibility rules as the list pages, or it becomes a read-oracle for records the user cannot otherwise see. **Planner decision.** |
| Path traversal in the file route | Tampering / Info disclosure | Validate/normalize path segments | **Pre-existing, out of scope, already logged in STATE.md** — `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts` builds `path.resolve(UPLOAD_DIR, entityId, fieldName, filename)` from URL segments and authorizes on `session?.user` alone. This phase does not touch the route (B5) and must not be blamed for it, but the plan should not *widen* it either |
| Slopsquatted dependency | Tampering | slopcheck + registry verification | **No new packages.** `slopcheck scan package.json` → 55 OK, 1 SUS (`vitest`, false positive), 0 SLOP |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Drizzle `^0.45.1` supports `.generatedAlwaysAs(sql\`…\`, { mode: "stored" })` on pg columns | § Materialize the normalized value | Medium. Falls back to a hand-written SQL migration plus a plain `text()` column in the Drizzle schema — more code, same result. **Verify against the installed typings before planning the migration task.** |
| A2 | `SET pg_trgm.similarity_threshold` (non-LOCAL) leaks across pooled postgres.js connections | § The scan | Low. `SET LOCAL` is correct regardless; the assumption only affects how strongly the plan words the warning. |
| A3 | The exact `changes` JSONB key shape for the `merged` audit row (`__merged`) renders acceptably through `describeField` / `AuditEntry` | § Code Examples | Medium. A bad key renders as an unlabelled field row in the timeline. The planner should read `src/lib/audit/present.ts`'s `describeField` and pick a shape it handles, or extend it. |
| A4 | `ORG_REF_NAMES` — the exact list `parentChangedRefNames` expects for a forced `Organization.*` refresh | § Formula recalculation | Medium. Wrong list → the recalc silently no-ops and reparented children keep stale values. Verify by reading `parentChangedRefNames` and `ENTITY_NATIVE_ATTRIBUTES`. |
| A5 | The 0.30-threshold row-level scan extrapolation (~26 min, ~14.5 M pairs) | § The scan | Low. It is extrapolated from a measured 500-row sample and is used only as a "don't do this" contrast; the recommended path is measured end to end. |
| A6 | ~40% of organization merges hit the `notes_migration_uniq` collision | § B4 | Low on direction, medium on magnitude. Derived as 0.63² assuming independence; actual duplicate pairs come from the same import so the real rate is likely **higher**, not lower. The mitigation is required either way. |
| A7 | `REQUIRED_AUDIT_KEYS` is 81 today and grows to 85 (from 39-UI-SPEC) | § Validation | Low. I counted **79** leaf keys under `audit.*` in `en-US.json`, which is not the same set as the contract list. The executor should read the constant, not trust either number. |
| A8 | The recommended similarity threshold is **0.85** | § The scan | Medium. Measured pair counts at 0.75 / 0.85 / 0.92 are 44,522 / 27,156 / 1,474 row-pairs (419 name-pairs at 0.85). Sampling shows 0.85–0.92 is high precision. But this is one dataset; making the threshold an `app_settings` value (explicitly within Claude's discretion) hedges it cheaply. |

---

## Open Questions (RESOLVED)

> **All five closed 2026-08-18, after this document was written.** Resolutions live in the artifacts
> named per question below, not here — this section is left intact so the reasoning that produced the
> questions survives alongside the answers.
>
> | # | Resolution | Where |
> |---|---|---|
> | 1 | Organization identity key is **admin-configurable** custom fields (this deployment: CNPJ/CPF, then contact email); degrades to no certain tier when unset | `39-CONTEXT.md` § Post-Research Decisions; implemented in 39-01 / 39-08 |
> | 2 | **Admin-only.** `/duplicates` gets a role-checked layout plus a re-check in every server action — note `middleware.ts` performs NO role check, so the gate is written by this phase, not inherited | `39-CONTEXT.md` § Post-Research Decisions; implemented in 39-11 |
> | 3 | **Real-DB integration tests**, scoped to the merge mutation only, with a CI-exclusion story | `39-CONTEXT.md` § Post-Research Decisions, `39-VALIDATION.md` V-1; implemented in 39-10 |
> | 4 | **DECLINED for this phase.** The group-size hint ("and 632 more like this") is not built. Star pairing already stops the list exploding, and pair-at-a-time is what CONTEXT locks; the hint needs a new message key and changes the approved copy contract. Recorded as a deliberate non-action, adjacent to the already-deferred automatic merging — not an oversight | this table; deferred alongside auto-merge in `39-CONTEXT.md` § Deferred Ideas |
> | 5 | Pairs referencing a merged loser are marked **`superseded` inside the merge transaction**, and the next scan regenerates | implemented in 39-09 |


1. **How is the organization *certain* tier redefined? (B1)**
   - What we know: `website` is NULL on 100% of rows; the locked rule cannot fire. `CNPJ / CPF` (11.5%) and `E-mail de Contato 1` (55.4%) are the only real discriminators and both live in deployment-specific custom field *names*.
   - What's unclear: whether the product accepts a configurable identity field, or accepts that organizations get no create-time warning.
   - **Recommendation: back to the user via discuss-phase.** This invalidates a locked decision; it is not the planner's to decide unilaterally.

2. **Is `/duplicates` admin-only?**
   - What we know: merge is the most destructive operation in the app; `middleware.ts` gates `/admin/*` only; the UI-SPEC places the route at `/duplicates` (not under `/admin`) and puts entry points on the `/organizations` and `/people` toolbars, which any authenticated user sees.
   - What's unclear: the intended permission model.
   - **Recommendation:** at minimum enforce the same per-record ownership check `deleteOrganization` uses, on **both** records. Ask the user whether it should be admin-only outright.

3. **Real-DB integration tests, or statement-level mocks?**
   - What we know: every existing mutation test mocks `db`. A mock cannot enforce `notes_migration_uniq`, which is the bug most likely to ship.
   - **Recommendation:** a `scripts/dedup-checks.sql` verification step at minimum (the `audit-log-checks.sql` precedent), a real-DB vitest path if the planner is willing to introduce one.

4. **How does the pair list present a 634-member cluster?**
   - What we know: star pairing yields 633 pairs for that one cluster, all pointing at the same canonical record. At 25/page that is 26 pages of near-identical cards, and collapsing it requires 633 separate merges.
   - What's unclear: whether this is acceptable, or whether the pair card should show "and 632 more like this".
   - **Recommendation:** ship pair-at-a-time (it is what is locked), but surface the group size on the card so the user understands the shape of the backlog. Log "merge a whole cluster" as a deferred idea — CONTEXT already defers automatic merging, and this is adjacent.

5. **What happens to other pairs referencing a merged loser?**
   - What we know: after merging A←B, any pair (B, C) is now stale — C should probably be compared against A.
   - What's unclear: cascade-update, invalidate, or leave for the next scan.
   - **Recommendation:** mark them `superseded` inside the merge transaction (step 9) and let the next scan regenerate. Leaving them live means the user clicks into a merge screen whose loser is already in Trash — which M-8's "one record already gone" state exists to handle, but should be the rare case, not the common one.

---

## Sources

### Primary (HIGH confidence — measured or read this session)

- **Live Postgres 16.13** at `localhost:5433` — every scale number in this document. Extensions installed, indexes built, queries EXPLAIN-ANALYZEd, then **all artifacts dropped**; `\dx` shows `plpgsql` only and `\d organizations` matches its pre-research shape.
- `pg_constraint`, `information_schema.columns`, `pg_proc`, `pg_available_extension_versions`, `pg_roles` — the child inventory, function volatility, extension trust, role privileges.
- Source reads: `src/lib/mutations/organizations.ts`, `src/lib/mutations/people.ts`, `src/lib/audit/actor-context.ts`, `src/lib/events/subscribers/audit.ts`, `src/lib/events/bus.ts`, `src/db/schema/audit-log.ts`, `src/db/schema/notes.ts`, `src/lib/formula-recalc.ts`, `src/lib/import/fuzzy-match.ts`, `src/lib/import/pipedrive-import-state.ts`, `src/lib/import/pipedrive-api-import-actions.ts`, `src/lib/import/import-session-cleanup.ts`, `src/lib/execution/execution-processor.ts`, `src/app/api/upload/route.ts`, `src/app/api/files/[entityId]/[fieldName]/[filename]/route.ts`, `src/components/custom-fields/file-field.tsx`, `src/app/admin/import/pipedrive-api/steps/progress-step.tsx`, `src/app/admin/import/pipedrive-api/pipedrive-api-wizard.tsx`, `instrumentation.ts`, `Dockerfile`, `package.json`.
- `docker compose logs app` (via `rtk proxy`) — all six processors confirmed running; migrations confirmed auto-applying at boot.
- `slopcheck scan package.json` — 55 OK, 1 SUS, 0 SLOP.

### Secondary (MEDIUM confidence)

- `.planning/phases/39-duplicate-detection-merge/39-CONTEXT.md` — locked decisions, scout findings.
- `.planning/phases/39-duplicate-detection-merge/39-UI-SPEC.md` — surface contracts, message-key catalog, verification surfaces. Its A-1 claim is corrected in B3.
- `.planning/phases/45-cross-cutting-ui-repair-and-uat-closure/45-RESEARCH.md` — validation topology, cross-checked against the live filesystem.
- `.planning/STATE.md` — the purge/formula-staleness limitation (WR-02), the file-blob leak (CR-01), the Phase 44 parity-test precedent.

### Tertiary (LOW confidence — training knowledge, flagged in the Assumptions Log)

- Drizzle ORM's generated-column builder API (A1).
- postgres.js connection-reuse semantics as they affect GUC leakage (A2).

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Scale numbers and the scan design | **HIGH** | Every figure measured against the live 46,054-row / 38,348-row database with `EXPLAIN (ANALYZE, BUFFERS)` and wall-clock timing. The one extrapolated figure is labelled. |
| Merge transaction feasibility | **HIGH** | Worst-case child volume measured (114 rows); an identical shipped precedent read line by line. |
| Child inventory completeness | **HIGH** | Derived from `pg_constraint` and a full `information_schema.columns` scan, not from reading schema files. |
| The four blockers (B1–B5) | **HIGH** | Each proven by a query or a source read; B5 additionally contradicts CONTEXT in the *helpful* direction. |
| Background job mechanism | **HIGH** | Two working in-repo patterns read in full; the running container confirms both are live. |
| Formula recalculation | **MEDIUM-HIGH** | The API shape is verified and the call is expressible; the exact `ORG_REF_NAMES` derivation is A4. |
| Threshold recommendation (0.85) | **MEDIUM** | Three thresholds measured and the 0.85–0.92 band sampled by eye — but one dataset, and precision was judged, not scored against ground truth. |
| Drizzle generated-column support | **LOW-MEDIUM** | A1 — training knowledge, no in-repo precedent. Flagged for verification. |

**Research date:** 2026-08-19
**Valid until:** 2026-09-18 (30 days). The scale measurements decay as the database grows; re-measure if row counts change by more than ~20%. Extension versions and the Postgres major are stable.

**Database state after research:** restored exactly. `select extname from pg_extension` → `plpgsql` only. No `norm_name` column, no dedup indexes, no dedup functions, no probe tables. Working tree clean (`git status --porcelain` empty), `node_modules` restored via `npm ci` after the `slopcheck install` incident.
