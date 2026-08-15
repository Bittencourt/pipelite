-- =============================================================================
-- reconcile-notes.sql — the SC-4 / NOTE-03 proof for the legacy-notes migration
-- =============================================================================
--
-- WHAT THIS PROVES
--   Migration 0013 copied every non-empty legacy `notes` column value on deals,
--   organizations, people and activities into the `notes` table as a row with
--   source = 'migration'. This file proves that twice over:
--     Part 1 — count reconciliation:  every row must show  delta = 0
--     Part 2 — byte reconciliation:   every row must show  mismatched = 0
--   A count match alone does not prove the absence of truncation or encoding
--   damage. Part 2 compares the stored content to the legacy column byte for
--   byte. BOTH parts must return all zeros for SC-4 to hold.
--
-- HOW TO RUN
--   docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/reconcile-notes.sql
--
--   psql runs on the container's unix socket, so no password is passed and none
--   may ever be added to this file or to the command line (T-35-17).
--
-- WHERE THIS LIVES
--   `scripts/` is a new directory in this repo and this is its first checked-in
--   `.sql` artifact. A checked-in SQL file, rather than a vitest test, is the
--   right home for this: the vitest suite mocks `@/db` entirely, so there is no
--   live-database integration harness here to hang a real reconciliation off.
--
-- NO SOFT-DELETE CARVE-OUT IN PART 1
--   Part 1's predicates are character-for-character identical to the migration's
--   four WHERE clauses, including the deliberate ABSENCE of any `deleted_at`
--   filter (D-18). Notes on soft-deleted parent records ARE migrated, so SC-4 is
--   an exact equality with no carve-out on either side, and Phase 37's Trash &
--   Restore will find note history intact. Adding a `deleted_at` filter to either
--   side of PART 1 would make it report a false delta.
--
--   Part 2 is a different question and carries its own predicates — see its header.
--
-- THIS FILE IS ALSO A PERMANENT REGRESSION DETECTOR (Pitfall 6)
--   The migration runs exactly once. These five call sites still WRITE the legacy
--   `notes` column and were deliberately left alone by Phase 35:
--     1. src/lib/import/validators.ts
--     2. src/lib/import/pipedrive-mapping.ts
--     3. src/lib/import/pipedrive-api-transformers.ts
--     4. src/app/import/actions.ts
--     5. the /api/v1 create and update routes (deals, organizations, people,
--        activities — including their batch variants)
--   Therefore a NON-ZERO `delta` when this file is re-run after Phase 35 means
--   something wrote to the legacy column after the migration ran — most likely an
--   import. That is the sanctioned detection mechanism. Fixing those writers to
--   target the `notes` table is explicitly OUT OF SCOPE for this phase.
--
-- KNOWN INHERITED STATE (Pitfall 7)
--   `{{Notes}}` formula custom fields still read the now-dormant legacy column, so
--   their values freeze at whatever the legacy column held at migration time. This
--   is a known inherited state that belongs to the phase which drops the legacy
--   column, not a bug to fix here.
--
-- MEASURED BASELINE (live database, 2026-08-15, PostgreSQL 16.13)
--   deal 0/0/0 · organization 29,037/29,037/0 · person 0/0/0 · activity 46,198/46,198/0
--   Byte mismatches: 0 for all four entity types, over the 75,235 migrated rows that
--   are still in their as-migrated state — which, at the baseline, is all of them.
--   Part 2 carries the `updated_at = created_at AND deleted_at IS NULL` predicate
--   described in its own header; it did not change any baseline number, because
--   nothing had been edited or deleted when the baseline was taken.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SC-4 part 1: count reconciliation. Every row must show delta = 0.
-- -----------------------------------------------------------------------------
SELECT
  e.entity_type,
  e.legacy_nonempty,
  (SELECT count(*) FROM notes n
    WHERE n.entity_type = e.entity_type AND n.source = 'migration') AS migrated,
  e.legacy_nonempty
    - (SELECT count(*) FROM notes n
        WHERE n.entity_type = e.entity_type AND n.source = 'migration') AS delta
FROM (
  SELECT 'deal'         AS entity_type, count(*) AS legacy_nonempty FROM deals         WHERE notes IS NOT NULL AND btrim(notes) <> ''
  UNION ALL SELECT 'organization', count(*) FROM organizations WHERE notes IS NOT NULL AND btrim(notes) <> ''
  UNION ALL SELECT 'person',       count(*) FROM people        WHERE notes IS NOT NULL AND btrim(notes) <> ''
  UNION ALL SELECT 'activity',     count(*) FROM activities    WHERE notes IS NOT NULL AND btrim(notes) <> ''
) e;


-- -----------------------------------------------------------------------------
-- SC-4 part 2: BYTE-LEVEL reconciliation. A count match does not prove no
-- truncation or encoding damage — this does. Every row must show mismatched = 0.
--
-- SCOPED TO ROWS STILL IN THEIR AS-MIGRATED STATE
--   Part 2 proves the MIGRATION was byte-identical. It cannot also prove that
--   nobody has since edited a migrated note, because the whole point of this
--   phase is that migrated notes are now editable in the record timeline (D-02).
--   Without the two predicates below, the first user to fix a typo in a migrated
--   note pushes `mismatched` to 1 and it never returns to 0 — a permanent false
--   failure in a file that calls itself a regression detector and instructs that
--   every row must show 0.
--
--     n.updated_at = n.created_at   the note has never been edited. Migration 0013
--                                   writes the two equal; `updateNoteMutation`
--                                   stamps `updated_at` and never touches
--                                   `created_at`, which is also what drives the
--                                   UI's "edited" marker.
--     n.deleted_at IS NULL          the note has not been soft-deleted. A deleted
--                                   note's content is retained but is no longer a
--                                   claim about the legacy column.
--
--   Note this is NOT the carve-out part 1 forbids: part 1 still counts every
--   migrated row regardless of `deleted_at`, so the exact equality D-18 requires
--   is untouched. Edits and soft deletes do not perturb part 1 at all — it counts
--   rows, not content.
-- -----------------------------------------------------------------------------
SELECT 'organization' AS entity_type,
       count(*) FILTER (WHERE n.content IS DISTINCT FROM o.notes) AS mismatched
  FROM organizations o
  JOIN notes n ON n.entity_type = 'organization' AND n.entity_id = o.id AND n.source = 'migration'
              AND n.updated_at = n.created_at AND n.deleted_at IS NULL
UNION ALL
SELECT 'activity',
       count(*) FILTER (WHERE n.content IS DISTINCT FROM a.notes)
  FROM activities a
  JOIN notes n ON n.entity_type = 'activity' AND n.entity_id = a.id AND n.source = 'migration'
              AND n.updated_at = n.created_at AND n.deleted_at IS NULL
UNION ALL
SELECT 'deal',
       count(*) FILTER (WHERE n.content IS DISTINCT FROM d.notes)
  FROM deals d
  JOIN notes n ON n.entity_type = 'deal' AND n.entity_id = d.id AND n.source = 'migration'
              AND n.updated_at = n.created_at AND n.deleted_at IS NULL
UNION ALL
SELECT 'person',
       count(*) FILTER (WHERE n.content IS DISTINCT FROM p.notes)
  FROM people p
  JOIN notes n ON n.entity_type = 'person' AND n.entity_id = p.id AND n.source = 'migration'
              AND n.updated_at = n.created_at AND n.deleted_at IS NULL;
