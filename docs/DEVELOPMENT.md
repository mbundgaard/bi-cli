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
- `src/auth.ts`: Oracle PKCE, cookie preservation, ID tokens, explicit refresh.
- `src/state.ts`: fixed user paths, BI schema, locking, atomic persistence/recovery.
- `src/transport.ts`: verified TLS, bounded request timeouts, byte-preserving transport;
  no redirects, retries or response JSON interpretation.
- `src/output.ts`: local JSON and exit codes.
- `src/areas/`: one module for each of the nine Oracle task areas, plus typed registry.
- `tests/`: synthetic local mocks; the unpackaged runner injects an isolated StateStore.
- `scripts/package-smoke.mjs`: package allowlist and actual installed shim checks.

The package is explicitly private while scaffold work is underway. No remote, release,
update/feedback service or publishing workflow is assumed. CI configuration validates
Windows/macOS/Linux with Node 22/24; that is not proof those remote jobs have run.
Provider-owned catalog publication should follow STS once there is a real BI release.

## BI-specific contracts

- Use `id_token`, not STS `access_token`; do not share state or infer cross-API permission.
- Treat client IDs as opaque and preserve padding/case. Require explicit enterprise shortname.
- Preserve the cookies returned by Oracle; do not recreate the STS 0.4.0 login-cookie bug.
- Numeric-string token lifetimes must be supported without guessing expiry durations.
- Token response bodies/reset tokens may contain secrets even on failure; allowlist diagnostics.
- No live account/POS/data testing until exact credentials, scope and operations are approved.

Future work: implement the nine areas separately using Oracle's JSON POST query contracts,
not STS endpoint builders. Explicit location/date selection, `searchCriteria` and `include`
need endpoint-specific validation. Preserve unknown request fields and numeric precision.
Distinguish business dates from UTC change cursors. Never turn a location-scoped request
into organization-wide discovery or silently query every date/location.

## Tests and package checks

All current tests run offline against loopback servers and temporary state. Package checks
may fetch dependencies from npm, but never contact Oracle or read the real user's tokens.
Only help/version/parser checks use the production installed shim; stateful integration
tests use internal injection. Keep test fixtures synthetic and outside the package.

Reference: https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/index.html
