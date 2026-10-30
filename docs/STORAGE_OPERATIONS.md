# Storage integrity and reconciliation

The storage inspector is an operator command that compares database references with the configured private object store. It never alters object bytes, deletes data, repairs metadata, or runs schema migrations.

```sh
# Inspect object existence and recorded sizes.
npm run storage:inspect
# Also read referenced objects and verify their SHA-256 checksums.
npm run storage:inspect -- --verify
```

For a compiled container use `node dist-server/server/inspect-storage.js --verify` with the same private runtime configuration as the application. Embedded PGlite supports one process at a time: stop the development application before opening its database in the inspector. PostgreSQL allows a separate inspection connection.

The default inventory is bounded to 10,000 file references and 10,000 storage objects. Exceeding the bound fails the inspection rather than reporting an incomplete inventory as complete. Unknown non-UUID objects are counted but never read. The S3 adapter paginates its listing and needs the relevant private-bucket listing permission. Live S3 operation still requires provider-specific validation.

## Interpret the report

- `missing_object`: metadata references bytes that are absent from the inventory. Restore from a matching backup and investigate.
- `size_mismatch`: actual size differs from the immutable record. Do not rewrite the reference to hide the discrepancy.
- `checksum_mismatch`: size matches but the content differs. Quarantine operational access and investigate integrity.
- `unreadable`: listing succeeded but reading failed; inspect storage access and provider health.
- `orphans`: UUID objects without a database reference. Objects younger than 24 hours may be incomplete uploads. Older objects are candidates for review, not automatic deletion.
- `verified`: objects actually read and matched. Metadata-only mode correctly reports zero checksum verifications.

Exit code 1 means integrity inconsistencies were found. Operational errors also fail the command. A successful report is a point-in-time inspection, not a backup, a continuous monitor, or proof that every object is scientifically valid.

## Handle orphan candidates safely

Pause ingress and stop writers for a consistent maintenance window. Take a coordinated database/artifact backup. Re-run the inventory, verify no run or input manifest depends on the object, and review the age and source. Do not delete objects merely because they appeared in one live inventory. This release deliberately provides no deletion switch.

Add scheduled inspection and alert delivery through the deployment's monitoring system after validating credentials and expected volume. The repository does not create a background cloud service or scheduler on the user's behalf.
