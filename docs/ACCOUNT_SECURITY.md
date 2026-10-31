# Account security and recovery

Open **Account and security** in the workspace header to edit your display name, change your password, inspect/revoke sessions, create offline recovery codes, download account metadata, or inspect recent security activity.

![Account security interface with empty password fields](assets/account-security.jpg)

## Offline recovery

1. Sign in and confirm your current password to generate eight random, single-use recovery codes.
2. Download them to a private offline location or a suitable password manager. The plaintext set is shown only in that response and is not retrievable from the server.
3. If you forget your password, choose **Recover with a saved code** on the sign-in screen. Enter your account email, one unused code, and a new password.
4. Successful recovery invalidates the entire old code set and every existing session. Sign in again with the new password and generate a new recovery set. Password changes also invalidate all previous recovery codes.

Generating a new set invalidates all previous codes. Store codes as carefully as a password: anyone possessing one and your email can reset your password. If both password and codes are lost, there is no self-service recovery. An operator must not reset an account based only on a claimed email address. Verified-identity support remains a launch requirement for broader onboarding.

The database stores only SHA-256 hashes of 128-bit random codes. Password reset and code consumption share a transaction and identity lock, so simultaneous use consumes a code at most once. Code regeneration and password changes require the current password and a still-valid session. Login, recovery, and password changes share the user identity lock to prevent old-password login racing a reset.

## Sessions and passwords

Passwords use versioned salted scrypt (N=32768, r=8, p=3); valid legacy hashes upgrade on login. Expensive hash operations have bounded concurrency. Session cookies are HttpOnly, SameSite=Lax, and Secure in production. Only opaque-token hashes are stored. Password changes revoke old sessions/codes and issue a fresh current session. Recovery revokes all sessions/codes without automatically signing in. Individual session revocation is restricted to its owning account. At most ten sessions are retained per account. The browser clears research/account state on detected expiry and discards late responses after sign-out; previously downloaded copies cannot be revoked.

Session listings expose creation/expiration times and whether the session is current; they do not expose authentication hashes or tokens. Session IDs are administrative identifiers, not bearer credentials. Sensitive endpoints are rate limited; production deployments also require suitable edge limits.

## Scope

Offline recovery is implemented. Email ownership verification, email-based recovery, institutional SSO, MFA, account deletion, and regulated-data suitability are not established. Account export contains profile, current project membership, and account-security events; it excludes authentication secrets and research file bytes. Research evidence is exported through authorized run manifests and downloads.
