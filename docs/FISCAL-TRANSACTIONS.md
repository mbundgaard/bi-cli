# Fiscal transactions

Three read-only fiscal endpoints are implemented and offline-tested against Oracle
Swagger 2025.09.22, with scoped live functionality checks. These read existing records;
they do not issue/cancel/sign invoices, reserve numbers, change sequences, acquire/release
locks, submit tax reports or make fiscal compliance decisions.

## Commands and fields

| Command | POST operation | RVC child array |
|---|---|---|
| `bi fiscal-transactions invoices list` | `getFiscalInvoiceData` | `invoiceData` |
| `bi fiscal-transactions totals list` | `getFiscalTotalData` | `totalData` |
| `bi fiscal-transactions invoice-controls list` | `getFiscalInvoiceControlData` | `invoiceControlData` |

Paths are `/bi/v1/{orgIdentifier}/{operation}`. Fiscal totals are not POS daily
aggregations; invoice controls are not POS control daily totals or locking operations.

All three share these documented request fields:

| Oracle field | CLI flag | Requirement |
|---|---|---|
| `locRef` | `--loc-ref` | Required nonblank string, maximum 99 characters |
| `busDt` | `--business-date` | Required actual calendar date, `YYYY-MM-DD` |
| `searchCriteria` | `--search-criteria` | Optional nonblank string, maximum 2000 |
| `include` | `--include` | Optional nonblank string, maximum 2000 |
| `applicationName` | `--application-name` | Optional nonblank string, maximum 128 (20.1.10+) |

No native RVC, workstation, invoice-number, invoice-type/status, fiscal-date,
open/closed-date or since-cursor selector is documented. No date/location defaults,
all-location mode, date range, discovery or hidden filters. Known unsupported
control/transaction selectors are rejected locally. Other unknown JSON fields survive
without being endorsed as supported selectors.

`--json` or `--file` (`-` for stdin) accepts Oracle field names. Flags override matching
fields only. Input is read once; exact numbers and unknown fields survive. `--dry-run`
is offline and omits authorization; `--quiet` suppresses diagnostics/update notices, not
data. `--timeout` is positive seconds per network request, default 30, maximum 300.

```sh
bi fiscal-transactions invoices list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi fiscal-transactions totals list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.totalData.wsNum"
bi fiscal-transactions invoice-controls list --file request.json --dry-run
```

Replace placeholders with authorized values. An explicit RVC filter can use
`--search-criteria "where equals(revenueCenters.rvcNum,<rvc-number>)"`. Filters are not
rewritten, translated from shorthand or dropped on rejection. Projection replaces the
default field set; preserve identifiers, relationships and metadata needed by consumers.
Do not infer nested-child pruning from a parent/RVC filter or another endpoint.

## Country-specific interpretation and privacy

Treat fiscal records as sensitive. They can contain customer references, invoice/device
identifiers, fiscal keys, numbered information fields, amounts and embedded country-specific
payloads. Keep live probes narrowly projected and do not publish unreviewed exports.

- `invoiceType`, `invoiceStatus`, document/data types and numbered subtotal/tax/info
  fields have country/transaction-specific meaning. No local labels, tax calculations,
  totals reconciliation or compliance/finality/sequence-completeness inference.
- `lockedBy` and invoice-control status are returned metadata, not lock ownership or
  permission to perform an action. No acquire/release operation is implemented.
- The `json` response field is documented as an object (20.1.12+), while examples show
  a string. Preserve either spelling/representation unchanged; never parse an embedded
  JSON string into a new object, reserialize or repair malformed data.
- Invoice schema `fcrBusinessDate` differs from example `fcrBusinessDt`; fiscal totals
  use `fcrBusDt`. This is a documentation discrepancy, not a live-confirmed mapping.
  The CLI does not alias these fields. Preserve actual returned names and dates.
- Returned `opnBusDt`, device dates, extra dates and `resolutionDt` are not alternate
  request selectors. Do not overwrite them with the requested `busDt` or convert timezones.
- `customerDataNum` is documented from 20.1.10. Missing/null/zero fields stay as returned.

## Scoped live observations

At one authorized location/date, all three routes returned HTTP 200 with narrow
RVC/workstation projections. Fiscal total data included workstation records; its RVC
filtered request returned the selected RVC. The baseline had only one RVC, so exclusion
of nonmatching RVCs was not established. Invoice and invoice-control results were empty.

JSON/file/stdin, applicationName, minimal projections and quiet output worked. Malformed
search syntax returned HTTP 400/code 33214 and exit 11, without broader fallback.
No customer references, fiscal keys, country blobs or financial amounts were requested.

These checks do not establish populated invoice/control behavior, nested filtering,
all field names, numerical correctness, tax compliance or complete fiscal coverage.
Empty data does not prove fiscalization is disabled or correctly configured. No other
dates/locations were queried to find populated records.

## Delivery and tests

The shared five-field validator runs before due company renewal. Execution pins the
active company, uses its BI ID token and shares the existing update-notice lifecycle.
No STS credentials, data retries, redirects, TLS bypass or automatic installation.

[Response delivery](RESPONSES.md) is verbatim: at most 16 KiB **and** 500 lines stays
inline; exceeding either limit saves the complete private body and emits a compact file
receipt. This includes API errors, with preserved exit codes. No response parsing,
formatting, redaction or truncation. Files remain until explicitly deleted.

Synthetic tests cover all three routes/five request fields, scope/date/unsupported
selectors, exact numbers, file/stdin read once across renewal, pinned identity, quiet/
notices, untouched embedded blobs/codes/dates, error exports/no retries and 128 MiB
plain/compressed streams. Installed-package checks verify all three help entries and
isolated dry-runs. Mocks do not establish country-specific live behavior.

Reference: [Oracle fiscal invoice data](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getfiscalinvoicedata-post.html).
