---
phase: 43-type-safety-deployment-docs
plan: 05
subsystem: infra
tags: [docker, volumes, uploads, persistence, pg_dump, pg_restore, backup, restore, polish-02]
requires:
  - phase: 43-03
    provides: "UPLOAD_DIR=/app/uploads, the uploads_data volume mount, and the image-layer mkdir+chown"
  - phase: 43-04
    provides: "docs/admin/backup-restore.md — the runbook this plan executes as written"
  - phase: 43-01
    provides: "the .d.ts augmentation whose production-compiler check falls out of the rebuild (A5)"
provides:
  - "Experimental proof that an uploaded file lands under /app/uploads on the pipelite_uploads_data volume"
  - "Experimental proof that the file survives destruction and recreation of the app container"
  - "A non-vacuous proof of the runbook's tar round trip: 200 -> 404 -> 200 with a real deletion in the middle"
  - "POLISH-02 criterion 3: a real 34,299,898-byte dump restored into a scratch database, exit 0, matching checksum"
  - "Research assumption A2 settled: the runner image DOES carry /app/drizzle/meta/_journal.json"
  - "Research assumption A5 settled: next build's TypeScript pass reports zero errors on the merged tree"
affects: [phase-44, future-deployment-work, docs-admin-backup-restore]

tech-stack:
  added: []
  patterns:
    - "Prove persistence by destroying the container, not by restarting it — and prove the container identity changed"
    - "Prove a restore by deleting the artifact first and recording the failure code, so the restore is load-bearing"
    - "Restore drills name the scratch database as a literal, never a shell variable that could expand empty"
    - "Bracket a destructive-adjacent drill with the same live checksum before and after, so read-only is a number not an intention"

key-files:
  created:
    - ".planning/phases/43-type-safety-deployment-docs/43-05-SUMMARY.md"
  modified: []

key-decisions:
  - "Added --force-recreate to the second rebuild: a cached rebuild left the container Running and would have made the survival proof vacuous"
  - "Ran an extra PRE-fix upload as a negative control, proving the old behaviour writes to /tmp/uploads and loses the file on rebuild"
  - "Did NOT edit the runbook: A2's condition did not trigger because the journal is present and the doc never mentions it"
  - "Reported the ambiguity of the runbook's authoritative migrate check as a finding rather than editing it, since the plan scopes the allowed edit to one step"

patterns-established:
  - "Container-identity assertion: capture the container ID before and after a rebuild and prove the old one is gone"
  - "Volume-side verification: read the file through `docker run -v vol:/data alpine` so the claim does not depend on the app container"

requirements-completed: [POLISH-02]

duration: 14min
completed: 2026-08-24
---

# Phase 43 Plan 05: Prove Uploads Persist and the Restore Works Summary

**A real uploaded file was written to `/app/uploads` on a freshly created `pipelite_uploads_data` volume, survived destruction and recreation of the app container with an identical md5, was deleted (download went 404) and brought back by the runbook's own tar commands (download went 200); and a real 34,299,898-byte dump restored into `pipelite_restore_drill` with exit 0 and a byte-identical row-count checksum before being dropped.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-24T03:36Z
- **Completed:** 2026-08-24T03:50Z
- **Tasks:** 2 of 2
- **Files modified:** 0 source/config files (this plan is verification-only; the one conditional runbook edit did not trigger)

## Accomplishments

- D-3 is now proven by experiment rather than prose, on all three axes the plan demanded: the write path, the survival event, and the restore.
- POLISH-02 criterion 3 is satisfied against real data, with the live database provably untouched.
- Two research assumptions (A2, A5) are settled with observed output.
- A latent vacuity in the plan's own step 5 was caught and closed (see Deviations).

## Task Commits

1. **Task 1: Prove an uploaded file survives a rebuild, and that the runbook's tar round trip restores it** — no commit: the plan declares `files: none — verification only`, and the working tree was verified clean afterward (`git status --porcelain` empty).
2. **Task 2: Exercise the restore against a real dump, in a scratch database, then drop it** — no commit: the single conditional runbook edit in step 5 did not trigger (A2 resolved in the doc's favour).

**Plan metadata:** this SUMMARY (docs: complete plan) — the only commit this plan produces.

`HEAD` was `322b77b29dfef08a8d6226e197af9f81ca8189e7` at start and remained so through both tasks.

## Precondition — waves 1 and 2 confirmed present

| Check | Expected | Observed |
|---|---|---|
| `grep -c 'UPLOAD_DIR=/app/uploads' docker-compose.yml` | 1 | **1** |
| `grep -c 'uploads_data' docker-compose.yml` | 2+ | **3** (mount + declaration + a prose mention) |
| `grep -c 'chown nextjs:nodejs /app/uploads' Dockerfile` | 1 | **1**, at line **109** |
| `chown` line precedes `USER nextjs` | yes | `USER nextjs` at line **126** — 109 < 126 |
| `docs/admin/backup-restore.md` | exists | **exists**, 300 lines |
| branch / HEAD | master / 322b77b | **master / 322b77b** |

---

## Task 1 — uploads persistence

### Step 0 — pre-fix negative evidence (recorded before anything changed)

```
UPLOAD_DIR=[]
docker volume ls | grep -c pipelite_uploads_data   ->  0
ls -ld /app/uploads                                ->  ls: /app/uploads: No such file or directory
```

The container had **not** been rebuilt since the merge, so the negative evidence is real and available.
`pipelite_uploads_data` **did not exist** — which matters, because it means the volume created in step 1
was genuinely fresh and the ownership proof is about a fresh volume rather than one that might already
have had correct ownership from an earlier run.

**Extra negative control (not required by the plan).** An upload was run against the pre-fix container
first, to demonstrate the defect rather than only the fix:

```
HTTP=200
"path": "/tmp/uploads/phase43probe/probefield/d2174699-8ab6-4e1f-99cf-717c2da92c01.txt"
/tmp/uploads/phase43probe/probefield/:
-rw-r--r-- 1 nextjs nogroup 47 Aug 24 03:37 d2174699-8ab6-4e1f-99cf-717c2da92c01.txt
```

After the rebuild that file was **gone** (`ls: /tmp/uploads/phase43probe/probefield/: No such file or
directory`). That is the exact data-loss the phase exists to fix, observed once, on purpose.

### Step 1 — the rebuild

Exact command (`$DC` expanded; `MAIN=/home/pedro/programming/pipelite` from `--git-common-dir`):

```
docker compose -f /home/pedro/programming/pipelite/docker-compose.yml -p pipelite up -d --build
```

`restart` was **not** used at any point. Build result:

```
#29 naming to docker.io/library/pipelite-app:latest done
 Image pipelite-app Built
 Volume pipelite_uploads_data Created      <-- fresh volume
 Container pipelite-app-1 Recreated
 Container pipelite-app-1 Started
```

**`next build` type check (assumption A5 — settled, no error).** `next.config.ts` contains no
`ignoreBuildErrors` and no `ignoreDuringBuilds` (grep: 0 matches), so this pass is authoritative:

```
#18 [builder 5/6] RUN npm run build
#18 2.924 ▲ Next.js 16.1.6 (Turbopack)
#18 2.929 ⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
#18 45.65 ✓ Compiled successfully in 42s
#18 45.68   Running TypeScript ...
#18 85.89   Collecting page data using 3 workers ...
```

`Running TypeScript` ran for ~40 s and emitted **zero type errors**; the build proceeded to page
collection and completed. The only warning is the pre-existing `middleware` → `proxy` deprecation,
unrelated to this phase. Plans 43-01/43-02's `.d.ts` augmentation therefore type-checks under the
production compiler, not only under `tsc`.

**Entrypoint migration output — nothing to do:**

```
app-1  | [✓] migrations applied successfully!Starting application...
app-1  | ▲ Next.js 16.1.6
app-1  | ✓ Ready in 238ms
```

Because `drizzle-kit` prints that same line whether it applied 0 or 20 migrations, the no-op was
confirmed numerically instead: `select count(*), max(created_at) from drizzle.__drizzle_migrations`
returned **`12|1787441440793`**, unchanged from the expected live value.

### Step 2 — the three parts took effect

```
UPLOAD_DIR=[/app/uploads]
drwxr-xr-x    2 nextjs   nodejs        4096 Aug 24 03:37 /app/uploads
uid=1001(nextjs) gid=65533(nogroup) groups=65533(nogroup)

pipelite_uploads_data | /mnt/data/docker/volumes/pipelite_uploads_data/_data | created=2026-08-24T00:42:37-03:00
```

`gid=65533(nogroup)` is exactly why plan 43-03 chowns the user and not the group.

### Step 3 — the upload, and the path assertion

```json
HTTP=200
{
    "success": true,
    "file": {
        "id": "7ad4d593-7ef2-4f4c-91d4-e88cb29b0a37",
        "filename": "probe-upload.txt",
        "storedName": "7ad4d593-7ef2-4f4c-91d4-e88cb29b0a37.txt",
        "path": "/app/uploads/phase43probe/probefield/7ad4d593-7ef2-4f4c-91d4-e88cb29b0a37.txt",
        "publicUrl": "/api/files/phase43probe/probefield/7ad4d593-7ef2-4f4c-91d4-e88cb29b0a37.txt",
        "size": 47,
        "mimeType": "text/plain"
    }
}
```

The `path` **starts with `/app/uploads`** — the phase's central claim. No 500, so the image-layer chown
took and no `chmod` was needed or attempted. Local source file: 47 bytes,
md5 `d378929666dade68dce21a7d2d67c814`.

### Step 4 — on disk, in the volume, and over HTTP

In the app container:
```
-rw-r--r--    1 nextjs   nogroup         47 Aug 24 03:43 7ad4d593-....txt
d378929666dade68dce21a7d2d67c814  /app/uploads/phase43probe/probefield/7ad4d593-....txt
```

Read from the **volume itself**, independent of the app container
(`docker run --rm -v pipelite_uploads_data:/data:ro alpine:3`):
```
-rw-r--r--    1 1001     65533           47 /data/phase43probe/probefield/7ad4d593-....txt
d378929666dade68dce21a7d2d67c814  /data/phase43probe/probefield/7ad4d593-....txt
```

Download: `HTTP=200`, 47 bytes, md5 `d378929666dade68dce21a7d2d67c814`, `diff` identical
(`BYTES_MATCH`).

### Step 5 — the survival event

The plan's literal instruction (`$DC up -d --build` again) turned out to be **insufficient**, and this is
the most important finding in the plan. The second build hit the layer cache, produced the identical
image digest `sha256:b50d31bf...`, and compose therefore left the container alone:

```
 Image pipelite-app Built
 Container pipelite-app-1 Running        <-- NOT recreated
```

A survival proof against a container that was never destroyed proves nothing. So the container identity
was captured and a genuine destroy+recreate forced (deviation 1 below):

```
CONTAINER_ID_BEFORE=4e4387e64ff45c45d07f55b7a6ac657748190fb5d9edac8b7c7b8a2913a53dbb
STARTED_BEFORE=2026-08-24T03:42:44.978409801Z

docker compose -f .../docker-compose.yml -p pipelite up -d --build --force-recreate app
 Container pipelite-app-1 Recreate
 Container pipelite-app-1 Recreated
 Container pipelite-app-1 Started

CONTAINER_ID_AFTER=d312aa2ccd86fb77a4788dbc6a021fceca3ccbddac081282a5f24d31bd1e5902
STARTED_AFTER=2026-08-24T03:43:52.150516899Z
docker inspect 4e4387e6...  ->  old container GONE (destroyed)
```

The container that wrote the file no longer exists. Re-running step 4 against the **new** container:

```
-rw-r--r--    1 nextjs   nogroup         47 Aug 24 03:43 7ad4d593-....txt
d378929666dade68dce21a7d2d67c814   (in-container md5, unchanged)
HTTP=200
downloaded: 47 bytes md5=d378929666dade68dce21a7d2d67c814
SURVIVED_BYTES_MATCH
```

**Byte count 47 and md5 `d378929666dade68dce21a7d2d67c814` on both sides of the destroy+recreate.**

### Step 6 — the runbook's tar round trip, made load-bearing

Run from the runbook verbatim (section 2 command 2 and section 3 command 4), with `$PWD` being the
directory holding `docker-compose.yml`, i.e. `/home/pedro/programming/pipelite`.

Backup:
```
docker run --rm -v pipelite_uploads_data:/data:ro -v "$MAIN:/backup" alpine:3 \
  tar czf "/backup/pipelite-uploads-$(date +%F).tar.gz" -C /data .
exit=0 ; pipelite-uploads-2026-08-24.tar.gz  249B

drwxr-xr-x 1001/1001         0 ./
drwxr-xr-x 1001/nogroup      0 ./phase43probe/
drwxr-xr-x 1001/nogroup      0 ./phase43probe/probefield/
-rw-r--r-- 1001/nogroup     47 ./phase43probe/probefield/7ad4d593-....txt
```

`git check-ignore -v` confirms the archive is ignored by `.gitignore:44:pipelite-uploads-*.tar.gz`, so
the runbook's "drops them into your working directory by design" does not dirty the tree.

**The deletion, and the recorded failure:**
```
docker run --rm -v pipelite_uploads_data:/data alpine:3 rm -rf /data/phase43probe   (exit 0)
volume now:  total 8   drwxr-xr-x 2 1001 1001 .   (empty)

GET /api/files/phase43probe/probefield/7ad4d593-....txt
HTTP=404
body: {"error":"File not found"}
```

**The non-200 is `404` with `{"error":"File not found"}`.** This is what makes the restore below
load-bearing rather than decorative.

Restore:
```
docker run --rm -v pipelite_uploads_data:/data -v "$MAIN:/backup:ro" alpine:3 \
  tar xzf "/backup/pipelite-uploads-2026-08-24.tar.gz" -C /data
tar exit=0

-rw-r--r--    1 1001     65533           47 /data/phase43probe/probefield/7ad4d593-....txt
d378929666dade68dce21a7d2d67c814

HTTP=200
restored: 47 bytes md5=d378929666dade68dce21a7d2d67c814
RESTORED_BYTES_MATCH
```

**Restored file owner: uid 1001, gid 65533** — ownership survived the round trip, confirming the
runbook's guidance to use `docker run … alpine:3` rather than `docker compose exec app tar`.

Full sequence of observed HTTP codes: **200 (present) → 404 (deleted) → 200 (restored)**.

### Step 7 — cleanup verified

```
volume listing:  total 8   drwxr-xr-x 2 1001 1001 .   ..     (no phase43probe)
ls pipelite-uploads-*.tar.gz -> No such file or directory
git status --porcelain -> (empty)
```

No source or configuration file was modified by this task.

---

## Task 2 — the restore drill

### Every command that took a database name as an argument

Listed so the D-5 claim is checkable rather than asserted:

| # | Command | DB name | Kind |
|---|---|---|---|
| 1 | `pg_dump -U pipelite -Fc pipelite` | `pipelite` | **read-only** (source) |
| 2 | `createdb -U pipelite pipelite_restore_drill` | `pipelite_restore_drill` | create (scratch) |
| 3 | `pg_restore -U pipelite -d pipelite_restore_drill --no-owner --no-privileges` | `pipelite_restore_drill` | **restore target (scratch only)** |
| 4 | `psql -U pipelite -d pipelite -qAt -c <count/checksum/ledger/extension selects>` | `pipelite` | **read-only** |
| 5 | `psql -U pipelite -d pipelite_restore_drill -qAt -c <count/checksum/ledger selects>` | `pipelite_restore_drill` | read-only |
| 6 | `dropdb -U pipelite pipelite_restore_drill` | `pipelite_restore_drill` | drop (scratch) |
| 7 | `psql -U pipelite -d pipelite -qAt -c "select datname from pg_database order by 1;"` | `pipelite` | **read-only** |

**`pipelite` was never a `pg_restore`, `createdb` or `dropdb` target. Neither `--clean` nor
`--if-exists` appears anywhere in this plan's execution.** The scratch name was typed as a literal in
every command — never a shell variable.

### 1. Dump

```
pg_dump exit=0  elapsed=4s
bytes=34299898
file: PostgreSQL custom database dump - v1.15-0
md5=d6510c304079315cfe721cea9e5b80ae
```

34,299,898 bytes — byte-for-byte the size research measured, and in the `-Fc` order of magnitude (a
~121 MB result would have meant `-Fc` was dropped). `file` confirms it is a real custom-format dump and
not an error message captured to disk.

### 2-3. Create and restore

```
createdb exit=0
pg_restore EXIT_CODE=0   elapsed=10s
stderr byte count: 0     (empty)
```

**Exit 0, zero stderr bytes** — the outcome the runbook's mandatory `--no-owner --no-privileges` exists
to produce. No retry with different flags was needed or attempted.

### 4. Parity

```
live_tables=37    LIVE  md5: 870a172d371b44a03f0941466e29cbcc
drill_tables=37   DRILL md5: 870a172d371b44a03f0941466e29cbcc
```

**Identical, over 37 tables** across the `public` and `drizzle` schemas, matching the value research
recorded. Apples-to-apples object counts (same query against both):

| | `pipelite` | `pipelite_restore_drill` |
|---|---|---|
| indexes (public+drizzle) | 82 | **82** |
| constraints (public+drizzle) | 84 | **84** |
| routines (public) | 38 | **38** |

Drill extensions: `pg_trgm 1.6`, `plpgsql 1.0`, `unaccent 1.1`.
Drill migration ledger: **`12|1787441440793`** — count and `max(created_at)` both match live exactly, so
the entrypoint's unconditional `drizzle-kit migrate` would find nothing to do against the restored data.

**Bounding the claim:** the checksum compares **per-table row counts, not column values.** A match means
no table gained or lost rows. It is not a proof that the two databases are identical and is not
described as one here.

### 5. Assumption A2 — settled, and the runbook needs no change

```
$DC exec -T app sh -c 'ls -l /app/drizzle/meta/_journal.json'
-rw-rw-r--    1 nextjs   nodejs        2972 Aug 24 03:40 /app/drizzle/meta/_journal.json
journal_exit=0
ls /app/drizzle/*.sql | wc -l  ->  20
```

**A2 is FALSE as stated in research.** The journal *is* present in the runner image, along with all 20
migration `.sql` files, despite the runner stage having no explicit `COPY … /app/drizzle`. Ownership
(`nextjs:nodejs`) points at the `COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./`
line as the carrier — Next.js's standalone output traces the drizzle directory in. This is also why the
entrypoint's `npx drizzle-kit migrate` has been working on every container start.

Consequently the plan's conditional edit **did not trigger**, on two independent grounds:
1. The journal is present, so any in-container instruction about it would be correct anyway.
2. `grep -n '_journal\|journal' docs/admin/backup-restore.md` returns **0 matches** — the runbook never
   tells the operator to read the journal at all, from inside the container or anywhere else.

`docs/admin/backup-restore.md` was therefore **not modified**, and no `docs(43-05)` commit exists.

### The runbook was executed as written — results

Every runbook command that was run worked as written. Section 6's three verification commands:

```
# 6.1 authoritative migrate check
$DC exec -T app npx drizzle-kit migrate
  ... message: 'relation "__drizzle_migrations" already exists, skipping', ...
  [✓] migrations applied successfully!

# 6.2 schema position
12|1787441440793

# 6.3 extensions
unaccent|1.1
pg_trgm|1.6

# 6 file spot-check
find /app/uploads -type f | wc -l  ->  0
```

**One runbook weakness found — reported, not edited.** Section 6 calls step 1 "AUTHORITATIVE … Migrate
must find nothing to do. If it wants to apply migrations, your restore is missing the migration ledger."
But `drizzle-kit` prints `[✓] migrations applied successfully!` in **both** cases — whether it applied
zero migrations or the whole history — and here it also emitted a multi-line PostgreSQL `NOTICE` block
about `__drizzle_migrations` already existing, which reads alarming while being benign. An operator
cannot actually distinguish the two outcomes from step 1's output; step 2's `count(*), max(created_at)`
is what distinguishes them. I did **not** edit this: the plan scopes the permitted edit to the single A2
journal step, and widening it would break that constraint. Recommended follow-up: reorder section 6 so
the ledger query is the authoritative check, or add one line telling the operator that the success
message is not by itself evidence and to confirm the count is unchanged.

### 6. Drop, proven

```
dropdb exit=0

select datname from pg_database order by 1;
pipelite
pipelite_dedup_test
postgres
template0
template1

rm -f /tmp/pipelite-drill.dump
ls: cannot access '/tmp/pipelite-drill.dump': No such file or directory
```

`pipelite_restore_drill` is **absent** from the listing; `pipelite` is **present**. The dump is gone from
`/tmp`. (`pipelite_dedup_test` is pre-existing and was never touched by this plan.)

### 7. The live database is provably unchanged

```
LIVE md5 after the drill:  870a172d371b44a03f0941466e29cbcc   (37 tables)
LIVE md5 before the drill: 870a172d371b44a03f0941466e29cbcc   (37 tables)
```

Identical. The drill was read-only against `pipelite`, stated as a number rather than an intention.

---

## Final state of the stack and the gates

| Gate | Result |
|---|---|
| `/api/health` | **HTTP 200**, `status: ok`, `db: {ok: true, latencyMs: 2}` |
| Processors | **10 / 10 `alive: true`** — audit-prune, audit-subscriber, email-processor, execution-processor, schedule-processor, stage-history-subscriber, trash-prune, webhook-processor, webhook-subscriber, workflow-trigger-subscriber |
| `npx tsc --noEmit` | **exit 0, 0 errors** |
| `npm test` | **4605 passed / 32 skipped** (166 files passed / 2 skipped) — baseline exact |
| RSC project | **8 passed / 8** — baseline exact |
| `npm run lint` | **0 errors**, 124 warnings — main-checkout baseline exact |
| `git status --porcelain` | **empty** |
| `git diff HEAD -- package.json package-lock.json` | **empty — untouched** |
| `HEAD` | `322b77b29dfef08a8d6226e197af9f81ca8189e7`, unchanged through both tasks |
| Leftovers | volume empty, no `pipelite-uploads-*.tar.gz`, no `/tmp/pipelite-drill.dump`, no scratch database |

No `npm install` was run. Postgres and Mailhog were never stopped and `postgres_data` was never touched.

## Decisions Made

- **Forced the container recreation** rather than accepting the cached rebuild — see deviation 1. The
  alternative was a survival assertion that could not fail.
- **Ran a pre-fix upload as a negative control.** Not required by the plan, but it converts "the fix
  works" into "the old behaviour demonstrably lost the file and the new one demonstrably does not", for
  the cost of one `curl`.
- **Left the runbook untouched** and reported its one weakness instead of fixing it, because the plan
  authorised exactly one conditional edit and that condition did not fire.
- **Verified the file from the volume side** (`docker run -v pipelite_uploads_data:/data:ro alpine:3`)
  in addition to from inside the app container, so the persistence claim does not rest on the app
  container's own view of its filesystem.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's step 5 survival test was vacuous as written**
- **Found during:** Task 1, step 5
- **Issue:** The plan says to re-run `$DC up -d --build` to produce "the survival event". Because
  nothing in the build context had changed, the second build was fully cached, produced the identical
  image digest (`sha256:b50d31bf...`), and Docker Compose consequently reported
  `Container pipelite-app-1 Running` — it did **not** recreate the container. The file would have
  "survived" an event that never happened. This is the same class of defect as testing a rebuild with
  `restart`, which the plan explicitly forbids in threat T-43-33; the plan closed the `restart` hole but
  left the cached-`up` hole open.
- **Fix:** Captured `docker inspect -f {{.Id}}` before and after, and used
  `up -d --build --force-recreate app` to guarantee a real destroy+recreate. Then asserted the container
  ID changed (`4e4387e6…` → `d312aa2c…`) and that the old container no longer exists.
- **Files modified:** none (execution-only change)
- **Verification:** old container ID no longer resolvable via `docker inspect`; new `StartedAt`
  `2026-08-24T03:43:52Z` vs old `2026-08-24T03:42:44Z`; the probe file still present with md5
  `d378929666dade68dce21a7d2d67c814`.
- **Committed in:** n/a — no file change

---

**Total deviations:** 1 auto-fixed (1 × Rule 1).
**Impact on plan:** No scope creep. The deviation strictly strengthens the plan's central proof; without
it, the headline persistence claim would have rested on an event that did not occur.

## Issues Encountered

- **`docker ps -q` / some compose invocations were mangled by the local `rtk` shell hook** (one call came
  back `unknown docker command: "compose rtk"`, another `unknown shorthand flag: 'q'`). Worked around by
  using `docker inspect <name>` with a `-f` template instead of `ps -q`. No effect on any result; every
  reported value was obtained from a command that ran cleanly.
- **`pg_constraint` counts initially looked mismatched against research** (196 vs research's 83). That
  was my first query counting the whole catalog rather than scoping to `public`+`drizzle`. Re-run
  identically against both databases: 84 = 84. Not a data discrepancy.
- The dump was written via shell redirection, which this project's memory flags as a hook-elision risk.
  Ruled out by `file` reporting `PostgreSQL custom database dump - v1.15-0` and the size matching
  research's measurement to the byte.

## What remains unproven

Stated explicitly, because the point of this plan is to distinguish what was observed from what was
assumed:

- **The checksum compares row counts, not column values.** A restore that preserved every row count
  while corrupting field contents would pass this gate. Verifying values would need a full data diff,
  which was out of scope.
- **Only the `local` file-storage backend was exercised.** `FILE_STORAGE=s3` was not tested; the volume
  fix is irrelevant to that path and the runbook's file section does not cover it.
- **A single 47-byte text file was used.** Nothing about large files, many files, concurrent writes, or
  volume disk-exhaustion behaviour was tested.
- **The restore was into an empty scratch database on the same cluster and same PostgreSQL 16 image.**
  Restoring onto a different major version, a different provider, or a managed cluster with an
  extension allow-list was not exercised — section 7 of the runbook is still untested advice.
- **The bare-metal procedures in runbook section 5 were not run at all.** Only the Docker paths were.
- **Section 4 (`--clean --if-exists` restore over an existing database) was deliberately not run**, per
  the plan's absolute prohibitions. Its correctness rests on research's earlier measurement, not on this
  plan.
- **The pre-existing `entityId` path-traversal debt was not exercised or fixed** (T-43-37, accepted). The
  probe used the literal `phase43probe` only.
- `pipelite_uploads_data` now exists as a real volume in the user's environment and is empty. Future
  uploads will accumulate there and are covered by the runbook.

## User Setup Required

None — no external service configuration required. Note for the user: the dev stack was rebuilt and its
container recreated twice during this plan; it is back up and healthy on `http://localhost:3001` with all
ten background processors alive.

## Next Phase Readiness

- POLISH-02's third criterion has real evidence behind it; D-3's "documentation alone is not acceptance"
  bar is met by observation.
- Phase 43 wave 3 is complete. The one open follow-up is cosmetic and documented above: section 6 of
  `docs/admin/backup-restore.md` should not present `drizzle-kit migrate`'s success message as
  authoritative, since it is identical in the pass and fail cases.
- No blockers.

---
*Phase: 43-type-safety-deployment-docs*
*Completed: 2026-08-24*

## Self-Check: PASSED

- `43-05-SUMMARY.md` — FOUND (587 lines)
- Commit `3d5ddb9` — FOUND (`docs(43-05): prove uploads survive a rebuild and the restore works`)
- Commit contains no file deletions (`git diff --diff-filter=D HEAD~1 HEAD` empty)
- `git diff --stat 322b77b HEAD` → 1 file changed, this SUMMARY only; `package.json` /
  `package-lock.json` untouched
- `git status --porcelain` empty
- Stack healthy after all work: `/api/health` 200, `db.ok true`, 10/10 processors alive;
  `app Up`, `postgres Up (healthy)`, `mailhog Up`
- No scratch database, no dump, no archive, no probe file remains
