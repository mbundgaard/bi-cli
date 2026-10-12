# Payment dimensions

Status: implemented locally with offline tests. Authorized status-only live probes were
permission-rejected; successful data behavior remains unverified. See [guide](../docs/PAYMENT-DIMENSIONS.md).

Contract: Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Reviewed both operations, payloads, response schemas/arrays and examples. Public
request-only subset: tests/fixtures/payment-dimensions-contract.json.

- getPaymentAccountHolderDimensions: three optional fields, no locRef/date. Require
  explicit --organization-wide even with filters/input; acknowledgement is not sent.
- getPaymentAccountDimensions: required locRef plus three optional fields; no all-location
  or organization-wide mode.
- Common fields: include/searchCriteria maximum 2000, applicationName maximum 128.
- Requires Oracle MICROS Payment Cloud Service (20.1.11+), not SPI or STS.

Reject scope conflicts, dates/cursors/native RVC before renewal; preserve other unknown
fields and exact numbers. No dates, discovery, implicit account joins or filter fallback.
Use executeQuery for pinned identity, one input read, renewal and verbatim delivery.
No payment/account writes, status labeling, verification/compliance inference or redaction.
Protect account/holder codes/names, contacts/addresses and statement names.

Offline acceptance: both schemas/routes, explicit scope/no JSON acknowledgement bypass,
limits/selectors, exact numbers, unchanged codes/unknown statuses, JSON/file/stdin,
renewal, company pinning, quiet/notices, all HTTP outcomes, complete large/error exports,
no retries/redirects and installed package. Both routes get 128 MiB plain/compressed tests.
Two authorized status-only live probes (location accounts, organization holders) each
returned HTTP 400/Oracle 33108, documented as permission denial. Preserve actual HTTP
status/error/exit 11 despite the status guide listing 403. No records, retries, scope
expansion or further input/filter probes. Successful data/filter/projection behavior
remains unverified; administrator access review is required before an authorized retest.
