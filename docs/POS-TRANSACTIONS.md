# POS transactions

Seven read-only POST commands are implemented against Oracle BI Swagger 2025.09.22.
**Offline-tested, with scoped live validation of all seven reads.** HTTP POST does not imply a POS write.
Every call requires one explicit location and one business-date selection. There is
no all-location transaction command, implicit date lookup or multi-date loop.

## Commands and selectors

Prefix each command with `bi pos-transactions`:

| Command | Operation | Required date | Optional native selectors |
|---|---|---|---|
| `guest-checks list` | `getGuestChecks` | Exactly one of `--business-date`, `--open-business-date`, `--closed-business-date` | `--rvc-num`, `--closed-only true\|false`, `--changed-since-utc` |
| `non-sales list` | `getNonSalesTransactions` | `--business-date` | `--trans-since-utc` |
| `journal-logs list` | `getPOSJournalLogDetails` | `--business-date` | None |
| `waste list` | `getPOSWasteDetails` | `--business-date` | `--trans-since-utc` (20.3+) |
| `guest-check-extensibility list` | `getGuestCheckExtensibilityDetails` | `--open-business-date` | None |
| `guest-check-line-item-extensibility list` | `getGuestCheckLineItemExtDetails` | `--business-date` | None |
| `spi-payments list` | `getSPIPaymentDetails` | `--business-date` | `--changed-since-utc` |

Paths are `/bi/v1/{orgIdentifier}/{operation}`. Organization, application URL and
ID Bearer token come from one pinned active company profile, not from guessed
identities or STS credentials. No date, location, RVC or closed-only default is added.

## Explicit requests

Replace placeholders with an authorized location/date before running these examples:

```sh
bi pos-transactions guest-checks list --loc-ref "<location-reference>" --open-business-date "<YYYY-MM-DD>" --dry-run
bi pos-transactions guest-checks list --loc-ref "<location-reference>" --closed-business-date "<YYYY-MM-DD>" --rvc-num 1 --closed-only true --include "curUTC,locRef,guestChecks.guestCheckId,guestChecks.chkNum,guestChecks.rvcNum,guestChecks.clsdBusDt,guestChecks.clsdFlag,guestChecks.chkTtl"
bi pos-transactions non-sales list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --trans-since-utc "<YYYY-MM-DDTHH:mm:ss>"
bi pos-transactions journal-logs list --file request.json --dry-run
```

The RVC in an example is illustrative, not a default or permission to use it.
Common flags: `--loc-ref`, `--search-criteria`, `--include`, `--application-name`,
`--json`, `--file` (`-` for stdin), `--dry-run`, `--quiet`, `--timeout`.

JSON uses Oracle names: `locRef`, `busDt`, `opnBusDt`, `clsdBusDt`, `rvcNum`,
`clsdGuestChecksOnly`, `changedSinceUTC`, `transSinceUTC`, `searchCriteria`, `include`,
`applicationName`. Unknown fields survive, including exact JSON number spellings.
Explicit flags override matching fields only; they do not remove a different date
selector from the JSON body. `--json` and `--file` are mutually exclusive.

Known fields are validated equally for flags and JSON:

- `locRef`: nonblank string, maximum 99 characters.
- `searchCriteria` / `include`: nonblank strings, maximum 2000 characters.
- `applicationName`: nonblank string, maximum 128 characters (20.1.10+).
- Dates: actual calendar dates in `YYYY-MM-DD`; no timezone conversion or default.
- `clsdGuestChecksOnly`: JSON boolean; CLI accepts exactly `true` or `false`.
- `rvcNum`: JSON integer number; CLI accepts integer digits and preserves large values.
  No arbitrary numeric maximum is inferred from Swagger's numeric `maxLength: 10`.
- Known selectors belonging to another endpoint are rejected, not ignored.

## Date and cursor semantics

Guest checks supports **exactly one** date: open/reopened (`opnBusDt`), closed or
reopen-closed (`clsdBusDt`), or the union where either matches (`busDt`, 20.1.10+).
These are not interchangeable accounting views. Swagger lists all three as required,
but each field description forbids the other two; the CLI follows those descriptions.
Native guest-check `rvcNum` requires 20.1.9.7+ and is not a generic selector on other calls.

**Agent responsibility:** choose the date-selection basis from the user's intent,
asking when it is ambiguous. The CLI does not default or infer it. Open-date selection
does not mean currently open; `clsdGuestChecksOnly` is a separate status filter.
A check spanning dates may appear in union-date results for both days; do not blindly
sum those results or assume they are an accounting-day sales total.

Cursors accept `YYYY-MM-DDTHH:mm:ss`, optional fractional seconds, and optional `Z`.
Accepted spelling and fractional precision are forwarded unchanged. Offsetless values
mean UTC, never machine-local time. Numeric offsets, date-only values, invalid calendar
or clock values, and leap-second `:60` are rejected rather than converted.
**Use offsetless UTC for the tested deployment.** All four cursor-enabled endpoints
accepted whole seconds, `.000`, and seven-digit fractional seconds without Z, but
rejected Z-suffixed forms with HTTP 400. This establishes syntax acceptance, not
subsecond precision guarantees. The CLI still forwards syntactically valid Z input
unchanged so Oracle's response remains visible; it never strips Z and retries.
Non-sales and waste returned records **at or after** an observed transaction-time
boundary in stable-baseline tests. Consumers must allow boundary overlap rather than
assume a strictly exclusive cursor.

A since-cursor does not replace the business date. `changedSinceUTC` on guest checks
tracks cloud changes, not just POS transaction time; delayed uploads and reopened
checks matter. `transSinceUTC` is a distinct transaction-time lower bound. No cursor
is saved/advanced, no polling/lookback is scheduled, and no other dates are queried.
Keep returned `curUTC` when needed and retain a cursor only after successfully consuming
the response. Scope it to the location/date/query definition. Repeated check IDs can
represent updates, not new sales to append and sum.

## Filters, projections and compatibility

Filters are forwarded verbatim. Scoped transaction tests verified `where equals(...)`
RVC filters on guest checks, non-sales, journal logs, waste, check extensibility and
SPI. Line-item extensibility had no records, so its filter behavior remains unverified.
Bare `equals(...)` and malformed syntax returned HTTP 400, with one data request and
no broader fallback. The `!equals(...)` form has only been verified for dimensions.

A combined parent-ID and nested line-number predicate selected one guest check but
retained all its sibling detail lines, including nonmatching ones. Do not assume a
child predicate prunes the returned child array. This is one observed field path,
not a universal rule for every nested array or endpoint.

Example schema paths (support varies; the observations above do not validate every path):

- Guest checks: `guestChecks.guestCheckId`, `guestChecks.rvcNum`, `guestChecks.detailLines`.
- Non-sales: `nonSalesTransactions.rvcNum`.
- Journal: `revenueCenters.logDetails.guestCheckId`.
- Waste: `revenueCenters.menuItems.miNum`.
- Extensibility: `revenueCenters.guestChecks.guestCheckId` or `revenueCenters.detailLines.guestCheckId`.
- SPI: `revenueCenters.transactions.guestCheckID`, with uppercase `ID`.

`--include` replaces the default field set, it is not additive. Preserve identifiers,
parent/child relationships, combo fields and available cursors needed by consumers.
The CLI performs no joins, reconciliation, combo roll-up or local business calculations.
No pagination parameters are documented for these seven endpoints; none are invented.

SPI requires 20.1.11+ and Simphony Payment Interface, not Oracle MICROS Payment Cloud
Service. It does not implement the separate payment-transactions area. Empty data
can reflect deployment/configuration, not complete payment coverage or a CLI defect.
Waste's cursor requires 20.3+; example fields `qty/amt/cost` differ from schema
`cnt/ttl/prepCost`. The CLI never renames response fields or drops unsupported options
and retries a broader query after rejection.

## Delivery, safety and validation

All calls use the same [response handler](RESPONSES.md) as dimensions: verbatim bytes
inline up to **16 KiB AND 500 lines**, otherwise a private complete file and compact
JSON reference. Redirected stdout can therefore contain either the body or a receipt.
No body parsing, formatting, redaction, truncation or automatic export deletion.
Check, journal, employee, extensibility and payment details can be sensitive; protect
exports and never commit or paste unreviewed customer data into reports.

[Company maintenance](AUTHENTICATION.md) runs before data calls, after validation;
input files/stdin are read once. The selected company remains pinned across renewal.
[Update notices](CLI.md#update-notices) run after successful non-quiet delivery. Help,
local commands and dry-runs stay offline; no data retries or redirects are introduced.

Tests use synthetic loopback servers: all seven paths, field/date/boolean/integer and
cursor validation, exact numbers, stdin/file input, renewal, pinned identity, response
errors and private exports. 128 MiB plain/compressed transaction streams exercise the
shared bounded-memory path. Scoped live validation on one deployment reporting
20.4.1.0 covered all seven reads, all three guest-check date selectors, native RVC and
closed-only selectors, minimal projections, filters and cursor formats. Native RVC,
closed-only and tested RVC-filter results matched stable before/after baselines.
`closed-only false` included both statuses; it did not mean open checks only.
Minimal projection returned only requested fields, omitting even location/cursor metadata.
Completed file receipts were hash-verified; rejected requests preserved API non-success
exit codes without retries. Line-item extensibility was empty, which proves endpoint
acceptance, not populated-data behavior. These checks do not prove accounting
reconciliation, complete SPI coverage, late-arrival handling or identical behavior on
other deployments. New live scopes still require authorization.

Reference: [Oracle Transactions](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/api-transactions.html).
