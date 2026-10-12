# Payment transactions

Five read-only reporting commands are implemented and offline-tested. These do not
execute payments, refunds, cancellations, settlements, payouts or dispute actions.
Live payment-transaction behavior remains unverified. Payment Cloud reporting is
separate from SPI metadata and STS, even where response fields refer to SPI identifiers.

## Scope and dates

| Command under `bi payment-transactions` | Operation | Required scope | Required date | Cursor | Version |
|---|---|---|---|---|---|
| `settlements list` | `getPaymentSettlements` | locRef | stlmtDt / --settlement-date | None | 20.1.11+ |
| `transactions list` | `getPaymentTransactions` | locRef | busDt / --business-date | changedSinceUTC | 20.1.11+ |
| `payouts list` | `getPaymentPayouts` | locRef | bookingDt / --booking-date | None | 20.1.11+ |
| `payout-summary list` | `getPaymentPayoutSummary` | acctCode | payoutDt / --payout-date | changedSinceUTC | 20.2+ |
| `chargebacks list` | `getPaymentChargebacks` | locRef | recordDt / --record-date | None | 20.1.11+ |

All are POST `/bi/v1/{orgIdentifier}/{operation}`. Location-scoped requests require a
nonblank locRef string, maximum 99 characters. Payout summary instead requires exact
acctCode via `--account-code`; preserve case/leading zeros. Oracle declares no account-code
maximum here; the CLI does not invent one. locRef is rejected for summary, and acctCode
is rejected as a native field for the other four routes. No account discovery or fallback.
Location-only permission is not permission to query an account-scoped payout summary.

Dates are actual YYYY-MM-DD calendar dates with no defaults. Business, settlement,
booking, payout and record dates are not interchangeable. Ask which date basis matches
the user's task; do not copy a business date to all five selectors. No date ranges,
open/closed/posted/effective date selectors, all-location mode, native RVC or transSinceUTC.
Returned busDt values under settlements/payouts/chargebacks do not redefine request scope.

All routes also accept optional nonblank include/searchCriteria (maximum 2000) and
applicationName (maximum 128). Filters are forwarded unchanged, never inferred or removed
after rejection. Projections replace the default field set, not add to it. Keep identifiers
and nesting needed by consumers; do not assume nested predicates prune sibling records.

```sh
bi payment-transactions transactions list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi payment-transactions settlements list --loc-ref "<location-reference>" --settlement-date "<YYYY-MM-DD>" --dry-run
bi payment-transactions payouts list --loc-ref "<location-reference>" --booking-date "<YYYY-MM-DD>" --dry-run
bi payment-transactions payout-summary list --account-code "<account-code>" --payout-date "<YYYY-MM-DD>" --dry-run
bi payment-transactions chargebacks list --loc-ref "<location-reference>" --record-date "<YYYY-MM-DD>" --dry-run
```

Replace placeholders with authorized scope/dates; examples are not live authorization.
`--json` and `--file` (`-` for stdin) use exact Oracle field names. Flags override matching
fields only; unknown fields and exact numbers survive without endorsement as selectors.
Input is read once before renewal. `--quiet` suppresses diagnostics/update checks, not
response data or errors. `--timeout` is seconds per request, default 30, greater than zero
and at most 300. Help/local/dry-run stay offline; preview omits auth, not supplied IDs.

## Cursors and response semantics

Only transactions and payout-summary accept `--changed-since-utc`. Local syntax is
`YYYY-MM-DDTHH:mm:ss[.fraction][Z]`, with actual calendar/clock validation. Numeric offsets
are rejected, accepted spelling is unchanged and date selection is still required.
No conversion, Z stripping, polling, cursor persistence/advancement, overlap elimination
or completeness guarantee. Other BI endpoints rejected Z; these routes' deployment
acceptance, precision and inclusivity remain unverified.

Documented response nesting:

- Settlements: accounts[].revenueCenters[].businessDates[].settlements[].
- Transactions: accounts[].revenueCenters[].transactions[].
- Payouts: accounts[].revenueCenters[].businessDates[].payouts[].payoutDetails[].
- Payout summary: payouts[], with root acctCode/payoutDt, not location nesting.
- Chargebacks: accounts[].revenueCenters[].chargebacks[].

Keep all response bytes, unknown fields/statuses, strings, nulls and missing values.
`pymtID` and `pymtDtlID` (20.2+) document transaction/status relationships; do not join or
deduplicate automatically. `currStatus` guidance for chargebacks describes downstream
consumer behavior; the CLI never modifies older records. No finality or ledger inference.

Oracle has response-type discrepancies: transactions pmntType schema says boolean while
its description lists PAY/VOID/CANCEL/REFUND/ADJUSTMENT. cardPresentFlag has integer schema
but describes true/false behavior. Summary payoutAmt and several fee/cancel fields are
strings, unlike other numeric amounts. Never coerce or repair these differences. Keep
UTC/local, PSP/POS, posting and settlement times distinct; no timezone/date conversions.

Treat account/PSP/merchant/payment/check/employee identifiers, cardBin/cardAlias/authCode,
amounts, fees, tips and dispute details as sensitive. Masked card data is not public data.
Use narrow metadata projections for approved tests and never publish unreviewed exports.
No automatic redaction, financial reconciliation, fee netting, currency conversion,
status labeling, payment eligibility or compliance conclusions.

## Validation and delivery

All five routes reuse executeQuery: pin the selected BI company, validate/read input
once before renewal, rebuild against the same company, use ID tokens and preserve
verbatim delivery. No STS credentials, data retries, redirects or duplicated auth lifecycle.

[Response delivery](RESPONSES.md): at most 16 KiB AND 500 lines remains exact stdout;
above either threshold the complete body is privately exported and a compact receipt
is printed. HTTP errors retain exit codes. No parsing, redaction or truncation; exports
persist until deleted. Update notices are advisory, never automatic installation.

Synthetic coverage verifies all schemas/routes, five date bases, account versus location
scope, wrong selectors before renewal, cursor validation, exact numbers, string amounts,
JSON/file/stdin, flag precedence, one input read, pinned identity, quiet/notices, HTTP
errors/no retries/redirects and 128 MiB plain/compressed streams through every route.
Installed-package checks cover all five help entries, inventory and isolated dry-runs.

No live payment-transaction calls have been made. Prior payment-dimension status-only
probes returned HTTP 400/33108 (documented permission denial); that is not proof of these
five routes' permissions or service configuration. Four operation descriptions explicitly
require Oracle MICROS Payment Cloud Service; payout summary is documented in the same
payment reporting family from 20.2. Confirm deployment/service access and exact date/account
scope before authorized live validation. Do not auto-retest denied dimensions.

Reference: [Oracle payment transactions](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getpaymenttransactions-post.html).
