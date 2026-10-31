# Research handovers

Open a project and choose **Handovers**. This first version turns the two approved local reference workflows into portable, inspectable handovers. It does not upload or execute arbitrary Python scripts, notebooks, shell commands, containers, or institutional HPC jobs.

## Create a reference

1. Complete a Dataset statistics or Seeded Monte Carlo run.
2. Choose **Create handover**, select that completed run, and describe the purpose, input meaning, assumptions and review instructions.
3. Declare absolute and relative comparison tolerances. Both default to zero and are bounded at 0.001. They cannot be changed after creation; create a new reference for a new policy.
4. Inspect the preflight checks. Missing/changed inputs or output artifacts and a changed approved implementation block verification and portable export.

Runs created before implementation fingerprints were introduced must be rerun before creating a handover. The reference records the workflow version, normalized workflow/CSV-parser implementation fingerprint, parameters, input checksums, expected result, Node version, platform, architecture and application revision. References are immutable through the API.

## Verify with another researcher

An existing collaborator or owner can choose **Verify handover**. Invite a colleague through the project's normal People workflow if needed. Viewers can inspect and export evidence but cannot queue work.

Each verification queues a new run through the existing approved runner in a fresh bounded worker. It uses the pinned input and parameters and shares the normal project queue/storage/daily quotas, permission checks, cancellation and recovery behavior. Repeat requests with the same idempotency key do not create duplicate runs.

The comparison checks every output field, including missing or additional fields. Integer values and text require exact equality. Fractional numeric values pass when:

```text
abs(rerun - reference) <= max(absoluteTolerance, relativeTolerance * abs(reference))
```

A matched author/package-creator rerun is clearly distinguished from a matched run requested by a different project account. A different account is not proof of a different human. Both executions use the same backend installation, not independently provisioned operating-system images. Runtime metadata differences are displayed, and changing the workflow/parser implementation requires a new reviewed reference. Matching results do not establish scientific validity.

## Portable packages and reports

**Export package** downloads a JSON package containing the actual input dataset (up to 2 MiB), reference values, parameters, runtime metadata, instructions and comparison policy. Share it only with intended recipients. Storage keys, passwords, session credentials and original account identifiers are excluded. Checksums detect accidental modification; they are not digital signatures or proof of authorship.

Use **Import package** in another authorized project or compatible Cognexus installation. Packages are limited to 3 MiB. Only the approved workflows and parameter shapes are accepted. Input size/base64/checksums and the package checksum must agree before storage is written. Imported reference authorship is always labeled unverified; an import never inherits the original author's verified identity or membership.

**Download report** exports reference metadata, preflight checks, verification participants, actual rerun identifiers, runtime metadata and field comparisons. It does not include raw input bytes. Verification history remains available even if an input later becomes unavailable. The handover screen shows queued/running, failed/cancelled, matched and different outcomes.

## Limits and current boundaries

Each project supports 100 handovers, each with up to 100 verification requests. Imports share the existing 250 MiB/500-file project quota. Archived projects retain authorized reads but reject creation, import and verification. Project membership revocation also revokes handover access. Input-file and snapshot integrity are checked before replay.

Scientific validity, independently verified human identity, arbitrary-project migration, exact OS/container reconstruction, external signatures, cross-institution identity, and real HPC execution remain future work. Keep actual research data private and establish domain review before interpreting a successful comparison as research evidence.

Local operation requires no paid provider or AI API. The [Vercel deployment](VERCEL.md) still requires its configured persistent backend; this feature does not provision hosting or a database.
