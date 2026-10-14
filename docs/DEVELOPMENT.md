# Development

Node.js 22+; TypeScript ESM. Follow STS's safety contracts, not its data model.

```sh
npm ci
npm test
npm run test:package
node bin/bi.js --help
```

## Layout

- `bin/bi.js`: executable npm entry point.
- `src/cli.ts`: commands and auth orchestration.
- `src/auth.ts`: Oracle PKCE, cookie preservation, ID tokens, refresh without losing rotated credentials on unknown expiry.
- `src/state.ts`: fixed user paths, BI-only schema-2 registry, schema-1 migration,
  coherent single-profile views, locking and atomic persistence/recovery.
- `src/companies.ts`: exact-key commands, duplicate-safe login, expiry removal and
  per-profile renewal schedules (+24h success, +1h failure).
- `src/updates.ts`: advisory npm lookup and daily post-success stderr notices;
  separate reservation file, no credential sharing or automatic installation.
- `src/transport.ts`: verified TLS, bounded request timeouts, byte-preserving transport;
  no redirects, retries or response JSON interpretation.
- `src/output.ts`: local JSON and exit codes.
- `src/responses.ts`: the single data delivery boundary. Up to 16 KiB and 500 lines
  stays inline; larger decoded bodies stream to private files and produce receipts.
  No response JSON parsing, agent detection, mode switch or automatic deletion.
- `src/requests.ts`: BI JSON input, field/scope validation and byte-preserving execution.
- `src/json.ts`: source-aware request JSON parsing; preserve exact number values.
- `src/query-commands.ts`: POS-dimension commands, examples and help.
- `src/transaction-commands.ts`, `src/transaction-requests.ts`: transaction commands,
  explicit date/cursor/native-selector validation, shared query execution.
- `src/daily-commands.ts`, `src/daily-requests.ts`: shared aggregation commands and
  request validation (historical filenames), serving twelve daily and eight quarter-hour
  totals through the same pinned-company executor.
- `src/cash-management.ts`: cash details commands/builder with shared location/date
  body validation and pinned-company execution; no business-write operations.
- `src/fiscal-transactions.ts`: three explicit fiscal reads using the shared five-field
  body validator and executor; country-specific responses remain opaque.
- `src/kitchen-performance.ts`: KDS-specific descriptor reuses transaction date/cursor
  validation and executeQuery; no duplicated auth/delivery lifecycle.
- `src/labor.ts`: distinct business/posted-date AND contract, employee-selector exclusivity,
  boolean adjustments and unchanged changedSinceUTC; shared executeQuery.
- `src/payment-dimensions.ts`: explicit organization-wide holder versus location account
  scope; shared execution, no date/cursor selectors or scope broadening.
- `src/payment-transactions.ts`: five distinct date contracts, account-scoped summary
  versus location reads, optional cursors only on two routes; shared execution.
- `src/areas/`: one module for each of the nine Oracle task areas, plus typed registry.
- `tests/`: synthetic local mocks; the unpackaged runner injects an isolated StateStore.
- `scripts/package-smoke.mjs`: package allowlist and actual installed shim checks.

The npm package is configured for public scoped publication as `@muneris/bi-cli`.
Source is hosted at `mbundgaard/bi-cli`; verify repository visibility separately before
assuming source is private. Update lookup targets only this BI package on npm; an
unavailable lookup is not proof the installed version is current. CI configuration
validates Windows/macOS/Linux with Node 22/24; that is not proof those remote jobs have
run. Provider-owned catalog publication should follow STS once there is a real BI release.

## Releases

Ordinary CI does not publish. `.github/workflows/publish.yml` runs only when a stable
GitHub release is published; commits, tags alone and draft releases do not publish.
The workflow is maintained inside BI, with no STS/CC repository dependency.

Configure the npm trusted publisher for `@muneris/bi-cli`:

- Provider: GitHub Actions
- Organization/user: `mbundgaard`
- Repository: `bi-cli`
- Workflow filename: `publish.yml`
- Environment: leave blank

No long-lived npm token is needed. The publishing job uses GitHub-hosted Ubuntu,
Node 24, npm 11 and `id-token: write` for OIDC, with npm provenance enabled.

1. Update package/lockfile versions and changelog, test and push the reviewed commit.
2. Tag that commit `v<version>` and publish its stable GitHub release.
3. The workflow runs tests and installed-package checks on Windows/macOS/Linux with
   Node 22/24. All six jobs must pass before publication.
4. `scripts/release-check.mjs` verifies the tag and package/lockfile versions, and
   refuses an existing npm version or an inconclusive registry response. The publish
   job builds, retests, packs and publishes that checkout using trusted publishing.
5. Verify the workflow result, npm latest/version, provenance source commit and a
   clean registry installation. Never infer publication from a pushed tag alone.

If publication is uncertain, inspect npm before any rerun. Do not fall back to
local publishing, move a released tag or republish an existing version. A missing
trusted-publisher mapping must be fixed in npm settings before retrying the failed
job; recheck version availability first. No live Oracle calls belong in releases.

## BI-specific contracts

- Use `id_token`, not STS `access_token`; do not share state or infer cross-API permission.
- Treat client IDs as opaque and preserve padding/case. Require explicit enterprise shortname.
- Preserve the cookies returned by Oracle; do not recreate the STS 0.4.0 login-cookie bug.
- Numeric-string token lifetimes must be supported without guessing expiry durations.
- Token response bodies/reset tokens may contain secrets even on failure; allowlist diagnostics.
- No live account/POS/data testing until exact credentials, scope and operations are approved.

POS dimensions now implements 16 read-only JSON POST endpoints, checked against Oracle's
Swagger version 2025.09.22. `tests/fixtures/pos-dimensions-contract.json` is a public
request-schema subset with source URL/hash, excluded from the package. It verifies
registry coverage and differences between location, ordinary and price request schemas.
Full Swagger is a reference, not a runtime dependency or a source of invented defaults.

POS transactions implements seven read-only POST calls against the same Swagger.
Its public request-schema fixture records the contradictory guest-check required-date
list; enforce exactly one date per field descriptions. Cursor spelling/precision is
preserved without local-time conversion. Scoped live results and limitations are
recorded in [POS transactions](POS-TRANSACTIONS.md): recommend offsetless UTC, never
silently strip a rejected Z suffix, and never locally prune returned sibling lines.
Tests for these behaviors use wholly synthetic fixtures, not captured customer data.
All implemented areas use `executeQuery` for pinned-company renewal, one input read, response
delivery and update notices; never duplicate that lifecycle in a new endpoint.

Regular daily totals implements eleven shared-request-schema endpoints, with public
contract fixtures and synthetic tests. Control totals adds its distinct mutually exclusive date/native-RVC contract.
Eight quarter-hour endpoints share the regular daily request schema, completing
aggregation implementation. No time conversion, gap filling or local roll-up. Daily
functionality spot checks passed on all eleven routes using narrow projections.
Job-code results were empty; populated payroll behavior and numerical reconciliation
remain unverified. No accounting comparison or other deployment support is inferred.

Control spot checks verified selectors and exposed lastUpdate versus lastUpdated
response/projection spelling differences. Preserve Oracle output and never alias fields.

Quarter-hour scoped functionality tests passed on all eight routes; slot-filtered
parents retained sibling quarters. Populated job-code data remains unverified.

Cash-management details uses the same five-field requestPayload as regular totals.
`validateLocationDateBody` centralizes those limits/known unsupported selectors; control
and transaction contracts remain separate. Scoped cash reads were empty, so populated
cash data/filter behavior remains unverified despite synthetic coverage.

Fiscal transactions adds three reads with the same requestPayload. Scoped totals
returned workstation data; invoices/control were empty. No country-specific response
interpretation, fiscal blob parsing, sequence/lock operations or compliance inference.

KDS details adds a six-field request with optional transSinceUTC. Three-location scoped
reads succeeded (two populated, one empty), RVC filters and input modes passed; suborders
and cursor boundaries remain unverified. Trailing Z was rejected; recommend offsetless UTC.

Labor time cards implements ten fields and its own either/both date and employee-selection
rules. It reuses calendar/cursor/integer validation and execution, not the transaction
exactly-one-date rule. Requires payroll preprocessing. Scoped metadata/input checks
returned empty time-card data. Populated cards, posted dates, employee filters, cursors
and adjustments remain unverified; agree scope before requesting employee/payroll data.

Payment dimensions implements two Payment Cloud Service endpoints, not SPI. Account
holders has three optional fields but requires a local --organization-wide acknowledgement;
accounts requires locRef. Both reject invented dates/cursors. Authorized status-only
live probes returned HTTP 400/33108 on both routes; data behavior remains unverified.
Preserve actual status, not a guessed 403. No organization-wide queries from location-only approval.

Payment transactions completes all 56 documented routes using distinct settlement/business/
booking/payout/record dates. Summary requires acctCode, not locRef. Only transactions and
summary support changedSinceUTC. All five are offline-tested and live-unverified.

Future work: authorized live validation and release readiness, not invented endpoints. Preserve unknown request fields and numeric precision.
Distinguish business dates from UTC change cursors. Never turn a location-scoped request
into organization-wide discovery or silently query every date/location. Search expressions
are forwarded unchanged; current live tests require the guide's where-prefixed form.

## Company orchestration

Request builders consume one BI profile, never the full registry. The execution
wrapper captures the active key, reads input once, validates before any network,
maintains all due profiles, then rebuilds with the same key's latest coherent profile.
Keep location scope, opaque client IDs, exact JSON numbers and ID-token selection.

Config stages login without replacing profiles. Successful login saves/selects its
key; same-key/username duplicates report expiry. Recheck renewal after locking and
persist each company separately. Keep save failures outside the Oracle-failure catch,
so local persistence errors never become a one-hour retry event. Known-expired token
sets are removed without refresh; unknown expiry remains unknown and is not renewed.
Schema 2 has an explicit BI product marker; reject STS registries and token fields.

Automatic update checks run after successful non-quiet delivery with a 1-second
network timeout and separate daily reservation. They never affect BI output/exit codes.
Unpackaged test runners inject a disabled notifier; updater tests inject synthetic
registry responses. Help/local/auth/dry-run and failed data calls must not trigger it.

## Tests and package checks

All current tests run offline against loopback servers and temporary state. Package checks
may fetch dependencies from npm, but never contact Oracle or read the real user's tokens.
Large-response tests verify dimension, transaction, daily, quarter-hour, cash-detail, fiscal, KDS, labor and both payment-dimension and all five payment-transaction 128 MiB plain/compressed streams, hashes, boundaries,
error exit codes, cancellation, storage failures and private-file cleanup. Auth stays
on its internal buffered parsing path, never the data export path.
Only help/version/parser checks use the production installed shim; stateful integration
tests use internal injection. Keep test fixtures synthetic and outside the package.

Reference: https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/index.html
