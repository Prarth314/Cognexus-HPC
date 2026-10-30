# Production roadmap and release gates

This is an implementation checklist, not a claim that every capability is available.

1. **Feasibility:** obtain authorized cluster access; prove staging, submission, cancellation, identity mapping, and output retrieval.
2. **Working alpha:** accounts, persistent projects, enforced roles, private uploads, real bounded workloads, durable jobs, reproducible manifests.
3. **Research pilot:** real researcher and reference dataset; invitations, audit history, schema/units validation, comparison, grounded AI, portable exports.
4. **Production release:** isolation and failure tests; PostgreSQL and private storage; recoverable execution; quotas; monitoring; backup restoration; controlled releases.
5. **Showcase:** accessible interface, isolated demonstration, measured pilot results, architecture, reproducibility example, technical case study.
6. **Expansion:** validated workflows, approved cluster adapters, institutional identity, organization administration, allocation management as adoption requires.

## Required properties

- Process execution and scientific validity are separate states.
- Reconcile ambiguous scheduler submissions before retrying.
- Pin input checksums, parameters, workflow version, outputs, and environment for each run.
- Enforce authorization for every project resource.
- AI must reference evidence, remain optional, and never execute experiments autonomously.
- Isolate public demonstrations from institutional credentials and private data.
- Measure concurrency, latency, status freshness, recovery, retention, and data-loss objectives with the pilot owner.

## External launch dependencies

Authorized cluster endpoint and identity model; hosting and budget; domain/TLS; verified identity and email delivery; representative research data and domain validation; independent security review; real pilot users; measured recovery/load tests. Source changes alone cannot establish these.
