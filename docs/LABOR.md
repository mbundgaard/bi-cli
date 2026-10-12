# Labor

`bi labor time-cards list` reads current time-card and related sales information via
`POST /bi/v1/{orgIdentifier}/getTimeCardDetails`. Requires API 20.2+ and Labor Management
payroll preprocessing. Implemented and offline-tested, with scoped empty-data live checks.
No clock-in/out, adjustment creation, approval, payroll submission or employee writes.

## Request fields

| Oracle field | CLI flag | Requirement |
|---|---|---|
| `locRef` | `--loc-ref` | Required nonblank string, maximum 99 characters |
| `busDt` | `--business-date` | Time-card business date, actual YYYY-MM-DD |
| `postedDt` | `--posted-date` | Cloud posting/update date, actual YYYY-MM-DD |
| `changedSinceUTC` | `--changed-since-utc` | Optional UTC last-update cursor; not a replacement for a date |
| `empNum` | `--emp-num` | Optional exact integer employee object number |
| `extPayrollID` | `--ext-payroll-id` | Optional nonblank string, maximum 32; preserves case/leading zeros |
| `includeAdjustments` | `--include-adjustments true` or `false` | Optional boolean; omission leaves Oracle default false |
| `searchCriteria` | `--search-criteria` | Optional nonblank string, maximum 2000 |
| `include` | `--include` | Optional nonblank string, maximum 2000; replaces default projection |
| `applicationName` | `--application-name` | Optional nonblank string, maximum 128 |

One explicit location and **at least one date** are required. Use busDt, postedDt, or
both. Both combine with **AND**, not OR; they are not a date range. The agent must match
the date basis to the user's intent and ask when ambiguous. No date/location defaults,
implicit discovery or all-location mode. Posted-date results can contain multiple business
dates; do not overwrite them with the requested date or infer a historical snapshot.

Oracle's required list says locRef/busDt/PostedDt, but property descriptions explicitly
allow either date or both. The CLI follows those descriptions and uses lowercase
`postedDt`; uppercase `PostedDt` is rejected, never silently aliased. Descriptions
conflict on insertion versus update semantics: the request describes insertion, while
lastUpdatedUTC says postedDt compares its date portion and businessDates mentions
inserted/updated cards. Keep this discrepancy explicit until deployment validation.

Employee selectors are optional, but **empNum and extPayrollID cannot be combined**,
including across JSON and flags. Neither supplied can mean all employees in the selected
location/date scope. Do not silently drop either to resolve a conflict. empNum stays an
exact JSON number, including values beyond JavaScript's safe integer range. Swagger's
maxLength on integer fields is not interpreted as an invented numeric maximum.
No native RVC, open/closed-date, payrollID or transSinceUTC flag is invented.

```sh
bi labor time-cards list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi labor time-cards list --loc-ref "<location-reference>" --posted-date "<YYYY-MM-DD>" --include "curUTC,locRef,businessDates.busDt" --dry-run
bi labor time-cards list --file request.json --dry-run
```

Replace placeholders with authorized values. `--json` and `--file` (`-` for stdin) use
Oracle field names. Flags override matching fields only; unrelated fields survive.
Input is read once before renewal, preserving unknown fields and exact numbers.
Unknown fields are not endorsements of additional selectors. `--quiet` suppresses HTTP
status/update notices, not data/errors. `--timeout` is seconds per request, default 30,
greater than zero and at most 300. Help/local/dry-run stay offline; dry-run omits auth,
not identifiers supplied by the caller.

## Current state, cursors and adjustments

The API returns the most recent/current state of a time card. Oracle documents a
calculation engine running every 15 minutes, updating hours/pay. No clock-out cards
continue to appear with changedSinceUTC; recurring results are not proof of a CLI bug.
The CLI never waits/polls for recalculation or declares payroll finalized.

`changedSinceUTC` compares time-card last-update time; dates remain additional filters.
Oracle recommends postedDt plus changedSinceUTC for deltas, with the prior curUTC as
the next cursor. This is consumer guidance, not automatic CLI behavior. The CLI does
not persist/advance cursors, deduplicate, join employees or promise complete delta capture.
Local syntax is `YYYY-MM-DDTHH:mm:ss[.fraction][Z]`, with calendar/clock validation;
numeric offsets are rejected and accepted spelling is unchanged. Other tested endpoints
rejected trailing Z; labor acceptance, precision and boundary semantics remain unverified.
No silent Z removal or data retry.

`includeAdjustments: true` requests existing previous values if adjustments exist. It
does not create/update a time card. The CLI never injects true or false by default.
Projection still replaces the default field set; selecting a path does not establish
that adjustments exist. Filters are forwarded unchanged, with no broad fallback or
assumed nested pruning. RVC paths, if explicitly requested, are under
`businessDates.timeCardDetails.rvcNum`, not revenueCenters.

## Response and privacy

Documented nesting: `businessDates[].timeCardDetails[].adjustments[]`.
Keep tcId, business-date, employee, job-code and adjustment relationships as returned.
Use documented jcNum rather than deprecated jobCodeRef; no automatic field aliasing.
Local/UTC clock times, lastUpdatedUTC/addedUTC, numeric status/shift codes and unknown
fields remain untouched. Missing/null/zero fields remain distinct. A clock-out field
omitted by projection cannot establish that an employee is still clocked in.

This endpoint can expose employee/payroll identifiers, clock events, rates/hours/pay,
sales/tips, authorizing employees, manager names and adjustment reasons. Keep live
validation explicitly authorized and narrowly projected; never publish unreviewed
exports or use tenant responses as fixtures. No local wage/overtime/tax calculations,
timezone conversions, performance ranking, reconciliation or compliance conclusions.

## Execution and validation

All requests use shared executeQuery with pinned BI company, one validated input read,
due company renewal and ID tokens. No STS credentials or duplicated auth lifecycle.
[Response delivery](RESPONSES.md) keeps at most 16 KiB AND 500 lines exact on stdout;
larger bodies become complete private exports and compact receipts. HTTP errors retain
exit codes; no response parsing/redaction/truncation, redirects or data retries.
Exports remain until explicitly deleted. Update notices are advisory; no installation.

Synthetic tests cover the ten-field contract, either/both date bases, selectors,
calendar/cursor validation, exact employee numbers, leading-zero IDs, adjustment booleans,
JSON/file/stdin, one input read across renewal, pinned identity, quiet/notices, untouched
sensitive synthetic fields, error delivery and 128 MiB plain/compressed streams.
Installed-package checks cover help, inventory and isolated dry-runs for all date modes.

Five scoped live probes at one authorized location/business date behaved as expected:
metadata read, JSON/file/stdin with applicationName and explicit includeAdjustments false,
quiet output, and malformed-filter HTTP 400/code 33214/exit 11. Successful responses
contained an empty businessDates array and respected the narrow date/RVC projection.
No employee identifiers, pay/tips or adjustment details were requested or returned.

This establishes the query path and input handling in that scope, not populated time
cards or payroll preprocessing configuration. Employee/RVC filtering, posted-only and
combined date behavior, adjustments and changedSinceUTC remain live-unverified.
No other locations/dates were queried to find populated records.

Reference: [Oracle time-card details](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-gettimecarddetails-post.html).
