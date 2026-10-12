# Kitchen performance

`bi kitchen-performance details list` reads existing KDS orders and suborders via
`POST /bi/v1/{orgIdentifier}/getKDSDetails`. No bump, recall, priority, routing or
station writes; no performance calculations, reconciliation or automatic polling.

## Request fields

| Oracle field | CLI flag | Requirement |
|---|---|---|
| `locRef` | `--loc-ref` | Required nonblank string, maximum 99 characters |
| `busDt` | `--business-date` | Required actual calendar date, YYYY-MM-DD |
| `transSinceUTC` | `--trans-since-utc` | Optional UTC transaction-activity cursor |
| `searchCriteria` | `--search-criteria` | Optional nonblank string, maximum 2000 |
| `include` | `--include` | Optional nonblank string, maximum 2000 |
| `applicationName` | `--application-name` | Optional nonblank string, maximum 128; 20.1.10+ |

Oracle uses `kdsRequestPayload`, not the five-field totals/cash/fiscal requestPayload.
Its busDt description incorrectly mentions cash management; the endpoint description
and request example explicitly select KDS activity for a location/business date.

No native RVC, station, check, time-window, open/closed-date or changedSinceUTC selector.
No default location/date, date range, all-location mode or implicit discovery. Other
unknown JSON fields survive without being endorsed as documented selectors.

```sh
bi kitchen-performance details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
bi kitchen-performance details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.orders.serviceRoundNum,revenueCenters.orders.startTimeUTC"
bi kitchen-performance details list --file request.json --dry-run
```

Replace placeholders with authorized values. JSON (`--json`) and file/stdin (`--file`,
`-` for stdin) use Oracle field names. Flags override matching fields only. Input is
read once before due renewal; unknown fields and exact numeric values survive.
`--quiet` suppresses HTTP diagnostics/update checks, not data or errors. `--timeout`
is seconds per request, default 30, greater than zero and at most 300. Help/local/dry-run
stay offline; dry-run prints supplied request data but omits authorization.

## Cursor and filters

The optional `transSinceUTC` selects activity within the explicit business date; it
never replaces that date and is not a cloud changedSinceUTC cursor. Local validation
accepts `YYYY-MM-DDTHH:mm:ss[.fraction][Z]`, validates the calendar/clock, rejects offsets
and forwards the exact spelling. No conversion, rounding, silent Z removal, persistence,
advancement, deduplication or data retries. Consumers must establish overlap/completeness
semantics; the CLI does not infer boundary inclusivity from a returned startTimeUTC.

The tested KDS deployment accepted offsetless seconds, .000 and seven-digit fractions;
trailing Z returned HTTP 400/code 33205. Recommend offsetless UTC. This verifies syntax
acceptance, not precision, cursor selectivity or boundary semantics.

RVC filtering can use `where equals(revenueCenters.rvcNum,<rvc-number>)` via
`--search-criteria`. Filters are forwarded unchanged, never dropped on error. `--include`
replaces the default projection; retain the identifiers/metadata needed by consumers.
RVC filtering worked against two-RVC results at two scoped locations. Nested order/
suborder filtering is not established; do not assume sibling pruning or unchanged parents.

## Response interpretation and privacy

The documented structure is `revenueCenters[].orders[].subOrders[]`.

- Keep order/station/service-round/suborder relationships. A guestCheckId alone need
  not identify one KDS order; returned order counts are not unique guest-check counts.
- Preparation fields are documented in seconds. Preserve values; do not calculate
  averages, reconstruct elapsed time, rank staff/stations or infer service-level compliance.
- `startTime` is deprecated in favor of `startTimeLcl`. `startTimeUTC`, `startTimeLcl`
  and suborder `postTimeLcl` are documented from 20.1.9.6. Keep local/UTC values distinct;
  no timezone/DST assumptions or renaming. Start/post times are not request date selectors.
- Suborder schema `actualPrepTimeinSecs` differs from example `actualPrepTimeInSecs`.
  This is a documentation discrepancy, not a live-confirmed alias. Preserve actual names.
- Schema required lists conflict with descriptions that allow false/zero/null fields
  to be omitted. Do not manufacture false flags, zero recalls or empty child arrays.
- Guest-check identifiers, station names and modifier text may be sensitive. Use narrow
  projections for live tests and do not publish unreviewed exports or customer records.

## Scoped live validation

Thirteen explicit probes covered one authorized date at three authorized locations.
All three location reads succeeded: two returned populated order data and one was empty.
RVC filters on both populated locations selected one RVC from a two-RVC baseline.
JSON/file/stdin, applicationName, quiet output and replacing projections worked.
Larger bodies were privately exported and hashes verified. Deliberately malformed
filter syntax returned HTTP 400/code 33214/exit 11; trailing-Z cursor rejection is above.

No suborders were returned by the narrow tested projections; populated suborder data,
modifier text, prep-time spelling, nested filters and cursor boundaries remain unverified.
Empty data does not prove KDS is disabled or complete. No scope expansion to find records,
financial reconciliation, KPI validation or live mutations were performed.

## Shared execution and tests

KDS reuses the transaction date/cursor validator with a KDS-specific endpoint descriptor,
and `executeQuery` for pinned BI company, one input read, due renewal, ID tokens,
verbatim response delivery and advisory update notices. No STS state or credentials.

[Response delivery](RESPONSES.md): at most 16 KiB AND 500 lines stays exact stdout;
exceeding either bound saves the complete private response with a compact file receipt.
Errors retain their exit codes. No parsing, redaction, truncation, redirects or retries.
Files remain until explicitly deleted; nothing is installed automatically.

Synthetic tests cover all six fields, strict scope/date/cursor validation, unsupported
selectors, exact numbers, untouched response names/times/missing fields, JSON/file/stdin,
renewal, pinned identity, quiet/notices, error exports and 128 MiB plain/compressed streams.
Installed-package checks exercise help, inventory and an isolated six-field dry-run.
These do not establish deployment-wide semantics or populated suborder compatibility.

Reference: [Oracle KDS details](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getkdsdetails-post.html).
