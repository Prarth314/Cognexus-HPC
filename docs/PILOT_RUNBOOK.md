# Restricted-pilot operations and recovery

Use one application replica, PostgreSQL 17 with UTF-8 encoding, and persistent private disk. The API and bounded worker share that process. PGlite is for local development and accepts one database-opening process at a time. No hosted backend, institutional compute, collector, or alert delivery is provisioned by these tools.

## Verify a clean checkout

```sh
npm ci
npm run format:check
npm run check
npm test
npm run build
npm run smoke
npm run restore:drill
npx playwright install chromium
npm run test:browser
npm run benchmark
npm run security:scan
npm audit --audit-level=moderate
```

`restore:drill`, browser checks, and benchmarks create synthetic accounts in disposable local data directories. They do not accept a public application URL. Browser checks cover desktop and mobile Chromium; axe checks the signup and completed-handover dialog against WCAG A/AA rules. Automated checks do not establish complete accessibility conformance or replace keyboard/screen-reader review.

The CI database matrix runs the same tests with `TEST_DATABASE_URL` set for PostgreSQL. The legacy migration fixture uses a new isolated schema on real PostgreSQL, upgrades versions 1 → 4 twice, and confirms preserved users/sessions. No new schema migration is required for this milestone: computation timing is an additive JSON manifest field. Older manifests remain readable. Never point test variables at a shared or production database.

The new CI jobs also run official `pg_dump`/`pg_restore` in the disposable PostgreSQL 17 service, a compiled process restart, browser checks, and a bounded benchmark. Existing container checks retain non-root execution, restricted database-role startup, vulnerability scanning, readiness, and the authentication boundary. New CI configuration is implemented; consult the milestone evidence report for what actually ran.

## Execution and recovery semantics

- Submission is one logical job per project/member/idempotency key; conflicting parameters return 409. Concurrent submissions serialize on the project row and obey the three-active-job quota.
- Claims use row locks with `SKIP LOCKED`. The lease is 90 seconds; computation is limited to 30 seconds and a 128 MiB worker old-generation heap. Process memory also includes the API, database client, buffers, and worker overhead.
- An abruptly lost process leaves queued jobs queued and running jobs leased. A later polling worker requeues an expired running job, up to **three total attempts**. Pure computation may execute more than once. This is not exactly-once execution.
- A normal computation/worker/storage failure becomes terminal `failed`; a fresh explicit submission is needed. A graceful shutdown aborts the active worker and normally marks that run failed with `Execution cancelled`. If the database is unavailable during failure reporting, the lease remains for bounded recovery. Queued jobs remain durable.
- Explicit user cancellation atomically marks queued/running work cancelled. Late completion checks both status and attempt; a cancelled or superseded attempt cannot register successful results. Repeated cancellation is safe.
- Result metadata, artifact registration, and completion audit event commit in one transaction. Failed output writes and rolled-back completion attempt cleanup. A hard kill, storage cleanup failure, or ambiguous database commit can still leave an orphan or missing object. Inspect and restore; storage and PostgreSQL are not a distributed transaction.

## Coordinated offline backup

Stop ingress and **all API/worker writers**, including old replicas and operator jobs. Stopping only browser traffic is insufficient. The offline command requires an acknowledgment; it cannot prove other writers are stopped. Read-only inventory is not a backup lock. Keep writers stopped until both database and artifact snapshots finish.

For local PGlite and disk, stop the application, then use separate new directories outside the source:

```sh
node scripts/offline-backup.mjs backup --all-writers-stopped /private/runtime-data /private/backups/snapshot-001
node scripts/offline-backup.mjs restore --all-writers-stopped /private/backups/snapshot-001 /private/disposable-restore-001
```

Set `APP_REVISION` to the full source commit for backup provenance. This copies the closed PGlite database and disk objects together. It accepts regular files, rejects symlinks/hard links, records SHA-256, rejects changed/unlisted restored files and existing destinations, and never deletes or overwrites a target. Bounds: 20,000 files, 64 MiB per file, 512 MiB total. Failed attempts may leave an incomplete new directory; retain it for inspection and choose another new destination. This is a small-pilot tool, not a live/incremental backup system. Checksums detect corruption, not malicious replacement by someone controlling the backup and its manifest.

For PostgreSQL, **the disk command alone does not back up the database**. Pair an official PostgreSQL 17 custom-format dump with the private objects while writers stay stopped. In the existing Compose topology, an authorized operator can stop `app`, run `pg_dump -Fc -f /tmp/cognexus-pilot.dump` inside `database`, and copy the dump out with `docker compose cp`. Copy `/app/data/objects` from the stopped application container to a private staging directory and run the offline snapshot tool on that staging directory. Record both checksums, application revision, database version, and the maintenance window together. Using a dump file avoids binary-redirection corruption in older Windows shells.

Encrypt the paired backups, restrict OS ACLs, and store a copy off the host. Backups contain datasets, password hashes, active session records, and recovery/enrollment metadata; never attach them to GitHub or CI artifacts. POSIX modes do not configure Windows ACLs. Decide retention, key ownership, session revocation after recovery, and who can access backups before a real pilot.

Restore PostgreSQL into a **new isolated database** with matching object bytes and compatible application revision. Use `pg_restore --exit-on-error`; do not restore over production. Re-establish restricted application-role ownership/permissions, verify `/api/ready`, authenticate synthetic fixtures, compare manifests and download checksums, check outsider denial, and run `storage:inspect -- --verify`. Then review a separate authorized cutover. A successful disposable drill establishes neither a production RTO nor an RPO.

### Reproduce the PostgreSQL drill

CI supplies `PILOT_POSTGRES_CONTAINER` (the exact disposable service container ID) and a loopback-only `PILOT_POSTGRES_ADMIN_URL`. For an explicitly disposable local PostgreSQL 17 cluster, instead provide `PILOT_POSTGRES_BIN`, a directory containing official `pg_dump` and `pg_restore`, plus the loopback admin URL. Run `npm run restore:drill`. It creates two random `cognexus_drill_*` databases, performs the complete investigation, stops the compiled writer, dumps/restores, verifies the isolated target, and drops only the databases it created. It also verifies an existing restore directory cannot be overwritten. No production restoration command is run automatically.

## Incident actions

| Signal                     | Inspect and act                                                                                                                                                                   | Verification / boundary                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Queued job appears stuck   | Check `/api/ready`, protected worker polling metric, structured logs, database availability, and current job status. Restore dependencies; allow the poller to claim queued work. | Readiness checks DB connectivity and recent worker polling, **not storage**. One poller runs one job at a time.                                |
| Running lease expired      | Restore DB/worker connectivity; allow bounded lease recovery. Inspect attempt count and terminal error before explicit resubmission.                                              | Do not reset attempts or submit an unbounded retry loop.                                                                                       |
| Failed or cancelled run    | Read the safe run error, inspect input version/column, correct the cause, and clone configuration for a new reviewed run.                                                         | Failed runs do not become successful merely because a retry button was pressed.                                                                |
| Artifact unavailable / 503 | Preserve metadata and investigate disk/mount/provider permissions. Stop writers for integrity inspection; restore original bytes from the matching coordinated backup.            | Authorized API errors give a recovery action; outsiders still receive 404. Never fabricate replacement output or change the recorded checksum. |
| Integrity mismatch / 409   | Preserve evidence, restrict affected access, run read-only checksum inspection, and restore matching original bytes.                                                              | Do not delete orphan candidates automatically.                                                                                                 |
| DB unavailable             | Inspect private database health/role/disk, restore connectivity, check readiness and terminal/recovered jobs.                                                                     | Requests can fail; the app does not claim availability or successful commits during an outage.                                                 |
| Backup failure             | Keep the last known-good backup, inspect the failed new target and writer state, rerun to a different new destination, and repeat isolated verification.                          | Never overwrite the last backup or delete a production volume.                                                                                 |

## Safe alert demonstration

`npm run restore:drill` removes **one synthetic object only in the disposable restored copy**, confirms an authorized download returns actionable 503, confirms the protected metrics include that 503, restores the fixture bytes, and verifies downloads/integrity again. This proves a local observable condition, not hosted alert transport or delivery. `/api/metrics` requires `OPERATIONS_TOKEN`; metric labels use route templates and status codes, not project/user identifiers. The sampled RSS gauge is process memory at scrape time, not peak memory or container memory accounting.

For an actual pilot, configure and exercise a collector and private alert destination, establish incident ownership, schedule encrypted off-host backups, and repeat the restore drill on the target infrastructure. Those operator actions remain external release gates.
