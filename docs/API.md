# API reference

All routes use `/api`. Authentication uses an HttpOnly cookie. State-changing requests require `X-Cognexus-Request: 1`; browser Origin must match PUBLIC_ORIGIN. JSON requests use `Content-Type: application/json`. No bearer token is exposed to the browser.

The operator-only `/metrics` endpoint is an exception to browser cookie authentication: when configured it requires the server's operations bearer token. `/ready` reports database connectivity and worker freshness. See [operational endpoints](OBSERVABILITY.md).

Errors return `{ error, requestId? }`; validation errors include field details. Foreign project resources return 404. Insufficient roles return 403. Limits return 429. Lists are currently bounded, not paginated.

| Method     | Route                                     | Access / purpose                                                   |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------ |
| GET        | `/health`                                 | Database health, version, execution mode                           |
| GET        | `/session`                                | Current user, registration/AI availability                         |
| POST       | `/auth/register`                          | `{name,email,password,signupCode?}`; minimum 12-character password |
| POST       | `/auth/login`                             | `{email,password}`                                                 |
| POST       | `/auth/logout`                            | Revoke current database session                                    |
| GET        | `/workflows`                              | Authenticated reference workflow contracts                         |
| GET / POST | `/projects`                               | List memberships / create `{name,description,domain}`              |
| PATCH      | `/projects/:id`                           | Owner; update project metadata                                     |
| GET        | `/projects/:id/members`                   | Project members                                                    |
| PATCH      | `/projects/:id/members/:userId`           | Owner; `{role}`                                                    |
| DELETE     | `/projects/:id/members/:userId`           | Owner; remove access, protect last owner                           |
| POST       | `/projects/:id/invitations`               | Owner; `{email,role}`; returns one-time private token              |
| POST       | `/invitations/accept`                     | Authenticated recipient; `{token}`                                 |
| GET        | `/projects/:id/invitations`               | Owner; pending recipient/role/expiry metadata without secrets      |
| DELETE     | `/projects/:id/invitations/:invitationId` | Owner; revoke a pending invitation                                 |
| GET        | `/projects/:id/audit`                     | Last 100 project audit events                                      |
| GET / POST | `/projects/:id/files`                     | List files / multipart upload with one `file` part                 |
| GET        | `/files/:id/download`                     | Authorized integrity-verified attachment                           |
| GET        | `/files/:id/preview`                      | Authorized bounded CSV/text/JSON/log/Markdown preview              |
| GET / POST | `/projects/:id/runs`                      | List last 200 / submit validated workload                          |
| GET        | `/runs/:id`                               | Current run state and recorded result                              |
| POST       | `/runs/:id/cancel`                        | Collaborator/owner; cancel queued/running run                      |
| GET        | `/runs/:id/manifest`                      | Execution manifest with input/output checksums                     |
| GET / POST | `/runs/:id/analyses`                      | Read explanations / ask `{question}` with configured AI            |

## Account and lifecycle endpoints

| Method | Route                             | Purpose                                                                        |
| ------ | --------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/account/security`               | Current account sessions, unused-code count, and security activity             |
| PATCH  | `/account/profile`                | Save `{name}`; email remains unchanged                                         |
| POST   | `/account/password`               | `{currentPassword,newPassword}`; revoke old sessions and rotate current cookie |
| POST   | `/account/recovery-codes`         | `{currentPassword}`; replace code set and return eight plaintext codes once    |
| POST   | `/auth/recover`                   | `{email,code,newPassword}`; consume code and revoke all sessions               |
| DELETE | `/account/sessions/:sessionId`    | Revoke an owned session                                                        |
| POST   | `/account/sessions/revoke-others` | `{currentPassword}`; preserve only current session                             |
| GET    | `/account/export`                 | Account metadata download, excluding authentication secrets                    |
| POST   | `/projects/:id/archive`           | Owner; `{archived:true}` to archive, `false` to restore                        |

Archived projects preserve authorized read access and membership administration but reject new research and invitations. Active jobs prevent archiving. All mutations retain the normal CSRF/origin requirements. See [account security](ACCOUNT_SECURITY.md) and [lifecycle rules](PROJECT_LIFECYCLE.md).

## Submission details

Include an `Idempotency-Key` header (8–128 letters/digits/underscore/hyphen). Repeating the same key and body returns the same logical run; reusing the key with different parameters returns 409.

```json
{ "workflow": "monte-carlo-pi", "parameters": { "samples": 100000, "seed": 42 } }
```

```json
{
  "workflow": "csv-summary",
  "inputFileId": "<project-file-uuid>",
  "parameters": { "column": "value" }
}
```

Submission pins input metadata/checksum and execution configuration. The worker rejects changed input bytes. Statuses: queued, running, succeeded, failed, cancelled. `validation_status=valid` means the reference output contract passed, not that domain science was validated.

## Preview and AI data boundaries

`GET /runs/:id/evidence-report` returns a free, deterministic explanation of a completed run's recorded measurements. It enforces current project membership and includes a report version, exact evidence, and `usesAi:false`. It makes no external request and does not answer arbitrary scientific questions.

External `/analyses` requests are disabled unless deliberately enabled outside the default free-development profile. Merely setting provider credentials does not enable them.

Text previews are limited to 64,000 bytes. CSV previews return the header and up to 20 data rows. Unsupported types require download. AI receives the question, parameters, calculated result, artifact names/checksums, and run identifier; no raw upload bytes are sent by this release. AI answers can be wrong and must be reviewed against their saved evidence.
