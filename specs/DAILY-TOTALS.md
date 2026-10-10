# Regular daily totals

Status: implemented locally with offline tests and authorized live functionality
spot checks. No numerical reconciliation was requested or performed. See
[command guide](../docs/DAILY-TOTALS.md).

## Scope and source

Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Reviewed all twelve Daily Aggregations operation descriptions, request schemas and
examples. Eleven ordinary endpoints share `requestPayload`; control totals use the
distinct `controlTotalsRequestPayload` and remain a follow-up, as do quarter-hour totals.
Public request-only fixture: `tests/fixtures/daily-totals-contract.json`. No live tenant
data or full API dumps are included in fixtures or packaging.

Operations: getOperationsDailyTotals, getMenuItemDailyTotals, getComboItemDailyTotals,
getDiscountDailyTotals, getServiceChargeDailyTotals, getTenderMediaDailyTotals,
getTaxDailyTotals, getOrderTypeDailyTotals, getOrderChannelDailyTotals,
getEmployeeDailyTotals and getJobCodeDailyTotals.

## Contract

- One explicit `locRef` plus `busDt`, not a date range or guest-check date basis.
- Optional `searchCriteria`, `include`, `applicationName`; forward verbatim with
  documented string length/type checks. Native RVC and cursor fields are unsupported.
- JSON/file/stdin input read once, flags override matching fields, unknown fields and
  numeric precision retained. No implicit filters, end-of-day checks or dates.
- Use `executeQuery` and the existing response handler, not a duplicate auth/transport
  implementation. Preserve pinned company, ID tokens, renewal and advisory notices.
- Registry/help distinguish partially implemented aggregations from completed areas.
- API data, including errors, stays verbatim. No local aggregation or reconciliation.

## Acceptance

All eleven synthetic routes, ID authorization, exact request numbers, no silent defaults,
invalid input before renewal, preserved filter/projection fields, file/stdin read once,
rotated tokens, pinned identity, update notice behavior, large/error responses, no retries
or redirects, help and installed-package checks. Plain/compressed 128 MiB daily responses
must exercise bounded-memory delivery. No release/publication is authorized.

## Follow-up live plan

At the approved location/date, first use small projections, then test RVC/child filters
and necessary totals. Avoid unrestricted employee/payroll exports. Record schema/path
inconsistencies rather than rewriting data. Compare only compatible measures and scopes;
reconcile using control totals in the next phase, not by assuming a sum of guest-check
headers equals daily sales. A subsequent authorized spot-check pass exercised all eleven routes with narrow
projections, plus representative filters, JSON input, file delivery and an intentional
API rejection. Job-code data was empty. Further comparison requires a separately
agreed reconciliation scope; functionality checks do not establish numerical correctness.
