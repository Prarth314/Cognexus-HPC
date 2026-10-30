# From local compute to an authorized HPC pilot

**Current state:** no institutional cluster access is available. Cognexus executes real bounded local CPU reference workloads. It does not submit Slurm jobs or own institutional compute resources.

## Obtain access before promising integration

If affiliated with Texas A&M, investigate [HPRC account applications](https://hprc.tamu.edu/apply/) and [allocation policy](https://hprc.tamu.edu/policies/allocations.html). Applications request information such as PI NetID, research summary, and required software. A student should identify an eligible faculty/research sponsor and confirm the appropriate account/allocation with HPRC. Approval of a login is not approval to expose a gateway or delegate credentials.

Another route is an eligible research collaboration through [ACCESS allocations](https://allocations.access-ci.org/allocations-policy). Undergraduate students cannot serve as allocation PI; a qualified advisor must lead the request. [Explore projects](https://allocations.access-ci.org/project-types) can support resource evaluation and code development with appropriate justification. Confirm current eligibility and resource-provider rules before applying. Access is not guaranteed.

Sources checked October 30, 2026. No application, email, account request, or purchase has been submitted on the user's behalf.

## Prepare a credible pilot proposal

- Identify a researcher with a concrete recurring computational workflow and an appropriate public or approved dataset.
- Explain the actual research objective and why cluster resources are needed; local reference demos alone do not justify a large allocation.
- Provide measured local runtime, memory, input size, output size, expected run frequency, and a conservative resource request.
- Supply the architecture, source, permission model, and a small reproducible example.
- Propose a limited pilot with named users, controlled workflows, explicit quotas, and a clear stop condition.
- Ask for an administrator-approved integration and deployment model, not a shared personal password.

## Administrator discovery checklist

Scheduler/version; approved API or SSH mechanism; per-user identities; MFA/token constraints; allocation/account/partition/QoS; network and gateway policies; software/container availability; staging/scratch retention; output transfer; cancellation; accounting; permitted automated polling; credentials and audit requirements.

Slurm provides [REST integration](https://slurm.schedmd.com/rest_quickstart.html), but an administrator must confirm that it is deployed and approved. Do not expose a scheduler endpoint or mint privileged tokens without authorization.

## Adapter implementation gate

After approved access exists, implement validate → stage → submit → reconcile → poll → cancel → collect under a provider-specific adapter. Persist the request identity and scheduler ID. Represent ambiguous submission separately; never retry it blindly. Capture per-attempt provenance and resource accounting. Keep credentials server-side and map web membership to permitted scheduler identities.

Acceptance: a real small job completes; input and output hashes match; a job cancels; expired credentials fail clearly; lost submission responses reconcile without duplicate work; service restart resumes tracking. Test in a development partition before inviting pilot users.

The local worker's automatic lease-retry logic is deliberately restricted to pure local computation. It must not be reused for external scheduler jobs.
