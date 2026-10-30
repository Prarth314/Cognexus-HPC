# Free development profile

The user's requirement is zero paid development services. Do not create paid cloud resources, enable billable APIs, buy domains, start payment-backed trials, or introduce a required subscription.

## Default local setup

Run `npm ci` and `npm run dev` on an existing machine with Node.js. No Docker subscription, credit card, database account, cloud bucket, email service, AI account, or cluster allocation is required. Development uses persisted embedded PostgreSQL, private local disk, and real bounded CPU reference workloads. Free built-in evidence reports explain recorded statistics without an AI model or external network request.

`ALLOW_EXTERNAL_AI` defaults to false. Provider keys alone cannot turn on external AI calls. The tracked Compose profile explicitly keeps external AI disabled. External integration would require a deliberate configuration change and a new decision outside this free profile; no agent should make that change under the current requirement.

## CI

This public repository uses standard Linux GitHub-hosted runners. GitHub documents standard runner usage for public repositories as free: [runner documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job). CI intentionally does not upload build artifacts or create npm caches, reducing persistent Actions storage usage. Docker builds are tested without pushing images to a registry. Re-evaluate billing before changing repository visibility, runner class, or storage behavior.

## Deployment and HPC

Local development is supported now. A publicly available, always-on production service is not promised at zero cost: persistent storage, infrastructure, and availability need an actual hosting arrangement. No hosting account has been selected or provisioned. Do not silently substitute a paid service or a trial that later charges.

For institutional HPC, pursue an approved research allocation and integration. Eligibility, quotas, and permitted gateway usage must be established with the provider. No paid compute rental is part of development.

Keep the platform portable so an institution-provided server or an explicitly reviewed free deployment target can be adopted later without changing data contracts.
