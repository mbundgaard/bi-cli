# Cash management

`bi cash-management details list` implements Oracle's single cash-management operation,
`POST /bi/v1/{orgIdentifier}/getCashManagementDetails`. It reads existing records only:
no paid-in/out, cash count, transfer, deposit, adjustment or reconciliation writes.
Offline tests pass; scoped live functionality checks returned empty data, so populated
cash-detail behavior remains unverified on the live deployment.

## Request fields

All documented fields in Swagger 2025.09.22 are supported:

| Oracle field | CLI flag | Requirement |
|---|---|---|
| `locRef` | `--loc-ref` | Required nonblank string, maximum 99 characters |
| `busDt` | `--business-date` | Required actual calendar date in `YYYY-MM-DD` |
| `searchCriteria` | `--search-criteria` | Optional nonblank string, maximum 2000 |
| `include` | `--include` | Optional nonblank string, maximum 2000 |
| `applicationName` | `--application-name` | Optional nonblank string, maximum 128 (20.1.10+) |

There are no documented native RVC, receptacle, transaction-type, employee, time-window,
open/closed-date or since-cursor request selectors. No location/date defaults, date ranges,
all-location mode, implicit filters or discovery. Known unsupported control/transaction
selectors are rejected locally; other unknown JSON fields survive without being endorsed
as supported filters.

`--json` and `--file` are mutually exclusive; `--file -` reads stdin once. Explicit flags
override matching body fields only, preserving unknown fields and exact JSON numbers.
`--dry-run` previews locally without authorization/tokens/network. `--quiet` suppresses
HTTP diagnostics and update notices, not data. `--timeout` is positive seconds per
network request, default 30 and maximum 300. Validation precedes scheduled renewal.

```sh
bi cash-management details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi cash-management details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.cmDetails.cmItemNum,revenueCenters.cmDetails.transType"
bi cash-management details list --file request.json --dry-run
```

Replace placeholders with authorized values. To filter an RVC explicitly, use
`--search-criteria "where equals(revenueCenters.rvcNum,<rvc-number>)"`.
Nested paths include `revenueCenters.cmDetails.transType` and
`revenueCenters.cmDetails.receptacleNum`. These are schema paths, not claims of
live filter/pruning validation. Never infer child-array pruning from another endpoint.
No rejected filter is removed and retried as a broader request.

## Interpretation and privacy

Records appear beneath `revenueCenters[].cmDetails[]`. They can contain receptacle
names/numbers, amounts, transaction/employee references, free-text `refInfo`/`notes`,
check/tender identifiers, session and transfer-target relationships. Use minimal
projections and protect exports. Do not equate these records with payment settlement,
a current safe balance, all cash sales, or complete operational cash coverage.

- `transUTC` and `transLcl` are distinct; no timezone conversion is performed.
- `actBusDate` is returned actual-business-date data, not an alternate request selector.
  Do not overwrite it with the requested `busDt` or infer that all returned dates match.
- `balanceAmt` is documented from 20.1.15; `actBusDate`, `sessionNum`,
  `targetReceptacleNum` and `targetSessionNum` from 20.1.16. Preserve these relationships.
- Numeric receptacle and transaction codes remain numeric, including unknown codes.
  The CLI does not replace them with labels or enforce response enumerations.
- Missing fields and zeros remain as returned. The CLI does not calculate balances,
  reconcile counts, round amounts, link transfers or fetch related guest checks.
- `--include` replaces default fields; keep identifiers/metadata needed by consumers.

## Scoped live functionality checks

At one authorized location/date, normal and identifier/type-projected reads returned
HTTP 200 with an empty `revenueCenters` array. JSON/file/stdin input, `applicationName`,
quiet output and a minimal projection worked. A malformed filter returned HTTP 400,
Oracle code 33214 and CLI exit 11. No broader fallback was performed.

Empty results establish endpoint/request acceptance, not populated-data correctness,
complete cash coverage, RVC/child filter semantics or feature/configuration status.
No amounts, employee references, names or notes were requested. No financial numbers
were reconciled, and no additional dates/locations were queried to find populated data.

## Delivery and validation

The five-field body validator is shared with regular daily/quarter-hour totals.
Execution uses the shared pinned-company preflight/renewal and BI ID token, not STS
credentials. No data retries, redirects, TLS bypass or automatic installation.

[Response delivery](RESPONSES.md) remains verbatim: at most 16 KiB **and** 500 lines is
exact stdout; exceeding either limit saves the complete private body and emits a compact
file receipt. API errors follow the same rule with preserved exit codes. No body parsing,
redaction, formatting or truncation. Files remain until explicitly deleted.

Synthetic tests cover request/schema limits, explicit scope/date, unsupported selectors,
input precedence/precision, one stdin/file read across renewal, pinned identity,
quiet/update behavior, raw unknown response codes/dates/numbers, error status/no retries,
and plain/compressed 128 MiB exports. Installed-package checks exercise the actual shim
and an isolated dry-run. These tests do not establish live populated-record semantics.

Reference: [Oracle cash-management details](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getcashmanagementdetails-post.html).
