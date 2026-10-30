# API reference

All routes use `/api`. Authentication uses an HttpOnly cookie. State-changing requests require `X-Cognexus-Request: 1`; browser Origin must match PUBLIC_ORIGIN. JSON requests use `Content-Type: application/json`. No bearer token is exposed to the browser.

Errors return `{ error, requestId? }`; validation errors include field details. Foreign project resources return 404. Insufficient roles return 403. Limits return 429. Lists are currently bounded, not paginated.

| Method     | Route                           | Access / purpose                                                   |
| ---------- | ------------------------------- | ------------------------------------------------------------------ |
| GET        | `/health`                       | Database health, version, execution mode                           |
| GET        | `/session`                      | Current user, registration/AI availability                         |
| POST       | `/auth/register`                | `{name,email,password,signupCode?}`; minimum 12-character password |
| POST       | `/auth/login`                   | `{email,password}`                                                 |
| POST       | `/auth/logout`                  | Revoke current database session                                    |
| GET        | `/workflows`                    | Authenticated reference workflow contracts                         |
| GET / POST | `/projects`                     | List memberships / create `{name,description,domain}`              |
| PATCH      | `/projects/:id`                 | Owner; update project metadata                                     |
| GET        | `/projects/:id/members`         | Project members                                                    |
| PATCH      | `/projects/:id/members/:userId` | Owner; `{role}`                                                    |
| DELETE     | `/projects/:id/members/:userId` | Owner; remove access, protect last owner                           |
| POST       | `/projects/:id/invitations`     | Owner; `{email,role}`; returns one-time private token              |
| POST       | `/invitations/accept`           | Authenticated recipient; `{token}`                                 |
| GET        | `/projects/:id/audit`           | Last 100 project audit events                                      |
| GET / POST | `/projects/:id/files`           | List files / multipart upload with one `file` part                 |
| GET        | `/files/:id/download`           | Authorized integrity-verified attachment                           |
| GET        | `/files/:id/preview`            | Authorized bounded CSV/text/JSON/log/Markdown preview              |
| GET / POST | `/projects/:id/runs`            | List last 200 / submit validated workload                          |
| GET        | `/runs/:id`                     | Current run state and recorded result                              |
| POST       | `/runs/:id/cancel`              | Collaborator/owner; cancel queued/running run                      |
| GET        | `/runs/:id/manifest`            | Execution manifest with input/output checksums                     |
| GET / POST | `/runs/:id/analyses`            | Read explanations / ask `{question}` with configured AI            |

## Submission

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

Text previews are limited to 64,000 bytes. CSV previews return the header and up to 20 data rows. Unsupported types require download. AI receives the question, parameters, calculated result, artifact names/checksums, and run identifier; no raw upload bytes are sent by this release. AI answers can be wrong and must be reviewed against their saved evidence.
