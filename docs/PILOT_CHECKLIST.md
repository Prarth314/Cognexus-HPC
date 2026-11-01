# Restricted-pilot engineering checklist

Baseline inspected: `da636f1` (2026-10-31). This is an engineering milestone, not a public launch or a claim of scientific validity.

| Capability                                                                                   | Baseline classification                                              | Priority / action                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Approved workloads, private projects, immutable files, manifests and handovers               | Implemented and verified by API tests and compiled smoke             | Retain; expand built journey to CSV and another member                  |
| Roles, invitation expiry/revocation, stale browser responses, archived writes                | Implemented and verified                                             | Retain; add true parallel quota requests                                |
| PostgreSQL migrations and worker claims                                                      | Implemented, CI verified on main                                     | Retain real PostgreSQL matrix; extend persistence/recovery evidence     |
| Lease recovery and fencing of completion                                                     | Implemented but insufficiently fault-tested                          | P1: deterministic worker/storage/database failure tests                 |
| Coordinated backup and isolated restore                                                      | Documented only; automated drill missing                             | P1: bounded offline snapshot and disposable restore validation          |
| Persistent restart of complete investigation                                                 | Implemented but insufficiently verified                              | P1: compiled process restart and authenticated evidence checks          |
| Core browser workflow and accessibility                                                      | Browser state unit tests only                                        | P2: real browser CSV/handover workflow and focused accessibility checks |
| Performance evidence                                                                         | Missing                                                              | P2: bounded synthetic measurements with reproducible environment/method |
| Health, worker readiness, protected metrics and container                                    | Implemented and verified; storage explicitly not probed by readiness | P2: safe local alert exercise and incident runbook                      |
| Hosted backend, live S3, alert delivery, independent security/domain review, user usefulness | Requires external access or human validation                         | Release gates; do not imply code proves them                            |

Execution order: recovery safeguards/tests → backup/restore and process persistence → built browser journey → benchmark → final checks and evidence report. No new scheduler, identity system, distributed stack, or paid resources.

No public deployment changes are included in this milestone. Preserve original team history and attribution; record independent continuation separately in the evidence report.
