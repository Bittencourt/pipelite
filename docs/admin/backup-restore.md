# Backup and Restore

This is the authoritative backup and restore procedure for a self-hosted Pipelite deployment. It
covers Docker and bare metal, the PostgreSQL database and the uploaded files.

Every command on this page was executed against a real deployment. The flags are not decoration —
where one looks redundant, the callout beside it says what it costs to omit, measured.

> **Note**: [Import & Export](./import-export.md) is a different thing. CSV/JSON export moves data
> between systems: no schema, no migration ledger, no uploaded files. It is not a backup and cannot
> restore a deployment. Use this page for that.

---

## 1. What this covers, and what it does not

**Two things must be backed up.** Backing up only the first is the most common way to discover, at
restore time, that the backup was incomplete.

| # | What | Why it is separate |
|---|---|---|
| 1 | The **PostgreSQL database** | Every record, plus the custom-field definitions and the migration ledger. |
| 2 | The **uploaded files** | Custom-field file values are JSONB rows that store a filename and point at a file on disk. Restoring the database alone gives you rows referencing files that no longer exist — every download 404s, and nothing in the app reports a problem. |

**If `FILE_STORAGE=s3`, skip every file step on this page.** Files live in your bucket, not on the
app host, and the correct protection is bucket versioning plus a lifecycle policy. Vercel
deployments must use S3 — see the [Vercel guide](./deployment/vercel.md) — so on Vercel the database
is the only thing this page applies to.

**Also store your `.env`, separately and securely.** `AUTH_SECRET` in particular: change it and
every existing session cookie becomes invalid, so a restore that recovers the database but not the
original secret logs every user out. `.env` is gitignored and must stay that way — put it in a
password manager or a secrets store, not next to the dump.

**What this page does not cover:** off-site replication, point-in-time recovery via WAL archiving, or
managed-provider snapshots. If your provider offers automated snapshots, use them *in addition to*
this procedure — a logical dump is the only form you can restore onto a different provider.

---

## 2. Docker — backup

Run both commands from the directory containing `docker-compose.yml`. Neither one stops the app, and
neither needs a password: `docker compose exec` runs inside the container, which already has
`POSTGRES_PASSWORD` in its environment.

```bash
# 1. The database. -Fc is PostgreSQL's compressed custom format and streams cleanly
#    through `exec -T`: measured 34,299,898 bytes in 9.0s for a database that is
#    121,722,344 bytes as plain SQL.
docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite > "pipelite-db-$(date +%F).dump"

# 2. The uploaded files. The named volume Docker creates is `pipelite_uploads_data` —
#    the compose project name (`pipelite`, from the directory) prefixes the volume name
#    declared in docker-compose.yml. Confirm yours with `docker volume ls`.
docker run --rm -v pipelite_uploads_data:/data:ro -v "$PWD:/backup" alpine:3 \
  tar czf "/backup/pipelite-uploads-$(date +%F).tar.gz" -C /data .
```

> **Note**: the service is `postgres`. `docker-compose.yml` defines `app`, `postgres` and `mailhog`.
> Older revisions of the Docker guide named a fourth service that has never existed in this repo;
> both of its commands failed. The credentials in the command above are correct as written —
> `POSTGRES_USER` and `POSTGRES_DB` are both `pipelite`.

> **Note**: use `docker run --rm -v … alpine:3` for the files, not `docker compose exec app tar`.
> The app container runs as uid 1001 and cannot read the whole volume tree reliably; the `docker run`
> form runs as root, which is why uid/gid 1001 ownership survives a `tar czf` / `tar xzf` round trip
> into a fresh volume. Verified.

### Where not to leave the dump

The `.dump` file is an **unencrypted copy of every record in the CRM** — contacts, deal values,
notes, API keys. Treat it like the database itself:

- Store it **off the app host**. A backup that dies with the machine is not a backup.
- `chmod 600` it, and encrypt it at rest (`gpg --symmetric`, or your backup tool's own encryption).
- **Never commit it.** `*.dump` and `pipelite-uploads-*.tar.gz` are gitignored precisely because the
  commands above drop them into your working directory by design.

---

## 3. Docker — restore into a fresh database

This is the recommended path. It cannot destroy data that is still there, because there is nothing
to overwrite.

```bash
# 1. Stop the app so nothing writes during the restore.
docker compose stop app

# 2. Create an empty target database.
docker compose exec -T postgres createdb -U pipelite pipelite

# 3. Restore. Both flags are MANDATORY — see the callout below.
docker compose exec -T postgres pg_restore -U pipelite -d pipelite \
  --no-owner --no-privileges < pipelite-db-2026-08-23.dump

# 4. Restore the uploaded files into the volume.
docker run --rm -v pipelite_uploads_data:/data -v "$PWD:/backup:ro" alpine:3 \
  tar xzf /backup/pipelite-uploads-2026-08-23.tar.gz -C /data

# 5. Start the app and check the entrypoint's migration step found nothing to do.
docker compose up -d app
docker compose logs --tail=20 app
```

> **`--no-owner --no-privileges` are MANDATORY.** Measured: restoring into a cluster whose superuser
> is not `pipelite` **without** them produces 45 `ALTER … OWNER TO pipelite` errors and **exit 1 —
> while restoring all of the data correctly.** That is the worst outcome available, because it
> neither cleanly fails nor cleanly succeeds: an operator who sees exit 1 may reasonably conclude the
> restore did not work and wipe a database that was in fact complete. With both flags: **exit 0, zero
> errors, identical row counts.** When the role names do happen to match, the flags are harmless.
> There is no case in which omitting them is better.

If step 2 reports that the database already exists, you are not doing a fresh restore — go to
section 4 instead, or pick a different target name.

---

## 4. Docker — restoring over an existing database

Second choice. Use it when you must reuse the existing database name and cannot drop it.

```bash
docker compose stop app
docker compose exec -T postgres pg_restore -U pipelite -d pipelite \
  --clean --if-exists --no-owner --no-privileges < pipelite-db-2026-08-23.dump
docker compose up -d app
```

**Why it exists:** `--clean --if-exists` makes the restore idempotent. Verified — a second run of the
same restore is exit 0 with unchanged row counts, where the same re-restore *without* `--clean` is
exit 1 with 193 errors from objects that already exist.

**Why it is second choice:** `--clean` issues `DROP` statements against a live database. A mistyped
`-d` target turns a typo into data loss, and `--if-exists` will not save you — it suppresses errors
about objects that are *absent*, not about the wrong database being emptied. Read the `-d` value
twice before pressing enter, and never use this variant for a practice run: practice against a
scratch database name that does not exist yet.

---

## 5. Bare metal

The same two things, without containers. Run as a user who can `sudo -u postgres`; no password
belongs on any of these command lines.

```bash
# Backup — database
sudo -u postgres pg_dump -Fc pipelite > "pipelite-db-$(date +%F).dump"

# Backup — uploaded files. $UPLOAD_DIR is whatever your .env sets; see the callout below.
sudo tar czf "pipelite-uploads-$(date +%F).tar.gz" -C "$UPLOAD_DIR" .

# Restore — database, into a fresh target
sudo -u postgres createdb pipelite
sudo -u postgres pg_restore -d pipelite --no-owner --no-privileges "pipelite-db-2026-08-23.dump"
```

To restore the files, extract the archive back over the upload directory and re-assert ownership:

```bash
sudo tar xzf pipelite-uploads-2026-08-23.tar.gz -C "$UPLOAD_DIR"
sudo chown -R pipelite:pipelite "$UPLOAD_DIR"     # your service user, whatever PM2 runs as
```

> **Back up whatever `UPLOAD_DIR` actually points at, and do not let it be the default.** The
> application's fallback is `/tmp/uploads`, and most distributions clean `/tmp` on a schedule or on
> reboot. A bare-metal install left on the default can therefore lose every uploaded file with no
> deploy, no restart and no error — set `UPLOAD_DIR` to a persistent path such as
> `/var/lib/pipelite/uploads`, owned by the service user. See
> [UPLOAD_DIR in the configuration reference](./configuration.md#upload_dir).

---

## 6. Verify the restore

Run these three in this order. The **ledger query leads**, because it is the only one of the three
whose output differs between a good restore and a bad one.

```bash
# 1. AUTHORITATIVE — the migration ledger. This is the check that distinguishes a complete
#    restore from a broken one, because the NUMBER changes. Expect a count matching your
#    source database (20 as of this writing) and a plausible timestamp. A count of 0, or a
#    "relation does not exist" error, means the dump did not include the `drizzle` schema —
#    see the pitfalls table.
docker compose exec -T postgres psql -U pipelite -d pipelite -qAt \
  -c "select count(*), max(created_at) from drizzle.__drizzle_migrations;"

# 2. Extensions. Run this BEFORE restoring on managed Postgres, not after.
docker compose exec -T postgres psql -U pipelite -d pipelite -qAt \
  -c "select name, default_version from pg_available_extensions where name in ('pg_trgm','unaccent');"

# 3. Migration replay — a smoke test, NOT a verdict. Read the warning below before trusting it.
docker compose exec -T app npx drizzle-kit migrate
```

### Why step 3 is not the authoritative check

It is tempting to treat `drizzle-kit migrate` as the verdict, because the container entrypoint runs it
unconditionally on every start, so a complete restore makes it a no-op. **Do not rely on its output.**
Measured 2026-08-24 against a correctly restored database:

```
{ severity: 'NOTICE', code: '42P07',
  message: 'relation "__drizzle_migrations" already exists, skipping', ... }
[✓] migrations applied successfully!
```

Two problems for an operator reading that:

1. **`[✓] migrations applied successfully!` is printed whether it applied 0 migrations or all 20.**
   The success line is identical in the case you want and the case you fear, so it cannot tell them
   apart. Only the ledger count in step 1 can.
2. **The `NOTICE` blocks look like errors and are not.** `relation ... already exists, skipping` is
   the expected, healthy output on a restored database. Operators routinely mistake this for a failed
   restore and re-run the whole procedure.

Run step 3 to confirm the app can start, then judge the restore on step 1's number.

To compare the restored database against the source in one number:

```bash
docker compose exec -T postgres sh -c '
Q="SELECT string_agg(format('"'"'SELECT %L AS t, count(*) FROM %I.%I'"'"', schemaname||'"'"'.'"'"'||tablename, schemaname, tablename), '"'"' UNION ALL '"'"') FROM pg_tables WHERE schemaname IN ('"'"'public'"'"','"'"'drizzle'"'"');"
SQL=$(psql -U pipelite -d pipelite -qAt -c "$Q")
psql -U pipelite -d pipelite -qAt -c "$SQL" | sort | md5sum'
```

That is an md5 over per-table row counts across both the `public` and `drizzle` schemas — 37 tables,
one line of output, including the migration ledger. Run it against the source before the dump and
against the target after the restore; the two md5s must match.

**It compares counts, not column values.** A matching checksum means no table gained or lost rows. It
is not a proof that the two databases are identical, and it should not be described as one.

To spot-check the files, count them on both sides:

```bash
docker compose exec -T app sh -c 'find /app/uploads -type f | wc -l'
```

---

## 7. Extensions

Pipelite creates two PostgreSQL extensions, in `drizzle/0016_dedup_functions.sql`:

| Extension | Version | What depends on it |
|---|---|---|
| `pg_trgm` | 1.6 | The trigram indexes behind duplicate detection |
| `unaccent` | 1.1 | Accent-insensitive name normalization |

Both are `trusted = true` on PostgreSQL 16, which means **a database owner can create them without
superuser**. You do not need, and should not use, a superuser role for a restore.

**On managed PostgreSQL (RDS, Cloud SQL, Neon, Supabase), run step 3 of section 6 before you
restore.** Managed providers gate extension creation on their own allow-list, independently of
`trusted`. Both of these are on essentially every provider's list, but confirming takes one query and
finding out afterwards does not.

**A failed `CREATE EXTENSION` is not something you can ignore and move past.** 38 dependent routines
and the deduplication indexes are created on top of these two extensions; without them the restore
does not merely lose duplicate detection, it fails to build a large part of the schema. Get the
extension available first, then restore.

---

## 8. Scheduling

A minimal daily backup with 14-day retention. Adjust the paths; keep the destination off the app
host.

```bash
# /etc/cron.d/pipelite-backup   (Docker deployment)
# m h  dom mon dow  user  command
  30 2  *   *   *   root  cd /opt/pipelite && \
    docker compose exec -T postgres pg_dump -U pipelite -Fc pipelite > /srv/backups/pipelite-db-$(date +\%F).dump && \
    docker run --rm -v pipelite_uploads_data:/data:ro -v /srv/backups:/backup alpine:3 \
      tar czf /backup/pipelite-uploads-$(date +\%F).tar.gz -C /data .

# Retention: delete anything older than 14 days
  30 3  *   *   *   root  find /srv/backups -name 'pipelite-*' -mtime +14 -delete
```

`%` must be escaped as `\%` in a crontab — an unescaped `%` is a newline to `cron`, and the job
silently truncates at that point.

Two things make the difference between a backup schedule and a backup:

1. **Copy the files off the host** — `rsync`, `rclone`, or your provider's object storage, as a third
   cron line. Everything above still lives on the machine that is going to fail.
2. **Practice the restore.** An untested backup is a hypothesis. Restore into a scratch database name
   that does not exist yet, run the verification in section 6, then drop it.

---

## 9. Pitfalls

Each row is a measured failure, not a style preference.

| Pitfall | Consequence |
|---|---|
| Running against a service named `db` | There is no such service. `docker-compose.yml` defines `app`, `postgres` and `mailhog`; the invocation exits nonzero and nothing is backed up. Use `postgres`. |
| Narrowing the dump with `--schema`, `-n` or `-t` | `drizzle.__drizzle_migrations` lives in its own `drizzle` schema, so a public-schema-only dump silently omits the migration ledger. The container entrypoint then re-runs all 20 migrations against restored data on the next start. Dump the whole database — that is what makes the entrypoint's migration step a verified no-op. |
| Adding `-j` to a piped restore | `pg_restore: error: parallel restore from standard input is not supported`, exit 1. Even from a file copied inside the container, `-j 4` measured *slower* at this size (20.1s against 9.9s single-threaded). Only worth considering at tens of GB, and only with the dump file inside the container first. |
| `docker compose exec app tar …` for the files | Runs as uid 1001. Use the `docker run --rm -v … alpine:3` form, which runs as root and is why ownership survives the round trip. |
| Plain-SQL dumps instead of `-Fc` | 121,722,344 bytes against 34,299,898, and you lose selective restore (`pg_restore -l` / `-L`) and `--clean --if-exists` entirely — neither works on a plain-SQL file. |
| A password on the command line | It lands in shell history and in the process list. You never need one: `docker compose exec` inherits the container's environment, and bare metal uses `sudo -u postgres` or `~/.pgpass`. |
| Leaving the dump in the repo working directory | `*.dump` is gitignored, which is a guard and not a plan. Move it off the host. |

---

## 10. See also

- **[Import & Export](./import-export.md)** — CSV/JSON export, for migrating data between systems.
  It is **not** a backup: no schema, no migration ledger, no uploaded files, and nothing on that page
  can rebuild a deployment.
- **[Docker deployment](./deployment/docker.md)** — the volumes this procedure backs up.
- **[Bare metal / VPS deployment](./deployment/bare-metal.md)** — the production checklist that points
  here.
- **[Configuration reference](./configuration.md)** — `UPLOAD_DIR`, `FILE_STORAGE` and the S3
  variables.
