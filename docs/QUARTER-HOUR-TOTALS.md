# Quarter-hour totals

All eight Oracle quarter-hour aggregation endpoints are implemented, offline-tested
and scoped live functionality-tested. Oracle documents availability from **20.1.16**.
Together with twelve [daily totals](DAILY-TOTALS.md), this completes all twenty
aggregation endpoints. No numerical reconciliation is performed by the CLI.

## Commands and parameters

Each command is `bi aggregations quarter-hour <noun> list`, issuing one read-only
POST to `/bi/v1/{orgIdentifier}/{operation}`:

| Noun | Operation |
|---|---|
| `operations` | `getOperationsQuarterHourTotals` |
| `menu-items` | `getMenuItemQuarterHourTotals` |
| `combo-items` | `getComboItemQuarterHourTotals` |
| `discounts` | `getDiscountQuarterHourTotals` |
| `service-charges` | `getServiceChargeQuarterHourTotals` |
| `tender-media` | `getTenderMediaQuarterHourTotals` |
| `order-types` | `getOrderTypeQuarterHourTotals` |
| `job-codes` | `getJobCodeQuarterHourTotals` |

There are no documented quarter-hour tax, employee, order-channel or control-total
operations in this Swagger version; none are invented from daily counterparts.

All eight share the regular daily request schema:

| Oracle field | CLI flag | Requirement |
|---|---|---|
| `locRef` | `--loc-ref` | Required nonblank string, maximum 99 characters |
| `busDt` | `--business-date` | Required actual calendar date, `YYYY-MM-DD` |
| `searchCriteria` | `--search-criteria` | Optional nonblank string, maximum 2000 |
| `include` | `--include` | Optional nonblank string, maximum 2000 |
| `applicationName` | `--application-name` | Optional nonblank string, maximum 128 |

No native RVC, quarter-number, time-window, open/closed-date or since-cursor parameter
is documented. Location/date are never guessed; no all-location mode, latest-date
lookup, implicit filters or date loops. Known control/transaction selectors are rejected
locally. Other unknown JSON fields survive without being endorsed as supported filters.

Use `--json` or `--file` (`-` for stdin). Flags override matching JSON fields only;
input is read once, and unknown fields/exact numbers survive. `--dry-run` is offline
and omits authorization. `--quiet` suppresses diagnostics/update notices, not data.
`--timeout` is positive seconds per network request, default 30 and maximum 300.

```sh
bi aggregations quarter-hour operations list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi aggregations quarter-hour operations list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.quarterHours.qtrHrNum,revenueCenters.quarterHours.busHrNum,revenueCenters.quarterHours.dpName"
bi aggregations quarter-hour menu-items list --file request.json --dry-run
```

Replace placeholders with authorized values. For RVC selection, explicitly supply
`--search-criteria "where equals(revenueCenters.rvcNum,<rvc-number>)"`. Nested slot
predicates can use `revenueCenters.quarterHours.qtrHrNum`, but do not assume this
prunes the returned child array. No rejected filter is removed and retried.

## Preserve grouping and time semantics

Oracle groups data beneath `revenueCenters[].quarterHours[]`. The schema describes:

- `qtrHrNum`: number of the 15-minute increment, documented as 1-96.
- `busHrNum`: business-hour number, documented as 1-240.
- `dpName`: name of the day part for the quarter hour.

These are returned metadata, not caller-supplied time bounds. They are not converted
to timestamps or inferred to be UTC/local wall-clock offsets. Do not assume exactly
96 rows, fill absent intervals with zeros, collapse repeated quarter numbers or invent
DST rules. The CLI neither validates nor rewrites response fields/ranges.

Keep location, business date, RVC, quarter/business hour and day-part relationships,
plus item/price/order/combination dimensions needed by the consumer. Projections
replace the default field set; the CLI does not add omitted metadata back. Nested
arrays, combo components and exact response number spellings remain untouched.

Do not blindly sum combo parents and components, equate tender totals with settlement
receipts, or assume quarter-hour sums reconcile to daily totals. Those are explicit
consumer-side business decisions. Job-code totals may contain sensitive hours/pay;
authorization for other totals is not unrestricted payroll discovery.

## Scoped live observations

At one authorized location/date, all eight routes returned HTTP 200 with narrow
location/date/RVC projections. Further functionality checks verified:

- Operations quarter-hour metadata projection and RVC search filtering.
- A combined RVC/quarter-number filter selected its parent RVC but retained other
  quarter-hour siblings. No local pruning was added.
- Menu-item identifier projection with JSON input, producing a complete private file
  whose hash matched the receipt.
- File/stdin input, applicationName and quiet output with a minimal projection.
- Malformed filter rejection as HTTP 400/code 33214 and exit 11, without broader fallback.

A further 24-probe pass covered menu items, combos, discounts, service charges, tenders
and order types using identifier-only projections with quarter/business-hour/day-part
metadata. All returned HTTP 200. Six RVC filters matched stable before/after projected
baselines; item/price/order identifiers and nested combo-component projections worked.
Completed file receipts were hash-verified, with no financial amounts or payroll detail
requested in this pass.

All six nested child-identifier predicates still returned some nonmatching children.
Combo, discount and service-charge results matched the full RVC-only projected parent;
menu-item, tender and order-type results differed from that baseline but still retained
nonmatching child identifiers. Do not assume either complete pruning or that nested
predicates always return the entire unchanged parent. These observations are specific
to the tested predicates and deployment, not a universal filter grammar guarantee.

Job-code results were empty, so populated payroll/quarter data there remains unverified.
Initial RVC-only projections intentionally omitted quarter rows; absence under such a
projection is not proof that quarter-hour data is empty. These checks do not validate
numbers, all filter paths, DST behavior, end-of-day finality or other deployments.

## Delivery and tests

All queries share regular/control daily validation and the pinned-company execution
lifecycle. Due company profiles renew before data requests, using BI ID tokens.
No data retries, redirects or TLS bypass. Successful non-quiet calls use the existing
advisory update schedule; no automatic installation.

[Response delivery](RESPONSES.md) is unchanged: at most 16 KiB **and** 500 lines is exact
stdout; exceeding either limit saves a complete private body and emits a compact file
reference. Errors follow the same rule with preserved exit codes. No response parsing,
rounding, time conversion, redaction or truncation. Protect and explicitly delete exports
when no longer needed.

Tests use synthetic loopback servers and isolated stores. They cover all eight paths,
all documented request fields, scope/date validation before renewal, exact numbers,
stdin/file input read once, pinned identity, notices/quiet mode, unusual slot metadata,
errors/no retries and 128 MiB plain/compressed streaming. Installed-package checks
exercise the actual shim and isolated quarter-hour dry-run.

Reference: [Oracle operations quarter-hour totals](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getoperationsquarterhourtotals-post.html).
