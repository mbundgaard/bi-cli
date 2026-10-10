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
- `src/daily-commands.ts`, `src/daily-requests.ts`: eleven regular daily totals,
  explicit locRef/busDt validation and shared query execution.
- `src/areas/`: one module for each of the nine Oracle task areas, plus typed registry.
- `tests/`: synthetic local mocks; the unpackaged runner injects an isolated StateStore.
- `scripts/package-smoke.mjs`: package allowlist and actual installed shim checks.

The npm package remains private/unpublished. Source is hosted at `mbundgaard/bi-cli`.
GitHub repository visibility is independent of package.json's private flag; verify
it separately before assuming source is private. No release, feedback service or
publishing workflow is authorized by implementation work. Update lookup targets only the
BI package on npm; unavailable is expected until a real release exists. CI configuration validates
Windows/macOS/Linux with Node 22/24; that is not proof those remote jobs have run.
Provider-owned catalog publication should follow STS once there is a real BI release.

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
contract fixtures and synthetic tests. Control totals and quarter-hour totals remain
planned, so aggregation metadata explicitly reports partial implementation. Daily
functionality spot checks passed on all eleven routes using narrow projections.
Job-code results were empty; populated payroll behavior and numerical reconciliation
remain unverified. No accounting comparison or other deployment support is inferred.

Future work: implement control/quarter-hour totals and the remaining six areas using their BI contracts,
not STS endpoint builders. Preserve unknown request fields and numeric precision.
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
Large-response tests verify dimension, transaction and daily-total 128 MiB plain/compressed streams, hashes, boundaries,
error exit codes, cancellation, storage failures and private-file cleanup. Auth stays
on its internal buffered parsing path, never the data export path.
Only help/version/parser checks use the production installed shim; stateful integration
tests use internal injection. Keep test fixtures synthetic and outside the package.

Reference: https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/index.html
