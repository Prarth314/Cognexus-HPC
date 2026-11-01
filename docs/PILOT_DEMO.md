# Five-minute synthetic research demo

Build with `npm ci && npm run build`. Run `npm start` with `NODE_ENV=development`, `PUBLIC_ORIGIN=http://localhost:3001`, and a dedicated private `DATA_DIR`; open that local URL. Never expose development registration publicly. Use no real research data or institutional identity claims.

1. Create two disposable local accounts in separate browser profiles, Researcher A and Researcher B.
2. As A, create a private project. Upload `examples/observations.csv`; inspect the preview, immutable version identifier, and checksum in Files & artifacts. Each upload is a new version, even with the same filename.
3. Configure **Dataset statistics**, select that exact input version, and choose `value`. Review pinned parameters, checksum, local CPU execution, timeout, and heap bound before submitting.
4. Inspect queued/running/completed states, measured mean **2.5**, count **4**, one missing observation, output artifact, and exported manifest. Explain that output-contract validation is not scientific validation.
5. Create a handover with a clear purpose and **zero tolerance**. Inspect implementation/input/output preflight checks, request verification as A, and show the author-rerun label and matched fields.
6. Invite B as collaborator using an email-bound private code. Accept in B's profile, open the handover, and request verification. Show the different-member label; both accounts still used the same backend, and account separation does not prove human independence.
7. Download the report and portable package. Point out input checksum, implementation fingerprint, workload version, parameters, artifacts, fixed tolerance, and comparisons. The portable package contains raw input bytes; share it only with authorized recipients. Imported authorship remains unverified.
8. As A, revoke B's access. In B's profile, attempt to reopen the project or download its artifact; current membership enforcement denies access.

For a reproducible engineering demonstration, show `npm run test:browser` (desktop/mobile UI, author rerun, reload, export, axe), `npm run restore:drill` (compiled restart, three accounts, other-member verification and restoration), and `npm run benchmark` (bounded synthetic measurements). The browser test does not claim to automate every human invitation or screen-reader interaction; the API/drill exercises those authorization boundaries separately.
