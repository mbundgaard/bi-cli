# Kitchen performance

Status: implemented locally; offline and scoped live functionality checks.
See [command guide](../docs/KITCHEN-PERFORMANCE.md). No reconciliation or publication.

Contract: Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Reviewed getKDSDetails, kdsRequestPayload, kdsDetails, kdsOrdersByRVC, kdsOrder,
kdsSubOrder and the operation example. Public request-only subset:
`tests/fixtures/kitchen-contract.json`. No tenant payloads in fixtures.

One read-only POST, exposed as `bi kitchen-performance details list`.
Required locRef/busDt; optional transSinceUTC/searchCriteria/include/applicationName.
Use the existing transaction date/cursor validator with a KDS descriptor, not the
five-field daily validator which intentionally rejects transSinceUTC. All execution
uses executeQuery, preserving pinned company and one input read across renewal.

No KDS writes, guessed scope, native RVC/station/check selectors, changedSinceUTC,
open/closed dates, polling, cursor persistence/advancement, deduplication or KPI math.
Keep exact numbers, order/suborder relationships, units and UTC/local timestamps.
Do not alias actualPrepTimeinSecs/example actualPrepTimeInSecs or manufacture fields
omitted according to descriptions despite contradictory required lists.

Acceptance: all six fields, calendar/cursor limits, unsupported input before renewal,
JSON/file/stdin/overrides/exact precision, ID-token rotation, pinned identity, quiet/
notices, verbatim dates/fields, complete large/error exports and no retry/redirect.
Include 128 MiB plain/compressed streams and actual installed-package checks.

Live: 13 probes at one date/three approved locations. Two populated order results,
one empty; RVC filters selected one from two baseline RVCs. Offsetless seconds and
fractions accepted; trailing Z rejected 400/33205 unchanged. JSON/file/stdin,
applicationName, quiet, projections and hash-verified file delivery succeeded.
Malformed filter returned 400/33214. Suborders were absent from tested projections;
populated suborders, nested filtering, cursor selectivity/boundaries and preparation
field spelling remain live-unverified. No numerical reconciliation or scope expansion.
