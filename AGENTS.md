# Project working agreements

- Development must remain free. Do not provision paid resources, start paid trials, enable external billable APIs, purchase domains, or add required subscriptions. The default runtime must work locally with Node/npm, embedded PostgreSQL, private disk, and bounded CPU workloads. External AI stays disabled by default, even if credentials happen to exist.
- Preserve original team attribution and Git history. Never force-push a shared branch or rewrite collaborators' commits.
- Work in small, cohesive, testable commits. Push milestones and merge into main only after relevant checks pass and the session authorizes merging. Do not inflate commit counts with meaningless changes.
- Run `npm run format:check`, `npm run check`, `npm test`, and the production build for source changes. Validate packaged-runtime changes with `npm run smoke`. Do not repeat unrelated checks after documentation-only edits.
- Keep secrets, recovery codes, research data, local databases, and generated runtime output out of Git and logs. Screenshots must not contain real credentials or private research data.
- Do not describe local reference computations as institutional HPC or a validated scientific solver. Document unverified providers and external release gates honestly.
- Prefer reversible lifecycle controls and read-only storage inspection. Never automatically delete research objects based on a live inventory alone.
