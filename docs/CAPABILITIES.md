# Capability and verification checklist

| Capability         | Implementation                                                                  | Verification / remaining gate                                                                             |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Accounts           | Salted scrypt passwords; opaque database sessions; Secure cookies in production | Session/recovery/race/upgrade tests; verified identity remains pending                                    |
| Projects and roles | Owner / collaborator / viewer, protected final owner                            | Isolation and revocation tests                                                                            |
| Invitations        | Email-bound, single-use, 48-hour expiry                                         | Binding/replay/expiry tests; manual private delivery only                                                 |
| Files              | Immutable uploads, private downloads, SHA-256 integrity                         | Upload/download/preview/corruption tests; live S3 test pending                                            |
| Queue              | PostgreSQL job records, idempotency, project quotas, leases                     | Duplicate submission, quota, expiry recovery and bounded retry tests                                      |
| Compute            | Real CPU reference workloads, thread memory/time bounds                         | Known-value and deterministic tests; no institutional HPC execution                                       |
| Results            | Persisted JSON artifacts, manifest export, UI comparison                        | Artifact/manifest integration tests; formal RO-Crate conformance pending                                  |
| AI                 | Server-side requests, explicit user action, evidence snapshots                  | Disabled-provider behavior tested; live-provider and correctness evaluation pending                       |
| Interface          | Responsive workspace, native accessible dialogs, actual persisted data          | Manual desktop/mobile and end-to-end run verification; automated accessibility audit pending              |
| Deployment         | Non-root Dockerfile, Compose, fail-closed production config                     | Local compiled build; CI image/PostgreSQL checks; no live hosted deployment                               |
| Operations         | Worker readiness, protected metrics, storage inventory and checksum inspection  | Metric authorization/label/worker and storage-integrity tests; live alerting, restore/load drills pending |
| Research adoption  | Pilot release criteria documented                                               | Requires researcher, real domain workflow, and measured user outcomes                                     |

Do not present pending gates as completed features. The local workflows are reference computations, not production scientific solvers.
