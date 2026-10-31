# Vercel web deployment

The reported “Request failed” screen came from Vercel. The previous deployment built the Vite frontend but provided no `/api` implementation. Uploading frontend assets does not start the persistent Fastify API, PostgreSQL database or computational worker.

The repository now supplies a same-origin API gateway and explicit deployment routing. Without a configured backend it returns a private, noncached `503 BACKEND_NOT_CONFIGURED` response and the page explains the missing research service. It never creates a temporary database or pretends that research work was saved. Local development continues to use its direct Vite-to-API proxy.

## Connect an existing backend

1. Run the documented [production backend](DEPLOYMENT.md) on an existing authorized server with PostgreSQL and private persistent artifacts. This repository does not provision or pay for that server. Follow the account/database migration instructions for an existing deployment.
2. Set the backend's `PUBLIC_ORIGIN` to the exact HTTPS origin of the production Vercel website. Configure TLS at the backend as well. Keep one backend replica until distributed limits and worker concurrency are validated.
3. In the Vercel project's **Production** environment set `COGNEXUS_BACKEND_ORIGIN` to the backend's bare HTTPS origin, for example `https://research-service.example.org`. Do not include credentials, `/api`, query strings or fragments. The gateway preserves the incoming `/api` path itself. This must be a separate backend origin, not the Vercel site's own URL.
4. Redeploy after changing the environment variable. Verify `/api/health`, `/api/ready`, and `/api/session` through the Vercel hostname before attempting registration. Then verify an operator-enrolled account, a small upload/download, a real completed run, artifact checksum, authorization isolation, logout and recovery.
5. Keep preview deployments disconnected by default. If previews need research access, use a separate preview backend/database/artifact store and its exact preview origin. Do not point arbitrary preview deployments at a production database or broaden backend CORS/origin checks to make previews work.

No `VITE_` secret or database URL belongs in the browser bundle. Database, enrollment, object-store and optional metrics credentials stay on the backend. The gateway forwards host-only session cookies, request verification, Origin and idempotency headers to the fixed configured origin; it does not trust client-supplied forwarding headers, follow backend redirects or cache API responses. It does not proxy arbitrary client-supplied destinations.

## Limits and cost requirement

Vercel Functions have a documented 4.5 MB request/response payload limit. The gateway caps each API payload at 4 MiB and allows uploads up to 3 MiB to leave multipart overhead. The direct backend still supports its original 10 MiB upload limit; larger existing downloads must use the direct authorized backend deployment. The frontend follows the gateway's declared upload limit.

The gateway has a bounded 20-second upstream timeout and a 30-second function duration. Computational execution remains on the persistent backend worker, so the gateway does not need to keep a serverless invocation alive for a job. API limits behind a proxy also require an agreed trusted-client/edge-rate-limit design; never enable blanket trust of forwarded headers.

Code, local development and public-repository CI require no paid services. A Vercel deployment alone does not supply a persistent research backend. No paid resource, trial, domain, database subscription or external AI provider is created or enabled by these changes. Check the existing Vercel plan/usage and choose an institution-provided or independently verified zero-cost backend before public operation; unlimited always-on hosting is not promised.

## Current verification boundary

Local gateway tests cover missing configuration, HTTPS/origin validation, path escapes, cookie/CSRF forwarding, private caching, redirects, payload limits and sanitized failures. GitHub runs production-container startup with a restricted PostgreSQL role. The user authorized access to the owning Vercel team; project inspection confirmed no configured environment variables, and production `/api/session` returned 404 before the routing fix. End-to-end hosted research operations still require a real persistent backend URL. Until those are configured and verified, the hosted site is a deployment that needs configuration, not a working production research service.

[Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [function limits](https://vercel.com/docs/functions/limitations), [routing and rewrites](https://vercel.com/docs/routing/rewrites).
