# Security

Report vulnerabilities privately to support@muneris.dk. Do not include passwords,
tokens, cookies, customer data or unreviewed logs in ordinary reports.

The CLI stores plaintext tokens in fixed private per-user application data. Protect
OS permissions and backups; use disk encryption. Unix files are created owner-only.
No password is saved. Password arguments can be visible in process listings/history.

The configured IDM host receives authentication credentials. Use only the correct
trusted account URL. HTTPS verifies certificates; no TLS bypass is implemented.
Refresh rotates token state; do not operate independent copies concurrently. Complete
recovery files contain secrets for every saved company and must remain private.
Corrupt state fails closed. Scheduled renewal before data calls may contact all
saved IDM profiles, including inactive ones. Expired token sets are removed without
refresh, even if Oracle might still accept their refresh tokens. The active key is
pinned per query; company deletion/logout do not revoke tokens at Oracle.

Local status reports expiry, not server validation. Authentication errors expose only
stages, HTTP statuses and selected known error codes, never raw response bodies or
password-reset tokens. CLI help/version are local and do not contact Oracle.

The package is unpublished. Dimension, transaction and daily-total queries are read-only
but can expose sensitive location/personnel, check, journal, extensibility, SPI payment,
commercial, employee sales/tip and payroll information. Transactions and daily totals
require one explicit location and business-date selection; no automatic cursor
advancement or multi-date/location discovery. Bodies above 16 KiB or 500 lines are saved verbatim
in private per-user response files; smaller bodies go to stdout unchanged. Neither is
redacted. Completed exports have no automatic expiry: protect and delete them when no
longer needed. Hard termination can leave private .part files. See docs/RESPONSES.md.
Do not share response files or their contents publicly. Organization-wide discovery
requires --all-locations. Dry-run omits authorization but prints request-body content.
Automatic update lookup runs after successful non-quiet data calls at most once per
24 hours; it sends no Oracle credentials, headers or customer data to npm. Notices
use stderr, never change API output/exit codes and never install anything. Explicit
`version --check` bypasses the schedule. BI is still private/unpublished; unavailable
lookup is not proof of being current. Feedback and catalog publishing are not implemented.
