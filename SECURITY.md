# Security

Do not open public issues containing credentials, private data, exploit payloads, or sensitive logs. Use GitHub private vulnerability reporting when enabled, or contact a maintainer privately to arrange a reporting channel.

Keep credentials on the server. Treat file content as untrusted, enforce authorization at every resource boundary, and run only approved bounded templates. Embedded-database mode is for development; use the production configuration for deployment.

This project is undergoing production hardening. A passing build is not an independent security assessment or authorization to process regulated data.

See the [security review and remediation register](docs/SECURITY_REVIEW.md) for findings, fixes, data exposure boundaries, test evidence and remaining operator/deployment requirements. Apply the [upgrade instructions](docs/DEPLOYMENT.md) before updating an existing production database. Never publish a development server, private data directory, backup or environment file through GitHub Pages/static hosting.
