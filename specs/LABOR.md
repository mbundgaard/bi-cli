# Labor time-card reads

Status: implemented locally with offline and scoped empty-data live testing.
See [Labor guide](../docs/LABOR.md).

Contract: Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Reviewed getTimeCardDetails, timeCardDetailsRequestPayload, timeCardDetailsResponse,
timeCardDetailsBusinessDates, timeCardDetails, adjustments and operation example.
Public request subset: tests/fixtures/labor-contract.json; synthetic tests only.

One read-only POST exposed as bi labor time-cards list, API 20.2+ with payroll
preprocessing. Ten request properties. Require locRef and busDt or postedDt or both
(AND). Preserve contradictory required list including PostedDt in fixture, but follow
property descriptions. Uppercase PostedDt is not silently aliased. Document insertion
versus update-date discrepancy; no historical snapshot inference.

Optional empNum/extPayrollID are mutually exclusive; preserve exact numbers and leading
zeros. Optional includeAdjustments accepts boolean only, with no injected default.
changedSinceUTC is optional, unchanged and cannot replace date selection. No native
RVC, open/closed-date or transSinceUTC selector. Keep unknown JSON fields without
endorsing them. Validate once before renewal and use shared executeQuery lifecycle.

Protect payroll, employee, clock, pay/tip, manager and adjustment-reason data. No
clock/approval/adjustment writes, payroll math, cursor advancement, polling, deduplication
or compliance conclusions. Preserve nesting, status codes, missing fields and timestamps.

Offline acceptance: all properties, date alternatives/AND, string limits, exact integers,
selector conflicts, booleans/cursors, JSON/file/stdin and flag precedence, validation
before network, one input read across renewal, pinned identity, quiet/notices,
verbatim responses/errors, no retries/redirects, 128 MiB streams and installed package.
Five scoped live probes at one location/business date passed: date/RVC metadata,
JSON/file/stdin, applicationName, explicit false adjustments, quiet and malformed-filter
400/33214. Successful reads returned empty businessDates; no employee/payroll detail
was requested or returned. Populated cards, employee/RVC filters, posted/combined dates,
adjustments and cursor semantics remain live-unverified. No scope expansion.
