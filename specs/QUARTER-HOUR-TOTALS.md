# Quarter-hour totals

Status: implemented locally with offline tests and scoped functionality spot checks.
No numerical reconciliation or publication. See [command guide](../docs/QUARTER-HOUR-TOTALS.md).

Reviewed all eight operation descriptions, request schemas, examples and quarter-hour
metadata definitions in Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Public request subset: tests/fixtures/quarter-hour-contract.json. No tenant payloads.

## Scope

Eight 20.1.16+ operations: getOperationsQuarterHourTotals, getMenuItemQuarterHourTotals,
getComboItemQuarterHourTotals, getDiscountQuarterHourTotals,
getServiceChargeQuarterHourTotals, getTenderMediaQuarterHourTotals,
getOrderTypeQuarterHourTotals and getJobCodeQuarterHourTotals.

Same five-field request as regular daily totals: locRef and busDt required;
searchCriteria, include and applicationName optional. No invented endpoint variants,
time windows, RVC/quarter-number flags or implicit filter translation. Retain unknown
JSON fields and exact numbers, but reject known unsupported control/transaction selectors.

The existing daily command/request modules now serve all aggregation periods; reuse
validation, one input read, pinned-company renewal and response delivery. Register
aggregations as fully implemented: 20 endpoints, 43 total implemented BI data calls.

## Semantics and validation

Never convert qtrHrNum/busHrNum/dpName into guessed absolute time, fill absent slots,
collapse repeats, reinterpret business dates or perform local aggregation. Preserve
nested structures and raw API responses. Data above either output threshold goes to
private files with hashes, including errors.

Offline coverage includes every route, required/unsupported fields, flags/JSON/file/stdin,
exact input and output numbers, invalid input before renewal, rotated tokens, pinned
company identity, quiet/notices, no retries/redirects and large plain/compressed streams.

Scoped live probes returned 200 for all routes with narrow projections. Operations
nested quarter filters retained sibling quarters; document rather than locally prune.
Representative RVC filtering, projections, JSON/file/stdin and quiet worked. Job-code
results were empty. Malformed filters returned 400/33214. These are functionality
observations, not numerical, completeness, DST or cross-deployment validation.

A subsequent 24-probe identifier-only pass validated item/combo component projections,
quarter metadata and RVC filters on the other six non-payroll endpoints against stable
projected baselines. All six child-ID predicates retained nonmatching children; three
returned unchanged parents and three differed from the RVC-only baseline. Document
these limits rather than assuming uniform pruning or applying local transformations.
