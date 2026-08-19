#!/usr/bin/env bash
#
# Provision the DEDICATED, ISOLATED database that `npm run test:db` runs against.
#
# WHY THIS EXISTS
#   src/lib/mutations/dedup.db.test.ts is the first database-backed test in this
#   repository. It must exercise real constraints — `notes_migration_uniq` above
#   all — which means it needs a real PostgreSQL with the real schema. What it
#   must NOT have is any access to the development database's DATA: that database
#   holds 46,054 organizations and 38,348 people of the operator's real records,
#   the application container is normally running against it, and the test's
#   fixture teardown is a hard DELETE.
#
#   So the test gets its own database, `pipelite_dedup_test`, built from a
#   SCHEMA-ONLY dump of the development database. The dump is read-only on the
#   source. Every table in the target starts empty, and the suite creates every
#   row it uses, including the user, pipeline, stage and activity type its
#   NOT NULL foreign keys need. Nothing the suite does can reach the real data:
#   it is a different database, and the connection string it is handed names it.
#
# WHY A SCHEMA DUMP RATHER THAN `drizzle-kit migrate`
#   Measured, not assumed: the migration chain does NOT replay onto an empty
#   database. One of the early migrations runs
#   `ALTER TABLE "import_sessions" ADD COLUMN "user_id"` against a table no
#   earlier migration creates (it was introduced with `db:push`), so a fresh
#   `drizzle-kit migrate` aborts with 42P01 `relation "import_sessions" does not
#   exist`. A `pg_dump --schema-only` of the live database is therefore both more
#   robust AND more faithful: it reproduces the extensions, the three dedup
#   normalization functions, the four GENERATED ALWAYS columns and every partial
#   index exactly as the running deployment has them.
#
# IT IS IDEMPOTENT AND IT ALWAYS REFRESHES
#   The public schema of the TEST database is dropped and rebuilt on every run,
#   so a migration landing in the development database can never leave the test
#   database silently stale. That is the only DROP in this file and it is fenced
#   three ways: the target name is a constant, it is checked against a literal
#   pattern here, and the DROP itself is guarded by a `current_database()`
#   assertion inside the same psql invocation — so it cannot execute against any
#   database but the intended one even if this script were edited carelessly.
#
# HOW IT REACHES THE SERVER
#   `docker exec` into the already-running Postgres container, discovered by name
#   rather than through `docker compose`: this script is also run from git
#   worktrees, where `docker compose` would infer a DIFFERENT project name from
#   the directory and could start a second stack. psql and pg_dump then talk to
#   the server over the container's local socket, so NO CREDENTIAL is passed on a
#   command line, read from the environment, or written into this file.
set -euo pipefail

SOURCE_DB="pipelite"
TEST_DB="pipelite_dedup_test"

# Fence 1: the target is a literal, and it must look like one.
if [[ "$TEST_DB" != "pipelite_dedup_test" ]]; then
  echo "FATAL: this script only ever provisions pipelite_dedup_test (got '$TEST_DB')." >&2
  exit 1
fi
if [[ "$TEST_DB" == "$SOURCE_DB" ]]; then
  echo "FATAL: the test database may never be the development database." >&2
  exit 1
fi

CONTAINER="$(docker ps --filter 'name=pipelite-postgres' --format '{{.Names}}' | head -1)"
if [[ -z "$CONTAINER" ]]; then
  echo "FATAL: no running pipelite-postgres container found. Start the stack first:" >&2
  echo "  docker compose up -d      # from the repository root" >&2
  exit 1
fi

echo "-> container: $CONTAINER"
echo "-> source (READ ONLY): $SOURCE_DB"
echo "-> target (rebuilt):   $TEST_DB"

# Create the database if it is not there yet. `CREATE DATABASE` cannot run inside
# a transaction, hence its own invocation, and an already-present database is the
# expected steady state rather than a failure.
if ! docker exec -i "$CONTAINER" psql -U pipelite -d postgres -tAc \
      "select 1 from pg_database where datname = '$TEST_DB'" | grep -q 1; then
  docker exec -i "$CONTAINER" psql -U pipelite -d postgres -q \
    -c "CREATE DATABASE $TEST_DB OWNER pipelite"
  echo "-> created database $TEST_DB"
else
  echo "-> database $TEST_DB already exists"
fi

# Fences 2 and 3: refuse from inside the session, then drop. ON_ERROR_STOP means
# the RAISE aborts the invocation before any DROP is reached.
#
# EVERY non-system schema goes, not just `public`. The dump carries drizzle's own
# `drizzle` schema (its migration bookkeeping) alongside `public`, so resetting
# only `public` leaves it behind and the reload fails with
# `schema "drizzle" already exists` — measured, on the second run. Enumerating
# from the catalog also means a schema added by a future migration needs no edit
# here.
docker exec -i "$CONTAINER" psql -U pipelite -d "$TEST_DB" -q -v ON_ERROR_STOP=1 -f - <<'SQL'
SET client_min_messages = warning;
DO $$
DECLARE
  target text;
BEGIN
  IF current_database() <> 'pipelite_dedup_test' THEN
    RAISE EXCEPTION
      'refusing to reset %: this script resets pipelite_dedup_test and nothing else',
      current_database();
  END IF;

  FOR target IN
    SELECT nspname FROM pg_namespace
     WHERE nspname NOT IN ('pg_catalog', 'information_schema')
       AND nspname NOT LIKE 'pg_toast%'
       AND nspname NOT LIKE 'pg_temp%'
  LOOP
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', target);
  END LOOP;
END
$$;
CREATE SCHEMA public;
SQL
echo "-> schemas reset"

# The dump is piped INSIDE the container, so the schema never touches the host
# filesystem. --no-owner / --no-privileges keep it replayable as the same role.
docker exec -i "$CONTAINER" bash -c \
  "pg_dump -U pipelite -d $SOURCE_DB --schema-only --no-owner --no-privileges \
     | psql -U pipelite -d $TEST_DB -q -v ON_ERROR_STOP=1"

# Report what landed, and fail loudly if the facts the suite depends on most did
# not come across. A silently partial schema would otherwise surface as a
# confusing assertion failure deep inside the test file instead of here.
TABLES="$(docker exec -i "$CONTAINER" psql -U pipelite -d "$TEST_DB" -tAc \
  "select count(*) from information_schema.tables where table_schema = 'public'")"
GENERATED="$(docker exec -i "$CONTAINER" psql -U pipelite -d "$TEST_DB" -tAc \
  "select count(*) from information_schema.columns where is_generated = 'ALWAYS'")"
UNIQ="$(docker exec -i "$CONTAINER" psql -U pipelite -d "$TEST_DB" -tAc \
  "select count(*) from pg_indexes where indexname = 'notes_migration_uniq'")"
ROWS="$(docker exec -i "$CONTAINER" psql -U pipelite -d "$TEST_DB" -tAc \
  "select count(*) from organizations")"

echo "-> tables: $TABLES / generated: $GENERATED / notes_migration_uniq: $UNIQ / organizations: $ROWS"

if [[ "$TABLES" -lt 30 ]]; then
  echo "FATAL: only $TABLES tables came across; the dump did not complete." >&2
  exit 1
fi
if [[ "$GENERATED" -lt 4 ]]; then
  echo "FATAL: expected the 4 GENERATED ALWAYS columns from migration 0017, got $GENERATED." >&2
  exit 1
fi
if [[ "$UNIQ" != "1" ]]; then
  echo "FATAL: notes_migration_uniq is absent; the B4 test would prove nothing." >&2
  exit 1
fi
if [[ "$ROWS" != "0" ]]; then
  echo "FATAL: $TEST_DB is not empty. A schema-only dump must yield 0 rows." >&2
  exit 1
fi

echo "OK: $TEST_DB is ready and empty."
