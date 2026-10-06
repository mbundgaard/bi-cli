# Security

Report vulnerabilities privately to support@muneris.dk. Do not include passwords,
tokens, cookies, customer data or unreviewed logs in ordinary reports.

The CLI stores plaintext tokens in fixed private per-user application data. Protect
OS permissions and backups; use disk encryption. Unix files are created owner-only.
No password is saved. Password arguments can be visible in process listings/history.

The configured IDM host receives authentication credentials. Use only the correct
trusted account URL. HTTPS verifies certificates; no TLS bypass is implemented.
Refresh rotates token state; do not operate independent copies concurrently. Complete
recovery files contain secrets and must remain private. Corrupt state fails closed.

Local status reports expiry, not server validation. Authentication errors expose only
stages, HTTP statuses and selected known error codes, never raw response bodies or
password-reset tokens. CLI help/version are local and do not contact Oracle.

The current package is an unpublished authentication scaffold. Data queries, feedback
submission, update discovery and catalog publishing are not implemented.
