# POS dimensions

All 16 Oracle Point of Sale Dimensions endpoints are implemented under
`bi pos-dimensions`. These are **read-only JSON POST queries**. They use the saved
BI application URL, enterprise shortname and **id_token**. No STS tokens or headers.

## Commands

Prefix each command below with `bi pos-dimensions`.

| Command | Oracle operation |
|---|---|
| `cash-management-items list` | `getCashManagementItemDimensions` |
| `cashiers list` | `getCashierDimensions` |
| `discounts list` | `getDiscountDimensions` |
| `employees list` | `getEmployeeDimensions` |
| `job-codes list` | `getJobCodeDimensions` |
| `latest-business-date get` | `getLatestBusDt` |
| `locations list` | `getLocationDimensions` |
| `menu-item-prices list` | `getMenuItemPrices` |
| `menu-items list` | `getMenuItemDimensions` |
| `order-channels list` | `getOrderChannelDimensions` |
| `order-types list` | `getOrderTypeDimensions` |
| `reason-codes list` | `getReasonCodeDimensions` |
| `revenue-centers list` | `getRevenueCenterDimensions` |
| `service-charges list` | `getServiceChargeDimensions` |
| `taxes list` | `getTaxDimensions` |
| `tender-media list` | `getTenderMediaDimensions` |

Every request targets `/bi/v1/{orgIdentifier}/{operation}`. `bi endpoints` lists the
implemented method/path/scope mappings without contacting Oracle.

## Location scope

All calls require an explicit `locRef` string, supplied through `--loc-ref` or JSON.
Leading zeros are preserved; the CLI never guesses or converts a reference to a number.
Location dimensions also support organization-wide discovery, but only with an explicit
`--all-locations` flag. This conflicts with any `locRef`, including one in JSON input.

```sh
bi pos-dimensions revenue-centers list --loc-ref "<location-reference>"
bi pos-dimensions locations list --loc-ref "<location-reference>"
```

The following is organization-wide, **not** a location-scoped test:

```sh
bi pos-dimensions locations list --all-locations --include locations.locRef
```

Location information and employee dimensions can contain personal/customer data.
Read-only does not mean appropriate to publish. Do not put responses in source control,
fixtures, issue reports or feedback.

## Filters and projection

**Deployment exception:** `latest-business-date get` rejects nonempty `include` and
`searchCriteria` with HTTP 400/code 33205 in the tested deployment, even though Oracle's
Swagger declares both fields. Omit these options for that call. The CLI retains the
options for other deployments and forwards explicit inputs unchanged, without silently
dropping them or falling back to an unfiltered request.

- `--search-criteria <expression>` becomes `searchCriteria` without rewriting it.
- `--include <fields>` becomes `include`. This is projection: it overrides the default
  response field set, not an additive request for extra columns.
- Nested fields need their parent prefixes.
- `--application-name <name>` optionally sends `applicationName` (maximum 128 characters;
  documented as first available in 20.1.10). It is not sent by default.

```sh
bi pos-dimensions locations list --all-locations --search-criteria "where equals(locations.locRef,'<location-reference>')" --include locations.locRef
```

The tested Oracle deployment requires the `where` prefix: the otherwise-identical
bare `equals(...)` request returned HTTP 400/code 33204, while `where equals(...)`
returned only the selected location. Oracle's guide mixes examples with and without
this prefix. The CLI deliberately forwards your expression unchanged; it does not
add/remove `where`, quote values, repair grammar or retry a rejected expression.

The guide documents comparisons such as `equals`, `equalsIgnoreCase`, `greaterThan`,
`lessThan`, `isNull`, `contains`, `startsWith`, `endsWith`, AND/OR, grouping and negation.
Strings need quoting and filters must use fields/types appropriate to that endpoint.
Do not assume each example field exists in every response.

Live comparisons against independently filtered baseline records verified `equals`,
`equalsIgnoreCase`, `greaterThan`, `lessThan`, `isNull`, `contains`, `startsWith`,
`endsWith`, AND and OR. Negation worked as `where !equals(parent.field,value)`.
The guide's `!(equals(parent.field,value))` form returned HTTP 400/code 33218 even with
`where`. The CLI must not silently rewrite either form.

## Menu item price dates

```sh
bi pos-dimensions menu-item-prices list --loc-ref "<location-reference>"
bi pos-dimensions menu-item-prices list --loc-ref "<location-reference>" --effective-from 2025-01-01 --effective-to 2025-01-31
```

Without dates Oracle returns active prices. `--effective-from` and `--effective-to`
map to `effFrDt` and `effToDt`. Either can be supplied. Oracle documents the former as
selecting prices starting on/after the date, and the latter as selecting prices ending
on/before the date. The CLI validates real YYYY-MM-DD dates and ordering; it does not
convert them to UTC or expand them into timestamps.

**Do not treat both dates as an as-of pricing snapshot.** Oracle describes an inclusive
effective range, but a live same-day query at the returned business date produced no
rows even though the undated query contained active prices starting before that day
with no end date. A range using an observed price start date did return rows. This
contradicts an interval-overlap interpretation; the precise server selection rule is
not established. The CLI forwards dates unchanged and does not reconstruct a snapshot.

An upper-bound-only query also returned substantially more historical rows than the
undated active-price query. Use an explicit projection when you only need selected
fields, and do not infer completeness or current validity from HTTP 200 or row counts.

Oracle documents a last-three-years limit relative to the current business date.
Live boundary probes rejected a date four years in the past but accepted an upper bound
four years in the future. That policy remains server-validated: the CLI does not infer
the business date from the local clock or perform hidden queries.

`latest-business-date get --loc-ref <reference>` explicitly obtains the location's
`latestBusDt` when you need it. It is not automatically chained into price queries.

## JSON, files, stdin and previews

```sh
bi pos-dimensions menu-items list --json '{"locRef":"<location-reference>","include":"locRef,menuItems.num,menuItems.name"}'
bi pos-dimensions menu-items list --file request.json
bi pos-dimensions menu-items list --file -
bi pos-dimensions menu-items list --loc-ref "<location-reference>" --dry-run
```

`--json` and `--file` are mutually exclusive; `--file -` reads stdin. Bodies must be
JSON objects. Explicit flags override the corresponding fields: `locRef`,
`searchCriteria`, `include`, `applicationName`, `effFrDt`, `effToDt`. Other fields survive
unchanged, including exact JSON numeric values; unsupported future fields may still be
rejected by Oracle. Known CLI fields are type-validated. Effective-date fields are
restricted to the price endpoint.

Dry-run is a local JSON preview. It needs the configured application URL and enterprise
shortname, but does not need tokens or contact Oracle. Authorization is omitted. The
body itself is shown, so treat previews as potentially sensitive.

## Output, failures and validation

Responses remain verbatim, including errors, whitespace, numeric precision and
non-JSON bodies. Up to 16 KiB and 500 lines go unchanged to stdout. Above either limit,
the complete decoded body is saved privately and stdout contains only a small JSON
file reference. There is no response parsing, redaction, truncation or mode flag.
HTTP compression is decoded as transport processing. Interrupted responses produce
no body/receipt. See [Response delivery](RESPONSES.md) for agent/script handling,
private storage, retained files and failure behavior.

Diagnostics go to stderr; `--quiet` suppresses HTTP status lines, not local errors or
response bytes or file references. `--timeout` defaults to 30 seconds and supports up to 300 seconds.
There are no automatic data retries, redirects, date ranges or location loops.
Before data calls, all due company profiles renew according to the shared auth
schedule; expired token sets are removed without renewal. After successful non-quiet
calls, a daily npm update check may notify on stderr. Help/local/dry-run stay offline.
See [Authentication](AUTHENTICATION.md) and [Commands](CLI.md).
HTTP 401 exits 9; other API non-success exits 11. See [Commands](CLI.md) for all codes.

Validation performed: synthetic endpoint/body/precision/response/error tests, plus
live organization-wide location discovery and all 16 scoped calls at one returned
location. All 16 baseline calls returned HTTP 200. Live tests also verified a
where-prefixed location filter/projection and accepted an explicit price-date range
based on the returned business date. This does not prove every record, filter operator,
location or date range is correct, nor availability in every Oracle deployment.
A subsequent option matrix exercised all 16 operations, projection/quiet, filters,
application name, custom timeout, JSON/file/stdin across the three request schemas,
price-date combinations and local dry-run. Failure/deadline/validation tests use mocks.
The compatibility exceptions above are observed API/documentation differences, not
claims of universal behavior across Oracle versions. Empty cash-management-item,
cashier and job-code arrays can be successful responses; they do not alone indicate a
CLI failure. No customer response bodies or live identifiers are included in tests or
this guide.

References:
- [Point of Sale Dimensions](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/api-point-sale-dimensions.html)
- [Search and Include](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/search_include.html)
- [Swagger](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/swagger.json)

The checked-in test contract is a request-schema subset of Oracle Swagger version
`2025.09.22`; it records its source URL/hash and contains no live data. It is excluded
from the npm package. Review upstream changes before changing endpoint behavior.
