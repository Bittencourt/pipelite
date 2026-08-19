# Phase 39: Duplicate Detection & Merge - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — 16 decisions across 4 areas, all accepted as recommended

<domain>
## Phase Boundary

Duplicates entering through the importer or manual entry are caught and collapsible without data
loss. Three capabilities:

1. **Detection at create time** — saving an organization or person that matches an existing record
   warns before the record is committed.
2. **On-demand scan** — a user scans an entity type and gets a list of likely duplicate pairs.
3. **Merge** — a user collapses two records, choosing the winning value field by field, with every
   child (deal, activity, note, file, custom field value) ending up on the survivor and the merge
   visible in the survivor's change history.

Explicitly NOT in scope: automatic merging without human confirmation, cross-entity-type matching
(a person is never a duplicate of an organization), deduplication of deals or activities, and any
change to how the Pipedrive importer maps fields. The importer is touched only to the extent of
reporting matched rows.

</domain>

<decisions>
## Implementation Decisions

### Matching Strategy at Scale

- **Fuzzy matching runs in Postgres via `pg_trgm`**, installed by migration with a GIN index on the
  compared expressions. `pg_trgm`, `fuzzystrmatch` and `unaccent` are all *available but not
  installed* in this database (verified). Rationale: this is not a preference, it is a scale
  constraint — 46,054 organizations compared pairwise is ~2.1 billion comparisons and cannot happen
  inside a request or in application memory.
- **Block first, compare within blocks.** Candidate pairs must share a cheap blocking key (normalized
  first significant token of the name, or email domain) before any similarity function runs. A
  trigram index alone still degrades badly on this dataset because it is full of shared prefixes
  ("CONDOMINIO …", "COND DO ED …", "SUPERMERCADO …" all appear many times in the live data).
- **Compared fields.** Organization: normalized name plus website domain. Person: email as an exact
  match first, then normalized name plus phone. Name-only matching is explicitly rejected — the live
  organization table has heavy shared prefixes and would produce an unusable false-positive rate.
- **Two confidence tiers, not one threshold.** *Certain* = identical email, or identical normalized
  name + identical domain. *Likely* = above the similarity threshold. Only *certain* matches are
  surfaced at create time; *likely* matches belong to the scan. A single flat threshold would leave
  nothing trustworthy enough to interrupt a user mid-create.

### Create-Time Warning

- **Fires server-side on submit, before the insert commits.** Not on field blur. A client-side blur
  check is bypassable and — decisively — the importer never blurs anything, so a client-only check
  cannot cover the phase goal's stated duplicate source.
- **Advisory, never blocking.** Show the matches and require an explicit "create anyway". A user with
  legitimate knowledge (two genuinely distinct companies sharing a name) must be able to proceed.
- **Three actions offered: open the existing record, create anyway, cancel.** Deliberately NOT
  "merge now" — merging an unsaved draft into an existing record is a different operation with no
  losing record to trash and no field history to reconcile. Keep merge to two persisted records.
- **The importer gets a report, not a prompt.** An import of thousands of rows cannot stop for each
  match. Matched rows are flagged in the import summary and the user runs a scan afterwards. This
  satisfies "duplicates entering through the importer are caught" without making the importer
  interactive.

### On-Demand Scan

- **Runs as a background job with progress**, not inside the HTTP request. A full organization scan
  touches 46,054 rows; a request-bound scan cannot finish.
- **Results are persisted** in a `duplicate_pairs` table. A scan is expensive; recomputing it per page
  view throws the work away and makes dismissal impossible to represent.
- **A pair can be dismissed as "not a duplicate", and the dismissal sticks** across future scans.
  Without this, the same false pairs reappear after every scan and the feature is abandoned. This is
  a functional requirement, not a nicety.
- **Scan scope is a whole entity type, one type at a time.**

### Merge Semantics

- **The losing record is soft-deleted to Trash, attributed to the user who merged.** Phase 37 already
  makes soft-deleted records restorable and Phase 36 logs the deletion with an actor. A hard delete
  would make the single most destructive operation in the app irreversible.
- **The field picker pre-selects the survivor's value, except where the survivor's is empty and the
  loser's is not.** That empty-vs-populated case is the common real one and defaulting it correctly
  removes most of the clicks.
- **File blobs stay where they are; the survivor's field reference keeps the loser's id in the path.**
  Uploaded files live at `UPLOAD_DIR/<entityId>/<fieldName>/<storedName>` — keyed by entity id — so
  moving a file custom field from loser to survivor would otherwise dangle. Rationale for not moving
  the bytes: relocating files means irreversible disk (or S3) I/O inside a destructive operation,
  which is the same hazard Phase 37 deliberately scoped out of purge. The download route must
  therefore resolve the stored path rather than assuming it matches the record being viewed.
- **Audit shape:** one explicit `merged` entry on the survivor naming the losing record and the field
  choices made, alongside the normal per-field diff; the loser gets its usual `deleted` entry. A
  single opaque "merged" line would not satisfy "the merge is visible in the change history" in any
  useful sense.

### Claude's Discretion

- The exact similarity threshold value, and whether it is a constant or an app setting.
- The normalization function's specifics (case folding, accent stripping via `unaccent`, punctuation
  and legal-suffix handling such as LTDA / ME / S.A.).
- The `duplicate_pairs` table's exact columns and how dismissal is represented (a status column
  versus a separate dismissals table).
- Background job mechanism — whether it reuses any existing worker/processor pattern in the repo or
  introduces a minimal one.
- Merge UI layout (side-by-side columns versus a stacked field list).

</decisions>

<code_context>
## Existing Code Insights

### Measured Scale (live database, verified 2026-08-18)

| Table | Rows (not soft-deleted) |
|---|---|
| organizations | 46,054 |
| people | 38,348 |
| activities | 79,022 |
| notes | 75,236 |
| deals | 25,195 |

This scale is the phase's dominant design constraint and every plan must respect it.

### Two Traps Found During Scout

1. **Notes are polymorphic with NO foreign key.** `src/db/schema/notes.ts` carries
   `entity_type` + `entity_id` as plain text columns. A merge must reassign them with an explicit
   `UPDATE notes SET entity_id = <survivor> WHERE entity_type = '<type>' AND entity_id = <loser>`,
   and **nothing at the database level will catch a missed reassignment** — there is no referential
   integrity to violate. 75,236 rows. `audit_log` is polymorphic the same way.
2. **File blobs are keyed by entity id.** `src/app/api/upload/route.ts:91` resolves
   `path.resolve(UPLOAD_DIR, entityId, fieldName)`. See the locked decision above.

### Relationship Map for Merge

- `people.organizationId` → organizations
- `deals.organizationId` → organizations, `deals.personId` → people
- **Activities attach to deals only** (`activities.dealId`); they have no direct organization or
  person link, so they follow their deal automatically. The success criterion's "every activity"
  is satisfied transitively — plans should state that explicitly rather than writing a no-op
  activity reassignment.
- Notes attach polymorphically (see trap 1).
- Custom field values live in a `customFields` JSONB column on each entity.

### Established Patterns

- Server actions return `{ success: true/false, error/id }`.
- Mutations live in `src/lib/mutations/` (introduced Phase 34) and are the reusable DB layer.
- `runWithActor` wraps writes so `audit_log` gets a real actor — a merge must run inside it, or the
  audit entries will be attributed to `system`.
- Soft delete + Trash + restore already exist from Phase 37.
- The audit timeline renderer is `src/components/timeline/audit-entry.tsx`; a new `merged` action
  will need presentation there and a translated sentence in all three locales.
- No jsdom in this repo. Pure logic (normalization, blocking key derivation, pair scoring) belongs in
  testable functions under `src/lib/`; component decisions use source-scan gates.
- Migrations run via `npx drizzle-kit migrate` against `localhost:5433`.

### Integration Points

- New migration installing `pg_trgm` and creating the GIN index(es) and the `duplicate_pairs` table.
- Create-time check hooks into the organization and person create server actions.
- Import summary surface for the flagged-rows report.
- A new scan/review UI, plus the merge screen.
- Trash (loser lands there), audit timeline (the `merged` entry), and all three locale catalogs.

</code_context>

<specifics>
## Specific Ideas

- The live organization data is dominated by shared prefixes — "CONDOMINIO", "COND DO ED",
  "SUPERMERCADO", "AUTO POSTO", "NEGOCIO" recur constantly. Any matching design must be evaluated
  against that reality, not against synthetic names, or it will look excellent in tests and be
  useless in production.
- Brazilian legal suffixes (LTDA, ME, EIRELI, S.A.) are noise for matching purposes and should
  normalize away.
- Phase 38 established that per-record operations must name the individual record that failed rather
  than swallowing it into a count. A merge touching many child rows should follow the same
  principle where a partial failure is possible.

</specifics>

<deferred>
## Deferred Ideas

- Automatic/unattended merging of high-confidence pairs.
- Deduplication of deals and activities.
- Cross-entity-type matching.
- Relocating file blobs to the survivor's path (see the locked decision — deliberately not done).
- Any redesign of the Pipedrive importer's field mapping.

</deferred>
