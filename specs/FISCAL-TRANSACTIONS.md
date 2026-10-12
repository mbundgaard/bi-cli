# Fiscal transactions

Status: implemented locally with offline and scoped live functionality checks.
See [command guide](../docs/FISCAL-TRANSACTIONS.md). No reconciliation or publication.

Reviewed all three operation descriptions/examples, request schemas and referenced
response definitions in Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Public request-only fixture: tests/fixtures/fiscal-contract.json. No tenant payloads.

Operations: getFiscalInvoiceData, getFiscalTotalData, getFiscalInvoiceControlData.
All use requestPayload: locRef/busDt required, searchCriteria/include/applicationName
optional. Reuse validateLocationDateBody and executeQuery with pinned BI company,
one input read, renewal and verbatim response handling. Unknown request fields/exact
numbers survive. No native RVC, invoice, fiscal-date, open/closed-date or cursor flags.

No invoice/sequence/lock mutations, financial calculations or compliance conclusions.
Do not infer country semantics, parse embedded json strings, normalize missing fields,
rename fcrBusinessDate/example fcrBusinessDt or transform response dates into selectors.
Protect customer references, fiscalKey and country-specific blobs.

Offline acceptance: all routes/fields, limits, invalid input before renewal, exact
JSON/file/stdin, rotation, pinned identity, quiet/notices, opaque response fields/blobs,
large/error exports, no retries/redirects and installed-package checks.

Scoped live functionality: 11 probes, all intended reads succeeded; malformed syntax
returned 400/33214. Fiscal totals contained workstation records and its RVC-filtered request
succeeded. With only one baseline RVC, exclusion of other RVCs was not established. Invoices and invoice controls were empty. No financial amounts, customer refs,
fiscal keys or blobs were requested. Populated invoice/control and nested-filter
semantics remain unverified; no scope expansion to find records.
