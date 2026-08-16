-- =============================================================================
-- trash-checks.sql — the standing database evidence for Phase 37 (Trash & Restore)
-- =============================================================================
--
-- WHY THIS FILE EXISTS
--   Every purge unit test in this repository mocks `@/db` wholesale, and a mocked
--   `db.delete` cannot raise SQLSTATE 23503. The ordered teardown in
--   `src/lib/mutations/{deals,people,organizations,activities}.ts` is therefore
--   asserted by the vitest suite only as a CALL ORDER — never as a fact about the
--   real foreign keys it exists to satisfy. This file is the other half of that
--   proof, and it is the only part of it that talks to a real database.
--
-- WHAT THIS PROVES
--   Part 0 — preconditions, plus a before-snapshot of every table this script
--            touches, so Part 7 can prove the script mutated nothing.
--   Part 1 — the foreign-key inventory pointing at the four CRM tables is
--            unchanged: exactly six constraints, all ON DELETE NO ACTION
--            (`confdeltype = 'a'`). A seventh means the teardown is incomplete;
--            a cascade means it has become redundant. Either way this part says so.
--   Part 2 — a bare DELETE still fails, per foreign key. Seven probes: one per
--            constraint in Part 1, plus `activities`, which is a true leaf and
--            whose bare delete SUCCEEDS. The asymmetry is documented rather than
--            assumed. This is the standing proof that the ordered teardown is
--            NECESSARY and not merely defensive.
--   Part 3 — the full teardown succeeds, per entity type, replaying the mutation
--            layer's ordering in SQL: notes -> pure join rows -> detach the
--            independent children's foreign keys -> the row itself. Each block
--            asserts zero dangling `notes`, zero orphaned `deal_assignees` and
--            `deal_stage_history`, and that every detached child's foreign key is
--            now NULL while the child row itself still EXISTS (T-37-16).
--   Part 4 — the audit log survived. Asserted inside the Part 3 deal transaction:
--            the record's pre-existing `audit_log` rows are still present after
--            the parent row is gone. `audit_log.entity_id` carries no foreign key
--            BY DESIGN (src/db/schema/audit-log.ts) and this is what keeps it that
--            way (T-37-07).
--   Part 5 — the seeded retention default is present as DATA. If a future
--            migration or a botched restore drops it, the pruner silently stops
--            purging and this part is the standing detector (T-37-05).
--   Part 6 — the pruner's expired-id query and the plan the planner actually
--            chooses for it, against `deals_deleted_at_idx`.
--   Part 7 — the after-snapshot. Every table Part 0 counted must be unchanged.
--            This is the assertion that the BEGIN ... ROLLBACK wrappers held.
--
-- HOW TO RUN
--   docker compose exec -T postgres psql -U pipelite -d pipelite -f - < scripts/trash-checks.sql
--
--   or, equivalently, against the running container by name:
--
--   docker exec -i pipelite-postgres-1 psql -U pipelite -d pipelite -f - < scripts/trash-checks.sql
--
--   psql reaches the server over the container's local unix socket, so NO
--   credential is passed on the command line, none is read from the environment,
--   and none may ever be written into this file. Anything that would need one is
--   out of scope for this script (T-37-37).
--
--   Run it with ON_ERROR_STOP unset or 0. Part 2 raises deliberate errors, and
--   ON_ERROR_STOP=1 would abort the run at the first of them — which is the point
--   of that part, not a failure of it.
--
-- IT IS RE-RUNNABLE AND MUTATES NOTHING
--   Every destructive probe is wrapped in BEGIN ... ROLLBACK. DO NOT UNWRAP THEM.
--   Parts 2 and 3 create their own fixture rows inside those transactions rather
--   than operating on real records, so the script neither depends on trash holding
--   anything nor risks a real record if a wrapper is ever removed by accident.
--   Every fixture id carries the `tck-` prefix; Part 7 asserts that no row with
--   that prefix survives the run, and that the row counts are byte-identical to
--   Part 0's.
--
-- WHY FIXTURES RATHER THAN REAL TRASHED RECORDS
--   The Phase 37 retention pruner runs daily in the container on a 30-day window,
--   so what is in trash on any given day is not something this script may assume.
--   A fixture makes every part deterministic, and makes Part 2 able to name ONE
--   specific constraint per probe: a deal with three kinds of child raises
--   whichever violation Postgres checks first, which would prove one of the three
--   and silently skip the other two.
--
-- =============================================================================


\echo ''
\echo '###############################################################################'
\echo '# PART 0 — preconditions and the BEFORE snapshot'
\echo '###############################################################################'
\echo ''
\echo '--- 0a. Reference rows the fixtures need. All three must be present. ---'

SELECT
  (SELECT count(*) FROM users)           AS users,
  (SELECT count(*) FROM stages)          AS stages,
  (SELECT count(*) FROM activity_types)  AS activity_types,
  CASE
    WHEN (SELECT count(*) FROM users) > 0
     AND (SELECT count(*) FROM stages) > 0
     AND (SELECT count(*) FROM activity_types) > 0
    THEN 'PASS — fixtures can be built'
    ELSE 'FAIL — a reference table is empty; Parts 2 and 3 cannot run'
  END AS verdict;

\echo ''
\echo '--- 0b. No fixture from a previous run survives. Every count must be 0. ---'

SELECT
  (SELECT count(*) FROM deals              WHERE id      LIKE 'tck-%') AS deals,
  (SELECT count(*) FROM people             WHERE id      LIKE 'tck-%') AS people,
  (SELECT count(*) FROM organizations      WHERE id      LIKE 'tck-%') AS organizations,
  (SELECT count(*) FROM activities         WHERE id      LIKE 'tck-%') AS activities,
  (SELECT count(*) FROM notes              WHERE id      LIKE 'tck-%') AS notes,
  (SELECT count(*) FROM deal_assignees     WHERE deal_id LIKE 'tck-%') AS deal_assignees,
  (SELECT count(*) FROM deal_stage_history WHERE id      LIKE 'tck-%') AS deal_stage_history,
  (SELECT count(*) FROM audit_log          WHERE id      LIKE 'tck-%') AS audit_log;

\echo ''
\echo '--- 0c. BEFORE snapshot, held in a TEMP table for Part 7 to compare against. ---'
\echo '    A temp table lives in this session only and is gone when psql exits.'

DROP TABLE IF EXISTS pg_temp.trash_checks_before;

CREATE TEMP TABLE trash_checks_before AS
            SELECT 'activities'         AS tbl, count(*) AS n FROM activities
  UNION ALL SELECT 'audit_log',              count(*) FROM audit_log
  UNION ALL SELECT 'deal_assignees',         count(*) FROM deal_assignees
  UNION ALL SELECT 'deal_stage_history',     count(*) FROM deal_stage_history
  UNION ALL SELECT 'deals',                  count(*) FROM deals
  UNION ALL SELECT 'notes',                  count(*) FROM notes
  UNION ALL SELECT 'organizations',          count(*) FROM organizations
  UNION ALL SELECT 'people',                 count(*) FROM people;

SELECT tbl, n AS rows_before FROM trash_checks_before ORDER BY tbl;


\echo ''
\echo '###############################################################################'
\echo '# PART 1 — the foreign-key inventory pointing at the four CRM tables'
\echo '###############################################################################'
\echo ''
\echo '--- 1a. The inventory. Expect exactly the six rows below, all confdeltype = a. ---'
\echo '    activities_deal_id_deals_id_fk              activities.deal_id       -> deals          nullable'
\echo '    deal_assignees_deal_id_deals_id_fk          deal_assignees.deal_id   -> deals          NOT NULL'
\echo '    deal_stage_history_deal_id_deals_id_fk      deal_stage_history.deal_id -> deals        NOT NULL'
\echo '    deals_organization_id_organizations_id_fk   deals.organization_id    -> organizations  nullable'
\echo '    deals_person_id_people_id_fk                deals.person_id          -> people         nullable'
\echo '    people_organization_id_organizations_id_fk  people.organization_id   -> organizations  nullable'

SELECT
  c.conname,
  c.conrelid::regclass::text  AS child_table,
  a.attname                   AS child_column,
  c.confrelid::regclass::text AS parent_table,
  c.confdeltype,
  NOT a.attnotnull            AS child_column_nullable
FROM pg_constraint c
JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND c.confrelid IN (
    'deals'::regclass, 'people'::regclass,
    'organizations'::regclass, 'activities'::regclass
  )
ORDER BY c.conname;

\echo ''
\echo '--- 1b. The inventory, ASSERTED rather than merely listed. ---'
\echo '    A seventh foreign key means the teardown in src/lib/mutations/ is now'
\echo '    incomplete. A confdeltype other than a means the database has taken over'
\echo '    a disposition the mutation layer still performs by hand.'

SELECT
  count(*)                                        AS crm_fk_count,
  count(*) FILTER (WHERE confdeltype = 'a')       AS no_action_count,
  count(*) FILTER (WHERE confdeltype <> 'a')      AS non_no_action_count,
  CASE
    WHEN count(*) = 6 AND count(*) FILTER (WHERE confdeltype <> 'a') = 0
    THEN 'PASS'
    ELSE 'FAIL — the purge teardown no longer matches the catalog'
  END AS verdict
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid IN (
    'deals'::regclass, 'people'::regclass,
    'organizations'::regclass, 'activities'::regclass
  );

\echo ''
\echo '--- 1c. The two POLYMORPHIC references, which carry no foreign key at all. ---'
\echo '    notes.entity_id      — polymorphic, so a purge must delete its notes by hand.'
\echo '    audit_log.entity_id  — deliberately unconstrained, so a purge cannot erase'
\echo '                           the evidence of the purge. Part 4 proves it.'
\echo '    Expect 0 rows. A row here would mean one of them gained a constraint.'

SELECT c.conname, c.conrelid::regclass::text AS child_table, a.attname AS child_column
FROM pg_constraint c
JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND c.conrelid IN ('notes'::regclass, 'audit_log'::regclass)
  AND a.attname IN ('entity_id', 'entity_type');


\echo ''
\echo '###############################################################################'
\echo '# PART 2 — a bare DELETE still fails, per foreign key'
\echo '###############################################################################'
\echo ''
\echo '  Seven probes, each in its OWN transaction because psql aborts a transaction'
\echo '  on error and nothing after the failing statement would run. Six are expected'
\echo '  to RAISE; the seventh is expected to SUCCEED.'
\echo ''
\echo '  Each probe builds its own parent and its own single child, so the constraint'
\echo '  named in the error is the one the probe is about. Every block ROLLBACKs.'
\echo ''
\echo '  READING THE OUTPUT: psql writes these labels to stdout and errors to stderr.'
\echo '  If you merged the two streams (2>&1) they buffer independently and an error'
\echo '  can print one section LATE, under the next probe heading. Do not match errors'
\echo '  to headings by position — match them by the tck- id in the DETAIL line, which'
\echo '  names the probe that raised it.'
\echo ''

\echo '--- 2a. deal with an ACTIVITY. Expect: ERROR 23503, activities_deal_id_deals_id_fk ---'
BEGIN;
INSERT INTO deals (id, title, stage_id, owner_id, deleted_at)
VALUES ('tck-2a-deal', 'trash-checks probe 2a',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1),
        now() - interval '40 days');
INSERT INTO activities (id, title, type_id, owner_id, due_date, deal_id)
VALUES ('tck-2a-act', 'trash-checks probe 2a',
        (SELECT id FROM activity_types ORDER BY id LIMIT 1),
        (SELECT id FROM users          ORDER BY id LIMIT 1),
        now(), 'tck-2a-deal');
DELETE FROM deals WHERE id = 'tck-2a-deal';
ROLLBACK;

\echo ''
\echo '--- 2b. deal with a DEAL_ASSIGNEES row. Expect: ERROR 23503, deal_assignees_deal_id_deals_id_fk ---'
BEGIN;
INSERT INTO deals (id, title, stage_id, owner_id, deleted_at)
VALUES ('tck-2b-deal', 'trash-checks probe 2b',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1),
        now() - interval '40 days');
INSERT INTO deal_assignees (deal_id, user_id)
VALUES ('tck-2b-deal', (SELECT id FROM users ORDER BY id LIMIT 1));
DELETE FROM deals WHERE id = 'tck-2b-deal';
ROLLBACK;

\echo ''
\echo '--- 2c. deal with a DEAL_STAGE_HISTORY row. Expect: ERROR 23503, deal_stage_history_deal_id_deals_id_fk ---'
BEGIN;
INSERT INTO deals (id, title, stage_id, owner_id, deleted_at)
VALUES ('tck-2c-deal', 'trash-checks probe 2c',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1),
        now() - interval '40 days');
INSERT INTO deal_stage_history (id, deal_id, to_stage_id)
VALUES ('tck-2c-dsh', 'tck-2c-deal', (SELECT id FROM stages ORDER BY id LIMIT 1));
DELETE FROM deals WHERE id = 'tck-2c-deal';
ROLLBACK;

\echo ''
\echo '--- 2d. organization with a DEAL. Expect: ERROR 23503, deals_organization_id_organizations_id_fk ---'
BEGIN;
INSERT INTO organizations (id, name, owner_id, deleted_at)
VALUES ('tck-2d-org', 'trash-checks probe 2d',
        (SELECT id FROM users ORDER BY id LIMIT 1), now() - interval '40 days');
INSERT INTO deals (id, title, stage_id, owner_id, organization_id)
VALUES ('tck-2d-deal', 'trash-checks probe 2d',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1), 'tck-2d-org');
DELETE FROM organizations WHERE id = 'tck-2d-org';
ROLLBACK;

\echo ''
\echo '--- 2e. organization with a PERSON. Expect: ERROR 23503, people_organization_id_organizations_id_fk ---'
BEGIN;
INSERT INTO organizations (id, name, owner_id, deleted_at)
VALUES ('tck-2e-org', 'trash-checks probe 2e',
        (SELECT id FROM users ORDER BY id LIMIT 1), now() - interval '40 days');
INSERT INTO people (id, first_name, last_name, owner_id, organization_id)
VALUES ('tck-2e-person', 'Trash', 'Checks',
        (SELECT id FROM users ORDER BY id LIMIT 1), 'tck-2e-org');
DELETE FROM organizations WHERE id = 'tck-2e-org';
ROLLBACK;

\echo ''
\echo '--- 2f. person with a DEAL. Expect: ERROR 23503, deals_person_id_people_id_fk ---'
BEGIN;
INSERT INTO people (id, first_name, last_name, owner_id, deleted_at)
VALUES ('tck-2f-person', 'Trash', 'Checks',
        (SELECT id FROM users ORDER BY id LIMIT 1), now() - interval '40 days');
INSERT INTO deals (id, title, stage_id, owner_id, person_id)
VALUES ('tck-2f-deal', 'trash-checks probe 2f',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1), 'tck-2f-person');
DELETE FROM people WHERE id = 'tck-2f-person';
ROLLBACK;

\echo ''
\echo '--- 2g. activity, a TRUE LEAF. Expect: DELETE 1, no error. ---'
\echo '    Included so the asymmetry is documented rather than assumed. Nothing in'
\echo '    the catalog points at activities, which is why purgeActivityMutation is'
\echo '    two statements and purgeDealMutation is six.'
BEGIN;
INSERT INTO activities (id, title, type_id, owner_id, due_date, deleted_at)
VALUES ('tck-2g-act', 'trash-checks probe 2g',
        (SELECT id FROM activity_types ORDER BY id LIMIT 1),
        (SELECT id FROM users          ORDER BY id LIMIT 1),
        now(), now() - interval '40 days');
DELETE FROM activities WHERE id = 'tck-2g-act';
SELECT
  (SELECT count(*) FROM activities WHERE id = 'tck-2g-act') AS remaining,
  CASE WHEN (SELECT count(*) FROM activities WHERE id = 'tck-2g-act') = 0
       THEN 'PASS — a leaf deletes with no teardown'
       ELSE 'FAIL' END AS verdict;
ROLLBACK;


\echo ''
\echo '###############################################################################'
\echo '# PART 3 — the full teardown succeeds, per entity type'
\echo '###############################################################################'
\echo ''
\echo '  Each block replays the ordering of the matching purge*Mutation in SQL,'
\echo '  against a fixture record built and destroyed inside the same transaction,'
\echo '  then asserts what the mocked unit tests cannot: that nothing dangles.'
\echo ''

\echo '--- 3a. DEAL — the widest teardown. Mirrors purgeDealMutation (deals.ts). ---'
BEGIN;

-- Fixture: a trashed deal, one LIVE activity (an independent entity that must be
-- detached, never destroyed), one join row, one history row, one note, and two
-- pre-existing audit rows that Part 4 will look for afterwards. Plus a separate
-- LIVE deal, to prove the isNotNull guard riding on the DELETE predicate.
INSERT INTO deals (id, title, stage_id, owner_id, deleted_at)
VALUES ('tck-3a-deal', 'trash-checks teardown 3a',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1),
        now() - interval '40 days');
INSERT INTO deals (id, title, stage_id, owner_id)
VALUES ('tck-3a-deal-live', 'trash-checks LIVE deal 3a',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1));
INSERT INTO activities (id, title, type_id, owner_id, due_date, deal_id)
VALUES ('tck-3a-act', 'trash-checks live child 3a',
        (SELECT id FROM activity_types ORDER BY id LIMIT 1),
        (SELECT id FROM users          ORDER BY id LIMIT 1),
        now(), 'tck-3a-deal');
INSERT INTO deal_assignees (deal_id, user_id)
VALUES ('tck-3a-deal', (SELECT id FROM users ORDER BY id LIMIT 1));
INSERT INTO deal_stage_history (id, deal_id, to_stage_id)
VALUES ('tck-3a-dsh', 'tck-3a-deal', (SELECT id FROM stages ORDER BY id LIMIT 1));
INSERT INTO notes (id, entity_type, entity_id, content)
VALUES ('tck-3a-note', 'deal', 'tck-3a-deal', 'trash-checks fixture note');
INSERT INTO audit_log (id, entity_type, entity_id, action, actor_kind)
VALUES ('tck-3a-audit-1', 'deal', 'tck-3a-deal', 'created', 'system'),
       ('tck-3a-audit-2', 'deal', 'tck-3a-deal', 'updated', 'system');

-- Step 1. Notes. Polymorphic, no foreign key, so nothing in the database enforces
--         this and the rows would dangle forever.
DELETE FROM notes WHERE entity_type = 'deal' AND entity_id = 'tck-3a-deal';

-- Step 2. Pure join / history rows: no independent identity, so they are deleted.
DELETE FROM deal_assignees     WHERE deal_id = 'tck-3a-deal';
DELETE FROM deal_stage_history WHERE deal_id = 'tck-3a-deal';

-- Step 3. Independent entities that merely reference this deal: DETACHED, never
--         deleted. This is the one place a purge mutates a live record the admin
--         did not select, which is why step 4 records it.
UPDATE activities SET deal_id = NULL, updated_at = now() WHERE deal_id = 'tck-3a-deal';

-- Step 4. One audit row per detached child, so an unlinked activity traces back.
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3a-audit-detach', 'activity', 'tck-3a-act', 'updated',
        '{"dealId": {"from": "tck-3a-deal", "to": null}}'::jsonb, 'system');

-- Step 5. The guard rides on the DELETE predicate, so a guessed id for a LIVE
--         deal is a no-op even if every upstream check were bypassed (T-37-15).
DELETE FROM deals WHERE id = 'tck-3a-deal-live' AND deleted_at IS NOT NULL;

-- Step 6. Now, and only now, the row itself.
DELETE FROM deals WHERE id = 'tck-3a-deal' AND deleted_at IS NOT NULL;

-- Step 7. The purge's own audit row, inside the same transaction.
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3a-audit-purge', 'deal', 'tck-3a-deal', 'deleted',
        '{"__purge": {"from": null, "to": true}}'::jsonb, 'system');

\echo ''
\echo '    Assertions for 3a. Every column must read as its PASS value.'
SELECT
  (SELECT count(*) FROM deals              WHERE id = 'tck-3a-deal')                                AS deal_row,
  (SELECT count(*) FROM notes              WHERE entity_type = 'deal' AND entity_id = 'tck-3a-deal') AS dangling_notes,
  (SELECT count(*) FROM deal_assignees     WHERE deal_id = 'tck-3a-deal')                            AS orphan_assignees,
  (SELECT count(*) FROM deal_stage_history WHERE deal_id = 'tck-3a-deal')                            AS orphan_history,
  (SELECT count(*) FROM activities         WHERE id = 'tck-3a-act')                                  AS detached_child_still_exists,
  (SELECT count(*) FROM activities         WHERE id = 'tck-3a-act' AND deal_id IS NOT NULL)          AS detached_child_fk_not_null,
  (SELECT count(*) FROM deals              WHERE id = 'tck-3a-deal-live')                            AS live_deal_survived_guard,
  CASE WHEN
       (SELECT count(*) FROM deals              WHERE id = 'tck-3a-deal') = 0
   AND (SELECT count(*) FROM notes              WHERE entity_type = 'deal' AND entity_id = 'tck-3a-deal') = 0
   AND (SELECT count(*) FROM deal_assignees     WHERE deal_id = 'tck-3a-deal') = 0
   AND (SELECT count(*) FROM deal_stage_history WHERE deal_id = 'tck-3a-deal') = 0
   AND (SELECT count(*) FROM activities         WHERE id = 'tck-3a-act') = 1
   AND (SELECT count(*) FROM activities         WHERE id = 'tck-3a-act' AND deal_id IS NOT NULL) = 0
   AND (SELECT count(*) FROM deals              WHERE id = 'tck-3a-deal-live') = 1
  THEN 'PASS' ELSE 'FAIL' END AS verdict;

\echo ''
\echo '###############################################################################'
\echo '# PART 4 — the audit log survived the purge  (asserted inside 3a)'
\echo '###############################################################################'
\echo '    The deal row is gone. Its two PRE-EXISTING audit rows, the detach row and'
\echo '    the purge row must all still be readable. audit_log.entity_id carries no'
\echo '    foreign key by design, and this is the assertion that keeps it that way.'
SELECT
  (SELECT count(*) FROM audit_log WHERE entity_type = 'deal' AND entity_id = 'tck-3a-deal'
                                    AND id IN ('tck-3a-audit-1', 'tck-3a-audit-2'))  AS pre_existing_rows_kept,
  (SELECT count(*) FROM audit_log WHERE id = 'tck-3a-audit-detach')                  AS detach_recorded,
  (SELECT count(*) FROM audit_log WHERE id = 'tck-3a-audit-purge')                   AS purge_recorded,
  (SELECT count(*) FROM deals     WHERE id = 'tck-3a-deal')                          AS parent_row,
  CASE WHEN
       (SELECT count(*) FROM audit_log WHERE entity_type = 'deal' AND entity_id = 'tck-3a-deal'
                                         AND id IN ('tck-3a-audit-1', 'tck-3a-audit-2')) = 2
   AND (SELECT count(*) FROM audit_log WHERE id = 'tck-3a-audit-detach') = 1
   AND (SELECT count(*) FROM audit_log WHERE id = 'tck-3a-audit-purge') = 1
   AND (SELECT count(*) FROM deals     WHERE id = 'tck-3a-deal') = 0
  THEN 'PASS' ELSE 'FAIL' END AS verdict;

ROLLBACK;

\echo ''
\echo '--- 3b. ORGANIZATION — two child tables, both detached. Mirrors purgeOrganizationMutation. ---'
BEGIN;
INSERT INTO organizations (id, name, owner_id, deleted_at)
VALUES ('tck-3b-org', 'trash-checks teardown 3b',
        (SELECT id FROM users ORDER BY id LIMIT 1), now() - interval '40 days');
INSERT INTO deals (id, title, stage_id, owner_id, organization_id)
VALUES ('tck-3b-deal', 'trash-checks live child 3b',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1), 'tck-3b-org');
INSERT INTO people (id, first_name, last_name, owner_id, organization_id)
VALUES ('tck-3b-person', 'Trash', 'Checks',
        (SELECT id FROM users ORDER BY id LIMIT 1), 'tck-3b-org');
INSERT INTO notes (id, entity_type, entity_id, content)
VALUES ('tck-3b-note', 'organization', 'tck-3b-org', 'trash-checks fixture note');

DELETE FROM notes  WHERE entity_type = 'organization' AND entity_id = 'tck-3b-org';
UPDATE deals  SET organization_id = NULL, updated_at = now() WHERE organization_id = 'tck-3b-org';
UPDATE people SET organization_id = NULL, updated_at = now() WHERE organization_id = 'tck-3b-org';
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3b-audit-d', 'deal',   'tck-3b-deal',   'updated',
        '{"organizationId": {"from": "tck-3b-org", "to": null}}'::jsonb, 'system'),
       ('tck-3b-audit-p', 'person', 'tck-3b-person', 'updated',
        '{"organizationId": {"from": "tck-3b-org", "to": null}}'::jsonb, 'system');
DELETE FROM organizations WHERE id = 'tck-3b-org' AND deleted_at IS NOT NULL;
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3b-audit-purge', 'organization', 'tck-3b-org', 'deleted',
        '{"__purge": {"from": null, "to": true}}'::jsonb, 'system');

\echo ''
\echo '    Assertions for 3b.'
SELECT
  (SELECT count(*) FROM organizations WHERE id = 'tck-3b-org')                                                AS org_row,
  (SELECT count(*) FROM notes         WHERE entity_type = 'organization' AND entity_id = 'tck-3b-org')        AS dangling_notes,
  (SELECT count(*) FROM deals         WHERE id = 'tck-3b-deal')                                               AS deal_still_exists,
  (SELECT count(*) FROM deals         WHERE id = 'tck-3b-deal'   AND organization_id IS NOT NULL)             AS deal_fk_not_null,
  (SELECT count(*) FROM people        WHERE id = 'tck-3b-person')                                             AS person_still_exists,
  (SELECT count(*) FROM people        WHERE id = 'tck-3b-person' AND organization_id IS NOT NULL)             AS person_fk_not_null,
  CASE WHEN
       (SELECT count(*) FROM organizations WHERE id = 'tck-3b-org') = 0
   AND (SELECT count(*) FROM notes         WHERE entity_type = 'organization' AND entity_id = 'tck-3b-org') = 0
   AND (SELECT count(*) FROM deals         WHERE id = 'tck-3b-deal') = 1
   AND (SELECT count(*) FROM deals         WHERE id = 'tck-3b-deal'   AND organization_id IS NOT NULL) = 0
   AND (SELECT count(*) FROM people        WHERE id = 'tck-3b-person') = 1
   AND (SELECT count(*) FROM people        WHERE id = 'tck-3b-person' AND organization_id IS NOT NULL) = 0
  THEN 'PASS' ELSE 'FAIL' END AS verdict;
ROLLBACK;

\echo ''
\echo '--- 3c. PERSON — one detached child. Mirrors purgePersonMutation. ---'
BEGIN;
INSERT INTO people (id, first_name, last_name, owner_id, deleted_at)
VALUES ('tck-3c-person', 'Trash', 'Checks',
        (SELECT id FROM users ORDER BY id LIMIT 1), now() - interval '40 days');
INSERT INTO deals (id, title, stage_id, owner_id, person_id)
VALUES ('tck-3c-deal', 'trash-checks live child 3c',
        (SELECT id FROM stages ORDER BY id LIMIT 1),
        (SELECT id FROM users  ORDER BY id LIMIT 1), 'tck-3c-person');
INSERT INTO notes (id, entity_type, entity_id, content)
VALUES ('tck-3c-note', 'person', 'tck-3c-person', 'trash-checks fixture note');

DELETE FROM notes WHERE entity_type = 'person' AND entity_id = 'tck-3c-person';
UPDATE deals SET person_id = NULL, updated_at = now() WHERE person_id = 'tck-3c-person';
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3c-audit-d', 'deal', 'tck-3c-deal', 'updated',
        '{"personId": {"from": "tck-3c-person", "to": null}}'::jsonb, 'system');
DELETE FROM people WHERE id = 'tck-3c-person' AND deleted_at IS NOT NULL;
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3c-audit-purge', 'person', 'tck-3c-person', 'deleted',
        '{"__purge": {"from": null, "to": true}}'::jsonb, 'system');

\echo ''
\echo '    Assertions for 3c.'
SELECT
  (SELECT count(*) FROM people WHERE id = 'tck-3c-person')                                        AS person_row,
  (SELECT count(*) FROM notes  WHERE entity_type = 'person' AND entity_id = 'tck-3c-person')      AS dangling_notes,
  (SELECT count(*) FROM deals  WHERE id = 'tck-3c-deal')                                          AS deal_still_exists,
  (SELECT count(*) FROM deals  WHERE id = 'tck-3c-deal' AND person_id IS NOT NULL)                AS deal_fk_not_null,
  CASE WHEN
       (SELECT count(*) FROM people WHERE id = 'tck-3c-person') = 0
   AND (SELECT count(*) FROM notes  WHERE entity_type = 'person' AND entity_id = 'tck-3c-person') = 0
   AND (SELECT count(*) FROM deals  WHERE id = 'tck-3c-deal') = 1
   AND (SELECT count(*) FROM deals  WHERE id = 'tck-3c-deal' AND person_id IS NOT NULL) = 0
  THEN 'PASS' ELSE 'FAIL' END AS verdict;
ROLLBACK;

\echo ''
\echo '--- 3d. ACTIVITY — the leaf. Mirrors purgeActivityMutation: notes, then the row. ---'
BEGIN;
INSERT INTO activities (id, title, type_id, owner_id, due_date, deleted_at)
VALUES ('tck-3d-act', 'trash-checks teardown 3d',
        (SELECT id FROM activity_types ORDER BY id LIMIT 1),
        (SELECT id FROM users          ORDER BY id LIMIT 1),
        now(), now() - interval '40 days');
INSERT INTO notes (id, entity_type, entity_id, content)
VALUES ('tck-3d-note', 'activity', 'tck-3d-act', 'trash-checks fixture note');

DELETE FROM notes      WHERE entity_type = 'activity' AND entity_id = 'tck-3d-act';
DELETE FROM activities WHERE id = 'tck-3d-act' AND deleted_at IS NOT NULL;
INSERT INTO audit_log (id, entity_type, entity_id, action, changes, actor_kind)
VALUES ('tck-3d-audit-purge', 'activity', 'tck-3d-act', 'deleted',
        '{"__purge": {"from": null, "to": true}}'::jsonb, 'system');

\echo ''
\echo '    Assertions for 3d.'
SELECT
  (SELECT count(*) FROM activities WHERE id = 'tck-3d-act')                                       AS activity_row,
  (SELECT count(*) FROM notes      WHERE entity_type = 'activity' AND entity_id = 'tck-3d-act')   AS dangling_notes,
  (SELECT count(*) FROM audit_log  WHERE id = 'tck-3d-audit-purge')                               AS purge_recorded,
  CASE WHEN
       (SELECT count(*) FROM activities WHERE id = 'tck-3d-act') = 0
   AND (SELECT count(*) FROM notes      WHERE entity_type = 'activity' AND entity_id = 'tck-3d-act') = 0
   AND (SELECT count(*) FROM audit_log  WHERE id = 'tck-3d-audit-purge') = 1
  THEN 'PASS' ELSE 'FAIL' END AS verdict;
ROLLBACK;


\echo ''
\echo '###############################################################################'
\echo '# PART 5 — the seeded retention default, as DATA'
\echo '###############################################################################'
\echo '    Expect exactly ONE row, value 30, jsonb_typeof number. There is no'
\echo '    code-level fallback anywhere in src/lib/trash/settings.ts: if this row'
\echo '    disappears the pruner reads null, fails closed and purges nothing —'
\echo '    silently, forever. This part is the standing detector for that.'

SELECT key, value, jsonb_typeof(value) AS value_type, updated_at
FROM app_settings
WHERE key = 'trash.retention_days';

\echo ''
\echo '    Asserted.'
SELECT
  count(*) AS rows_found,
  CASE WHEN count(*) = 1
        AND max(jsonb_typeof(value)) = 'number'
        AND max((value)::text)::int BETWEEN 1 AND 365
       THEN 'PASS'
       ELSE 'FAIL — the retention window is missing or out of the 1-365 bounds; purging is disabled'
  END AS verdict
FROM app_settings
WHERE key = 'trash.retention_days';


\echo ''
\echo '###############################################################################'
\echo '# PART 6 — the pruner selects expired ids through deals_deleted_at_idx'
\echo '###############################################################################'
\echo '    The statement below is the shape src/lib/trash/prune.ts issues per entity'
\echo '    type, with the window arithmetic done SERVER-SIDE (never a bound JS Date).'
\echo '    Wrapped and rolled back for symmetry with the rest of this file; a SELECT'
\echo '    changes nothing on its own.'
\echo ''
\echo '    EXPECTED PLAN NODE: an Index Scan (or Index Scan Backward) on'
\echo '    deals_deleted_at_idx, NOT a Seq Scan. 37-RESEARCH measured Index Scan'
\echo '    Backward at 2.785 ms over 25,207 rows. All four *_deleted_at_idx btrees'
\echo '    come from migration 0012; this phase adds no index. READ THE NODE, do not'
\echo '    assume it: with trash empty the planner may legitimately choose otherwise,'
\echo '    and what this part proves unconditionally is that the index EXISTS and the'
\echo '    statement is valid.'

BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM deals
WHERE deleted_at < now() - make_interval(days => 30)
LIMIT 200;
ROLLBACK;

\echo ''
\echo '    The four retention indexes, asserted. Expect exactly 4.'
SELECT
  count(*) AS deleted_at_index_count,
  CASE WHEN count(*) = 4 THEN 'PASS'
       ELSE 'FAIL — a retention index was dropped; the pruner will sequentially scan' END AS verdict
FROM pg_indexes
WHERE indexname IN (
  'deals_deleted_at_idx', 'people_deleted_at_idx',
  'organizations_deleted_at_idx', 'activities_deleted_at_idx'
);


\echo ''
\echo '###############################################################################'
\echo '# PART 7 — the AFTER snapshot: this script mutated nothing'
\echo '###############################################################################'
\echo '    Every delta must be 0. audit_log is reported but not failed on: the app'
\echo '    container is normally running while this script executes, and any request'
\echo '    it serves writes audit rows that have nothing to do with this file.'

SELECT
  b.tbl,
  b.n  AS rows_before,
  a.n  AS rows_after,
  a.n - b.n AS delta,
  CASE
    WHEN a.n = b.n         THEN 'PASS'
    WHEN b.tbl = 'audit_log' THEN 'INFO — the running app writes audit rows independently of this script'
    ELSE 'FAIL — A ROLLBACK DID NOT HOLD; THIS SCRIPT CHANGED REAL DATA'
  END AS verdict
FROM trash_checks_before b
JOIN (
            SELECT 'activities'     AS tbl, count(*) AS n FROM activities
  UNION ALL SELECT 'audit_log',          count(*) FROM audit_log
  UNION ALL SELECT 'deal_assignees',     count(*) FROM deal_assignees
  UNION ALL SELECT 'deal_stage_history', count(*) FROM deal_stage_history
  UNION ALL SELECT 'deals',              count(*) FROM deals
  UNION ALL SELECT 'notes',              count(*) FROM notes
  UNION ALL SELECT 'organizations',      count(*) FROM organizations
  UNION ALL SELECT 'people',             count(*) FROM people
) a ON a.tbl = b.tbl
ORDER BY b.tbl;

\echo ''
\echo '    No fixture row survived. Every count must be 0.'
SELECT
  (SELECT count(*) FROM deals              WHERE id      LIKE 'tck-%') AS deals,
  (SELECT count(*) FROM people             WHERE id      LIKE 'tck-%') AS people,
  (SELECT count(*) FROM organizations      WHERE id      LIKE 'tck-%') AS organizations,
  (SELECT count(*) FROM activities         WHERE id      LIKE 'tck-%') AS activities,
  (SELECT count(*) FROM notes              WHERE id      LIKE 'tck-%') AS notes,
  (SELECT count(*) FROM deal_assignees     WHERE deal_id LIKE 'tck-%') AS deal_assignees,
  (SELECT count(*) FROM deal_stage_history WHERE id      LIKE 'tck-%') AS deal_stage_history,
  (SELECT count(*) FROM audit_log          WHERE id      LIKE 'tck-%') AS audit_log,
  CASE WHEN
       (SELECT count(*) FROM deals              WHERE id      LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM people             WHERE id      LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM organizations      WHERE id      LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM activities         WHERE id      LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM notes              WHERE id      LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM deal_assignees     WHERE deal_id LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM deal_stage_history WHERE id      LIKE 'tck-%') = 0
   AND (SELECT count(*) FROM audit_log          WHERE id      LIKE 'tck-%') = 0
  THEN 'PASS' ELSE 'FAIL — A ROLLBACK DID NOT HOLD; CLEAN UP THE tck- ROWS BY HAND' END AS verdict;

DROP TABLE IF EXISTS pg_temp.trash_checks_before;

\echo ''
\echo '=== end of trash-checks.sql ==='
\echo ''
