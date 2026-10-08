# POS transactions: implementation overview

Status: proposal, not implemented. This overview covers the seven endpoints in
Oracle's Transactions task area. It does not authorize a scheduler, reconciliation
engine, local warehouse, automatic discovery, token refresh or live writes.

References were read directly from Oracle's documentation and cross-checked against
Swagger version 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
The five linked use cases were read as illustrations, not binding workflows.
No live transaction calls were made while preparing this overview.

## 1. Endpoint and proposed command inventory

Every endpoint is a read-only POST to `/bi/v1/{orgIdentifier}/{operation}`.
Every request requires an explicit location and business-date selection. There is
no organization-wide transaction command or automatic date/location loop.
Prefix each proposed command with `bi pos-transactions`.

| Proposed command | Oracle operation | Date selection | Other dedicated request fields |
|---|---|---|---|
| `guest-checks list` | `getGuestChecks` | Exactly one of `opnBusDt`, `clsdBusDt`, `busDt` | `rvcNum`, `clsdGuestChecksOnly`, `changedSinceUTC` |
| `non-sales list` | `getNonSalesTransactions` | `busDt` | `transSinceUTC` |
| `journal-logs list` | `getPOSJournalLogDetails` | `busDt` | None |
| `waste list` | `getPOSWasteDetails` | `busDt` | `transSinceUTC` (20.3+) |
| `guest-check-extensibility list` | `getGuestCheckExtensibilityDetails` | `opnBusDt` | None |
| `guest-check-line-item-extensibility list` | `getGuestCheckLineItemExtDetails` | `busDt` | None |
| `spi-payments list` | `getSPIPaymentDetails` | `busDt` | `changedSinceUTC` |

SPI payments requires 20.1.11+ and applies to Simphony Payment Interface customers,
not Oracle MICROS Payment Cloud Service customers. It is not a replacement for the
separate payment-transactions area. Empty data can reflect deployment/configuration;
it is not proof of a CLI defect or of complete payment coverage.

## 2. Proposed option mapping and validation

Retain the existing query conventions: `--loc-ref`, `--search-criteria`, `--include`,
`--application-name`, `--json`, `--file` (including `-` for stdin), `--dry-run`,
`--quiet` and `--timeout`. Explicit flags override matching input-body fields.
Unknown fields and exact JSON numbers survive. Responses remain unparsed raw bytes.

New options, registered only on the applicable endpoints:

| Proposed flag | JSON field | Meaning |
|---|---|---|
| `--business-date <YYYY-MM-DD>` | `busDt` | Endpoint-specific business date |
| `--open-business-date <YYYY-MM-DD>` | `opnBusDt` | Open/reopen business date |
| `--closed-business-date <YYYY-MM-DD>` | `clsdBusDt` | Closed/reopen-closed business date |
| `--rvc-num <integer>` | `rvcNum` | Native guest-check RVC selector |
| `--closed-only <true|false>` | `clsdGuestChecksOnly` | Explicit guest-check closed-only setting; omitted by default |
| `--changed-since-utc <timestamp>` | `changedSinceUTC` | Guest-check/SPI change cursor |
| `--trans-since-utc <timestamp>` | `transSinceUTC` | Non-sales/waste transaction-time lower bound |

Important rules:

- Validate real calendar dates, without local-clock defaults or UTC conversion.
- For guest checks, require exactly one date selector. `busDt` is documented as
  the union of checks whose open or closed business date matches (20.1.10+).
  Open, closed and union selections are not interchangeable accounting views.
- Native guest-check `rvcNum` is documented from 20.1.9.7. It is not a generic
  top-level field on the other six endpoints; use their filter paths instead.
- Validate explicit booleans, integer RVC values and known string lengths:
  location 99, search/projection 2000, application name 128 characters.
  Do not invent a numeric maximum from Swagger's numeric `maxLength` annotation.
- Validate cursor timestamps without interpreting Oracle's documented offsetless
  UTC values as machine-local time. Preserve accepted input spelling. Establish
  supported precision and explicit-Z behavior during implementation/testing.
- A since-cursor does not replace the required business date and is not an upper
  bound, a date range, or permission to fetch other dates.
- No automatic cursor persistence/advancement, polling, lookback, fallback or retry.
- JSON input must enforce the same known-field/date-combination rules as flags.
- Dry-run needs configured addressing, but no token or network. Show exact scope,
  date fields and request body without authorization.

## 3. Filtering and projection

All seven request schemas declare `searchCriteria` and `include`. Their actual
support and nested-array behavior must be verified, not inferred from Swagger alone.
POS-dimension testing showed why: one endpoint rejected those declared fields.

Use explicit predicates and narrow projections, not hidden filters or truncation.
Examples below are field paths from the schemas, not claims of live validation.

| Endpoint | Useful filter paths |
|---|---|
| Guest checks | Native `rvcNum`; `guestChecks.guestCheckId`, `.chkNum`, `.empNum`, `.clsdFlag`; line-item paths under `guestChecks.detailLines` |
| Non-sales | `nonSalesTransactions.rvcNum`, `.transType`, `.tmedNum`, `.guestCheckId`, `.empNum` |
| Journal logs | `revenueCenters.rvcNum`; `revenueCenters.logDetails.guestCheckId`, `.type`, `.wsNum`, `.empNum` |
| Waste | `revenueCenters.rvcNum`; `revenueCenters.menuItems.miNum`, `.rsnCodeNum`, `.empNum` |
| Check extensibility | `revenueCenters.rvcNum`; `revenueCenters.guestChecks.guestCheckId`, `.extAppId`, `.extDataName` |
| Line-item extensibility | `revenueCenters.rvcNum`; `revenueCenters.detailLines.guestCheckId`, `.guestCheckLineItemId`, `.extAppId` |
| SPI payments | `revenueCenters.rvcNum`; `revenueCenters.transactions.guestCheckID`, `.chkNum`, `.pmntType`, `.tmedNum`, `.pspRef` |

Paths are case-sensitive: SPI's schema uses `guestCheckID`, not `guestCheckId`.
Prefer stable check IDs to check numbers for identity; check numbers are not assumed
unique across RVCs/dates. Preserve large IDs without JavaScript numeric rounding.

Representative predicate forms (replace synthetic values with intended selectors):

```text
where equals(guestChecks.guestCheckId,12345)
where equals(nonSalesTransactions.rvcNum,1)
where equals(revenueCenters.rvcNum,1)
where equals(revenueCenters.logDetails.guestCheckId,12345)
where equals(revenueCenters.menuItems.miNum,12345)
```

The `where` prefix and `!equals(...)` negation worked in the tested dimensions
API; the guide's parenthesized `!(equals(...))` did not. Forward expressions
verbatim and test transactions separately. Do not insert/fix syntax silently.

A header-only guest-check projection could be:

```text
curUTC,locRef,guestChecks.guestCheckId,guestChecks.chkNum,guestChecks.rvcNum,guestChecks.opnBusDt,guestChecks.clsdBusDt,guestChecks.clsdFlag,guestChecks.lastUpdatedUTC,guestChecks.chkTtl
```

This intentionally omits detail lines. `include` replaces the default field set;
keep `curUTC` when the consumer needs the next change cursor. A detail-line export
must explicitly retain its identifiers and any relationships needed downstream.

Verify whether a nested predicate selects whole parent checks or prunes their
child arrays. A filtered detail subset is not necessarily suitable for reconciling
whole-check totals. Avoid predicates that accidentally discard combo parents,
components, tenders, voids, discounts or correction lines.

## 4. Lessons from all five use cases

### Real-time guest checks

The example makes an initial per-location/day call, then supplies the returned
`curUTC` as `changedSinceUTC` on later calls. Fifteen-minute polling is an example,
not a CLI requirement. The reconciliation guide clarifies that this check cursor
tracks creation/updates in the cloud, not just POS transaction time, so delayed
uploads and reopened checks matter.

An integration should retain the cursor only after successfully consuming the
response. Keep it scoped to the location, date selection and query definition;
changing filters/projection may require a new baseline. Returned checks can recur
as updates; do not simply append and sum each delta as new sales. The CLI does not
implement this ingestion policy or mutate returned checks.

### Reporting/data warehouse

The example discovers locations, obtains each business date, and reads operations
daily totals. Daily totals belong to aggregations, not this seven-endpoint task.
No implicit organization discovery, multi-location loop or automatic day rollover
will be added to transaction commands.

### Family-group menu sales

The example filters dimensions by family group and then queries matching item
sales from daily totals. It illustrates caller-controlled joins across areas.
Do not add a hidden dimension lookup or one-request-per-item fan-out. Selected
item predicates and projections can be useful, with the 2000-character expression
limit kept in mind. Any batching must be explicit, not inferred by the CLI.

### Reconciliation/control totals

Late postings, reopened checks and multi-day checks mean one successful read does
not establish completeness. Control totals can identify dates worth revisiting.
The example's daily refreshes, 1-14-day lookback, 2 a.m. start and midnight business
boundary are adjustable illustrations, not defaults.

Control totals belong to aggregations. They are not an automatic dependency of a
transaction read. Do not conflate their `lastTransUTC` with the check change cursor
or treat timestamps describing different events as an equality guarantee. Actual
business-day boundaries and DST must be respected by a future orchestrator.

### Combo meal sales

Preserve `comboMealSeq`, `comboSideSeq`, `comboGrpNum`, `dtlId`, `parDtlId` and line
identifiers when needed. Combo sequence identity is within a check, not a global
key. Parent/component relationships matter; summing display and aggregation
amounts indiscriminately can double-count or misclassify sales.

The example's combo daily totals belong to aggregations and exclude a-la-carte
sales. No combo roll-up or local reporting calculation belongs in this raw CLI
implementation. A dimension lookup for names is an explicit separate query.

## 5. Documentation conflicts to track

- Guest-check Swagger marks all three mutually exclusive dates required. Implement
  the individual field descriptions (exactly one selector), record the discrepancy,
  and verify each supported mode against Oracle.
- The endpoint prose mentions an open/closed date requirement but omits the newer
  `busDt` alternative; it also describes closed-only selection imprecisely. The
  schema defines a dedicated `clsdGuestChecksOnly` boolean.
- Some use cases call `getLatestBusinessDate`; the actual implemented/reference
  endpoint is `getLatestBusDt`.
- Reconciliation prose sometimes spells `curUTC` as `currUTC`. The actual response
  schema and examples use `curUTC`; do not invent a second field.
- Examples contain malformed JSON, surplus parentheses and field-name differences.
  The combo filter example uses `menuItems` where the check-line schema has the
  singular `menuItem` object.
- Waste examples use `qty`, `amt`, `cost`, while the schema defines `cnt`, `ttl`,
  `prepCost`. Verify actual response/projection behavior before promising these
  fields. Do not rename incoming response properties.
- Preserve version caveats; do not silently strip unsupported options and repeat
  a broader query after an API error.

## 6. Large-data and sensitive-data handling

The shared response-delivery prerequisite is now implemented in `src/responses.ts`.
Up to 16 KiB and 500 decoded lines stay inline. Above either threshold, bounded-memory
streaming saves the full response privately and returns a compact JSON file reference.
There are no mode flags, agent detection or automatic deletion. Transaction commands
must reuse this boundary, not introduce their own storage or truncation rules.

Only emit a body/reference after transfer/decompression succeeds. Preserve exact
response bytes in either delivery path. Storage failures must not fall back to
unbounded RAM or large stdout dumps. Auth response parsing/persistence remains separate.
See [Response delivery](../docs/RESPONSES.md) for thresholds, private storage,
cancellation, cleanup limitations and agent/script compatibility.

Make filtered/projected examples and shell output redirection easy to discover.
Keep location and date explicit. No silent size cap, field omission, truncation,
made-up pagination or automatic multi-date export. The reviewed transaction request
schemas expose no page/offset/page-size fields. Change cursors are incremental
retrieval inputs, not proof of complete historical pagination.

Journal text, check information, extensibility strings, employee references and SPI
payment metadata can be sensitive. Inline bodies and saved files are not redacted. Warn
callers to protect exports and avoid public logs, chat dumps and repository fixtures.
Use synthetic data exclusively in automated tests.

## 7. Proposed implementation order and acceptance tests

1. Shared large-response handling and dimension regressions: implemented; reuse for transactions.
2. Transaction registry/request builder, common options and date/cursor validators.
3. Guest checks: all three date modes, native RVC, explicit closed-only and change cursor.
4. Non-sales and waste, including their distinct transaction-time cursor.
5. Journal logs and both extensibility endpoints, including their nested field paths.
6. SPI payments with version/deployment and sensitive-output warnings.
7. Help, endpoint inventory, docs and package checks, followed by scoped live validation.

Offline acceptance coverage:

- All seven exact paths/methods, BI ID Bearer, explicit location and required dates.
- Mutually exclusive guest-check dates, real calendar dates, cursor syntax, boolean
  and integer types, field-length limits, flag overrides and unknown-field retention.
- No-token/network-free dry-run; JSON/file/stdin and exact numeric preservation.
- Unsupported known endpoint-specific options rejected without inventing defaults.
- Exact success/error bytes and exit codes, no data redirects/retries. Reuse shared
  company maintenance before data requests; keep auth unchanged when not due, pin
  company identity and persist due renewal/expiry cleanup safely. Local/dry-run stay offline.
- Multi-hundred-megabyte synthetic plain/compressed responses with bounded memory,
  hash equality, slow consumers, interrupted responses, decode failures, disk errors
  and private spool cleanup. Do not claim crash-proof cleanup or native-platform
  validation from mocks alone.
- Synthetic reopen/multi-day/late-arrival, nested arrays and combo-shaped fixtures to
  verify request forwarding/raw output, not to invent a client-side business engine.
- Actual installed shim/package allowlist and regression checks for dimensions/auth.

Live validation should start with an explicit location/date and small header/RVC
projections, then test selectors and cursors independently. No unbounded initial
whole-day detail dump simply to prove connectivity. Obtain real dates/references
through explicit reads; do not guess them or expose customer payloads in test artifacts.
Runtime acceptance of transaction filters and the documented mismatches is still
unverified at this planning stage.

## Sources

- [Transactions task area](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/api-transactions.html)
- [Use cases](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/use_cases.html)
- [Real-time checks](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/real_time_guest_check.html)
- [Reporting/warehouse](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/report_data_warehouse.html)
- [Family-group sales](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/get_menu_item_sales.html)
- [Reconciliation](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/reconcile_guest_check.html)
- [Combo meals](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/understanding_combo_meal_sales.html)
- [Search/include](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/search_include.html)
- [Swagger](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/swagger.json)
