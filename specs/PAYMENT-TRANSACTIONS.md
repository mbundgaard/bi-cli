# Payment transactions

Status: all five implemented locally and offline-tested; no live calls or publication.
See [guide](../docs/PAYMENT-TRANSACTIONS.md).

Oracle Swagger 2025.09.22 SHA-256:
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Reviewed all five request schemas, operation descriptions and recursively referenced
response schemas. Public request subset: tests/fixtures/payment-transactions-contract.json.

Contracts: settlements locRef/stlmtDt; transactions locRef/busDt; payouts locRef/bookingDt;
payout-summary acctCode/payoutDt; chargebacks locRef/recordDt. Only transactions/summary
allow changedSinceUTC. Common include/searchCriteria/applicationName optional. No date
aliases, scope inference, account discovery, native RVC or automatic cursor behavior.

Use exact account-code strings; preserve unknown fields/numbers. Dedicated validation
must reject conflicting scope/date/cursor fields before shared executeQuery renewal.
All routes are read-only reporting; no payment/refund/payout/dispute mutations or
financial reconciliation. Preserve type discrepancies, missing values and status relations.
Protect identifiers, card metadata, fees/amounts/tips and dispute details.

Offline acceptance: all routes/fields, required scope/dates, invalid selectors/limits,
calendar/cursor syntax, precision, JSON/file/stdin, one input read across renewal,
company pinning, quiet/notices, HTTP/error delivery, no retry/redirect, all five 128 MiB
plain/compressed streams and installed-package help/inventory/previews.

No live transaction tests; previous dimension 33108 denial is not evidence of transaction
endpoint permissions. Obtain date-basis/account scope and resolve service/access questions
before authorized live validation. No release or publication implied by endpoint coverage.
