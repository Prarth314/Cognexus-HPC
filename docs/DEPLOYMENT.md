# Deployment and operations

## Run locally

Requires Node.js 22.15+ and npm. No Docker or API key is needed for local execution.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:3000**. Register a local account, create a project, and run Seeded Monte Carlo. For CSV statistics upload `examples/observations.csv` and select `value`: count 4, mean 2.5, median 2.5, one missing observation.

The API listens on 127.0.0.1:3001; Vite proxies `/api`. Data persists in ignored `.data/`. Keep `PUBLIC_ORIGIN` consistent with the browser URL. Never expose development registration to the Internet.

## Verify

```sh
npm run check
npm test
npm run build
npm audit --audit-level=moderate
```

The build includes server compilation and copies the computation runtime. `npm start` serves the built application at port 3001. For a local built preview set PUBLIC_ORIGIN=http://localhost:3001 and keep NODE_ENV=development. Production mode refuses startup without HTTPS origin, PostgreSQL, and an access code.

## Container deployment

Install Docker/Compose on your chosen server. Configure a TLS reverse proxy to 127.0.0.1:3001. Provide a private `.env` with:

```dotenv
PUBLIC_ORIGIN=https://research.example.org
POSTGRES_PASSWORD=<long-random-database-password>
SIGNUP_CODE=<random-operator-access-code-at-least-24-characters>
APP_REVISION=<full-git-commit-sha>
```

Use a database password consisting of URL-safe characters because Compose embeds it in a PostgreSQL connection URL. Generate secrets using an approved password manager; never commit them. Then:

```sh
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 app
```

The application runs as a non-root user with dropped Linux capabilities. PostgreSQL has no published host port. The application port is loopback-only. Secure session cookies require browser HTTPS. Configure the reverse proxy to reject invalid hosts, limit request bodies to about 11 MiB, and provide TLS and edge rate limits. Fastify does not trust arbitrary forwarded IP headers; without a configured trusted-proxy design, application IP limits are shared by clients behind the same proxy. Do not enable blanket `trustProxy`.

The provided Compose configuration is a single-server pilot deployment. It does not provision DNS, TLS, cloud accounts, high availability, or managed backups. A successful image build is not proof of a deployed service.

## Storage

Default private objects live on the `artifacts` volume. For S3-compatible storage set S3_BUCKET, S3_REGION, optional S3_ENDPOINT/S3_FORCE_PATH_STYLE, and server-side AWS credentials. If using Compose, add these variables through your private deployment override or secret manager; they are intentionally absent from tracked Compose secrets. Enforce private access, encryption, restricted IAM, and bucket retention/versioning in the provider. The adapter is unverified against a live bucket in this implementation session.

Keep one app replica until distributed rate limits and cluster-wide execution concurrency are implemented and tested. No Kubernetes is required for this topology.

## Optional AI

The [free development profile](FREE_DEVELOPMENT.md) keeps external AI disabled. Built-in deterministic evidence reports require no model, key, or external request. GEMINI_API_KEY/GEMINI_MODEL alone do not enable network calls; ALLOW_EXTERNAL_AI defaults to false and the tracked Compose profile fixes it to false. Do not enable external billable services under the current requirement.

The optional provider integration remains isolated server-side for a future explicitly authorized configuration change. If enabled later, it would send the question, parameters, calculated result, artifact names/checksums, and run identifier to the provider. It does not receive raw file bytes and cannot submit jobs. No provider has been enabled or validated in this session.

## Account operations

Production registration requires the shared operator-issued access code. This is for a restricted pilot, not institutional verified identity. Invitations are private one-time codes bound to the registered account email; email ownership itself is not verified. Offline single-use recovery codes, password changes, session revocation, and account-metadata export are available in Account and security. See [account operations](ACCOUNT_SECURITY.md). Email delivery/verification, account deletion, and institutional SSO remain broader-onboarding requirements. Rotate the registration code if disclosed.

## Health, logs, and recovery

- `/api/health` checks database connectivity. It does not prove object-store availability, worker health, or cluster connectivity.
- `/api/ready` also checks local worker polling freshness and is used by the production container. It does not probe storage. Configure private Prometheus metrics with `OPERATIONS_TOKEN`; see [observability](OBSERVABILITY.md).
- Logs are structured JSON. Never add passwords, session tokens, provider keys, or raw research files to logs. Restrict log access and retention.
- Worker leases expire after 90 seconds; unfinished pure local work retries up to three total attempts. External scheduler execution is not implemented.
- Alert on repeated 5xx responses, failed jobs, old queued jobs, expired leases, storage errors, disk use, and backup failures. External alert delivery is an operator integration, not configured here.

## Backup and restore drill

Pause ingress and stop the application before taking a consistent pilot snapshot. Keep PostgreSQL running for `pg_dump`.

1. Stop `app`; back up the database with `pg_dump` using a secure operator session.
2. Back up the private artifact volume or bucket contents and record the matching database backup and application revision.
3. Encrypt backups, restrict access, and copy them off the application host.
4. Restore into an isolated environment using the same application revision and a compatible PostgreSQL version.
5. Restore artifact objects, start the application, and verify authenticated downloads, checksums, project isolation, and recovery of expired local jobs.
6. Record achieved recovery time and data-loss window. Do not claim recovery objectives until this drill has succeeded.

Do not run `docker compose down -v` on a deployment with data to preserve. Migrations are versioned but automatic downgrades are not supplied: roll back application code only when compatible with the current schema; otherwise restore a tested matching backup.

## Institutional launch gate

Authorized compute integration and scheduler identity; domain-specific workflow validation; verified identity; permanent data deletion/retention policy; scheduled and reviewed storage inspection; external monitoring/alerts; restore drill; load test; independent security review; pilot research users. Offline account recovery, reversible archiving, and read-only integrity inspection are implemented. The remaining gates require infrastructure access and operational evidence outside the source repository.
