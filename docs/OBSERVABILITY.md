# Operational visibility

## Probes

- `/api/health` checks database connectivity. It is a simple diagnostic, not proof that the worker or object store is healthy.
- `/api/ready` additionally requires a live local worker with a successful queue poll in the last 90 seconds. Warming, stopped, or stale workers return 503. The production container uses this readiness endpoint.
- Readiness explicitly reports `storage: not-probed`. Use the storage inspector and a controlled upload/download probe to validate the configured storage service. Do not infer object-store availability from a database/worker check.

PostgreSQL connections have a five-second connection timeout and ten-second statement timeout. Configure probes and infrastructure timeouts to accommodate the bounded response time.

## Private metrics

Set server-side `OPERATIONS_TOKEN` to a random secret of at least 32 characters. `/api/metrics` is disabled with 404 when no token is configured. When enabled, it requires `Authorization: Bearer <token>` and returns Prometheus text exposition. Configure your monitoring collector's secret store rather than putting this token in a URL, browser, repository, or dashboard screenshot.

Metrics include completed API requests and total response duration by method/route template/status, job counts by state, oldest queued job age, worker enabled state, and last successful poll timestamp. Labels never include raw resource IDs or query strings. Request counters are process-local and reset when the application restarts; job gauges come from PostgreSQL. No latency percentiles or cluster resource utilization are inferred.

`cognexus_process_resident_memory_bytes` samples Node process RSS, including local worker threads. It is not a peak or full-container measurement. Successful new runs record `manifest.timings.computeMilliseconds`: wall time awaiting worker startup/computation, excluding queue wait and publication. The bounded benchmark reports these separately from HTTP latency and started-to-finished execution time; older manifests may omit timings.

Request logs record route templates, methods and status, never raw URLs/query strings. Internal failures record safe error codes and request IDs rather than full error objects, SQL, paths or parser input. Cookie/authorization redaction is retained as defense in depth. Keep request bodies, recovery codes, file contents, and provider credentials out of logs. Logs and metrics still require operator access control and retention; privately review old logs produced before this hardening.

## Suggested alerts to configure externally

Repeated readiness failure; increasing 5xx responses; oldest queued work exceeding the deployment's measured target; worker poll age approaching 90 seconds; failed runs; integrity findings; disk/bucket quota and backup failure. Thresholds must reflect the pilot's validated workload. Alert delivery and a hosted monitoring service have not been provisioned by the repository.

Retain a runbook linking alerts to database, worker, storage, and execution evidence. Test each alert with a controlled failure before relying on it operationally.

The [pilot runbook](PILOT_RUNBOOK.md) includes incident actions and a safe alert demonstration. `npm run restore:drill` creates a missing-object 503 only in a disposable restored environment, confirms protected metrics record it, then restores the fixture. Hosted collector/alert delivery remains unverified.
