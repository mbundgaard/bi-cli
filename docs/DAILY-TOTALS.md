# Daily totals

All twelve daily-total reads, including control, are implemented and offline-tested
against Oracle Swagger 2025.09.22. **Scoped live functionality spot checks passed;
numbers were not reconciled.** Eight quarter-hour totals remain planned, so the
aggregations area is still only partially implemented.

## Commands

Each command is `bi aggregations daily <noun> list` and makes one read-only POST to
`/bi/v1/{orgIdentifier}/{operation}`:

| Noun | Operation | Data |
|---|---|---|
| `control` | `getControlDailyTotals` | End-of-day status, changes and control counts/totals |
| `operations` | `getOperationsDailyTotals` | Operational totals by RVC |
| `menu-items` | `getMenuItemDailyTotals` | Menu-item totals and grouping dimensions |
| `combo-items` | `getComboItemDailyTotals` | Combo totals and components (20.1.8.3+) |
| `discounts` | `getDiscountDailyTotals` | Discount totals |
| `service-charges` | `getServiceChargeDailyTotals` | Service-charge totals |
| `tender-media` | `getTenderMediaDailyTotals` | Tender totals, not payment settlements |
| `taxes` | `getTaxDailyTotals` | Tax totals |
| `order-types` | `getOrderTypeDailyTotals` | Operational totals by order type |
| `order-channels` | `getOrderChannelDailyTotals` | Operational totals by order channel |
| `employees` | `getEmployeeDailyTotals` | Employee operational totals, including tips |
| `job-codes` | `getJobCodeDailyTotals` | Job-code hours and pay, not time cards |

No generic arbitrary-operation command is provided. `bi endpoints` lists the 35
implemented data calls and labels aggregations as partial, not a completed area.
`bi aggregations quarter-hour` displays help only.

## One explicit location and date

The eleven regular totals (excluding control) use the same documented request schema:

- Required `locRef`: nonblank string, at most 99 characters.
- Required `busDt`: actual calendar date in `YYYY-MM-DD`.
- Optional `searchCriteria` and `include`: nonblank strings, at most 2000 characters.
- Optional `applicationName`: nonblank string, at most 128 characters (20.1.10+).

There is no default date, organization-wide mode, date range, since-cursor or native
RVC selector. Unlike guest checks, these calls do not accept open/closed date bases.
Known transaction/control-only fields (`opnBusDt`, `clsdBusDt`, `rvcNum`,
`clsdGuestChecksOnly`, `changedSinceUTC`, `transSinceUTC`) are rejected locally rather
than silently ignored. Unknown fields and exact JSON numbers otherwise survive.

Flags override matching body fields only. `--json` and `--file` are mutually exclusive;
`--file -` reads stdin once. Input validation precedes company renewal. `--dry-run`
requires application URL/organization configuration but no tokens and makes no network
calls. No date lookup or end-of-day check is hidden behind any command.

```sh
bi aggregations daily operations list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi aggregations daily menu-items list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.menuItems.miNum,revenueCenters.menuItems.prcLvlNum,revenueCenters.menuItems.ocNum,revenueCenters.menuItems.otNum,revenueCenters.menuItems.slsCnt,revenueCenters.menuItems.slsTtl"
bi aggregations daily taxes list --file request.json --dry-run
```

Replace placeholders with authorized values. To request one RVC, supply an explicit
filter such as `--search-criteria "where equals(revenueCenters.rvcNum,<rvc-number>)"`.
The CLI never turns a shorthand RVC into a hidden filter or removes a rejected filter
and retries a broader query. Scoped live checks accepted RVC filters on operations
and menu items; other daily filters and child-array pruning remain unverified.

`--include` replaces the default field set. Keep identifiers, parent/child relationships
and grouping dimensions needed for interpretation. The CLI does not add metadata back
when a projection omits it. Other common flags are `--quiet` and `--timeout` (positive
seconds, default 30, maximum 300 per network request).

## Comparing totals responsibly

These are Oracle-provided aggregates, not CLI calculations or verified accounting totals.
Before live comparison, the agent must agree the location and business date with the
caller. For end-of-day reconciliation, choose a completed business date and establish
completion separately; being in the past or returning HTTP 200 does not prove finality.
Late uploads, reopened checks and subsequent corrections may change historical results.

- A daily `busDt` does not inherit the guest-check endpoint's union-date semantics.
  Select the appropriate guest-check date basis explicitly when comparing records.
- Match RVC, date basis, filters and measure definitions before comparing totals.
  Sales, tax, discounts, tips, service charges and tender receipts are not interchangeable.
- Menu-item rows can have price-level, order-channel and order-type dimensions. Do not
  collapse them to one row per item without an explicit consumer-side aggregation rule.
- Combo parents/components are related data, not necessarily independent sales to add.
  Do not double-count them or flatten them automatically.
- Operational employee totals can contain sales/tip data; job-code totals contain hours
  and pay. Authorization to inspect one does not imply unrestricted payroll discovery.
- Tender totals are not proof of settlement, payout or complete payment coverage.

No reconciliation, rounding, VAT/tip/combo calculation, local join, polling, multi-date
scan or cursor persistence is implemented. Control data is available explicitly; no
control lookup is automatically chained to another request.

## Control daily totals

```sh
bi aggregations daily control list --loc-ref "<location-reference>" --open-business-date "<YYYY-MM-DD>" --dry-run
bi aggregations daily control list --loc-ref "<location-reference>" --closed-business-date "<YYYY-MM-DD>" --rvc-num 1
```

Replace the illustrative RVC with the authorized target. Control accepts the same
optional `searchCriteria`, `include`, `applicationName` and common input/transport flags,
plus native `rvcNum` (20.1.9.7+) and exactly one date-selection basis:

- `--business-date` / `busDt`: open OR closed business date matches.
- `--open-business-date` / `opnBusDt`: opened/reopened on the date (20.1.10+).
- `--closed-business-date` / `clsdBusDt`: closed/reopen-closed on the date (20.1.10+).

Oracle's required list incorrectly requires all three dates while their descriptions
explicitly forbid combining them. The CLI follows mutual exclusion, with no default.
Flags do not delete other date fields from JSON. Native RVC must be an integer JSON
number; large integers are preserved without rounding. There is no closed-only flag
or since-cursor on control totals. Choose the basis from user intent and match it to
any separately requested guest-check comparison. Union results across dates can overlap.

The response includes `eodStatus`, transaction/update timestamps and per-RVC control
counts/totals. It remains verbatim: no inferred finality, reconciliation, polling or
automatic guest-check fetch. Cloud last-updated fields are documented from 20.1.12+.

**Observed naming mismatch:** the tested deployment returned `lastUpdateUTC` and
`lastUpdateLcl`, while Swagger documents `lastUpdatedUTC` and `lastUpdatedLcl`.
Projecting `lastUpdatedUTC` returned HTTP 400/code 33205. Projections using the observed
names succeeded. Do not assume every deployment uses the same spelling; the CLI neither
renames responses nor rewrites projections and retries.

Control spot checks verified all three date selectors, native RVC, searchCriteria,
minimal/update-field projections and applicationName. Numbers and end-of-day finality
were not validated. No default projection is added, and Oracle errors remain unchanged.

## Scoped live functionality checks for regular totals

All eleven routes returned HTTP 200 with narrow location/date/RVC projections at one
authorized location/date. These were functionality checks, not accounting reconciliation
or evidence that the day was final. No employee/payroll amounts were requested.

- Operations and menu-item RVC filters returned only the selected RVC.
- JSON input and a menu-item identifier projection worked. The resulting private
  response file was verified against its receipt's SHA-256 hash.
- A minimal operations projection omitted unrequested location/date metadata.
- A deliberately malformed filter returned HTTP 400 (Oracle code 33214), preserved
  as exit 11. One data status was observed per invocation; no broader fallback.
- Due token renewal succeeded before the first read.
- Job-code totals returned an empty RVC array; populated payroll data remains untested.

These observations do not establish every filter/field, nested pruning, numerical
correctness, complete payroll coverage, or compatibility with other deployments.

## Delivery and validation

Requests reuse the same pinned-company renewal, ID Bearer token and update-notice
lifecycle as dimensions and transactions. No STS credentials, data retries, redirects
or TLS bypass. [Response delivery](RESPONSES.md) is verbatim: at most 16 KiB **and**
500 lines stays inline; exceeding either threshold saves the complete private body and
prints a compact file reference. This also applies to API errors and redirected stdout.
No response parsing, formatting, redaction or truncation is performed by the CLI.
Protect commercial/employee/payroll exports; files are retained until explicitly deleted.

Synthetic tests cover all eleven routes, scope/date validation, filters/projections,
exact numbers, file/stdin input across renewal, pinned company identity, quiet/update
behavior, errors and no retries/redirects. Plain and compressed 128 MiB daily responses
exercise the shared bounded-memory delivery path. Native-platform/live behavior must
not be inferred solely from mocks or configured CI.

The shared Oracle request schema describes `busDt` as a cash-management date even on
these daily routes. That is reused schema wording, not an instruction to change routes.
Several examples also contain malformed JSON or field-name discrepancies. The CLI
never repairs or renames server data to match an example.

Reference: [Oracle BI API](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/index.html),
[operations daily totals](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getoperationsdailytotals-post.html).
