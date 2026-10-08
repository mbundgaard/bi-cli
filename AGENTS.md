# Agent guide

BiCli is a TypeScript/Node 22+ Oracle Simphony Business Intelligence CLI. Read
CONTRIBUTING.md and docs/DEVELOPMENT.md before changing implementation.

- Implemented: authentication and all 16 pos-dimensions calls. Eight other data
  areas remain help-only. Do not claim planned operations are implemented.
- Three pillars: safe auth/tokens, explicit requests, verbatim API data. Data bodies
  above 16,384 decoded bytes OR 500 lines are saved unchanged; stdout returns a compact
  file receipt. Smaller bodies remain exact stdout bytes. All data calls must use
  src/responses.ts. No output-mode flags, agent detection or silent truncation.
- Local commands keep JSON envelopes; diagnostics go to stderr. HTTP error exit codes
  survive file delivery. Auth responses never go through data export handling.
- BI uses id_token, not access_token. Client IDs are opaque; enterprise shortname is
  explicit. Preserve Oracle cookies, client-ID padding and username case.
- State belongs in fixed per-user BiCli application data, separate from STS. No
  application environment-variable configuration or user-facing directory override.
- Passwords are used for login only. Use supplied credentials for authorized login;
  do not save/echo them or infer password expiry from HTTP 401 alone.
- Before data calls, renew all due company profiles: success +24h, failure +1h.
  Remove known-expired token sets without refresh, preserving configuration/selection.
  No data retries, redirects or TLS bypass. Lock auth mutations and persist each
  rotated token set atomically. Preserve complete recovery copies on rename failure.
- Keys are explicit enterpriseShortname@lowercaseAuthHostname; never decode the client
  ID or guess from shorthand. Pin the active key per operation. Select/delete require
  exact keys; confirm deletion intent. Successful login saves/selects; failed login
  preserves profiles. Config prepares login without changing saved tokens. Duplicate
  same-user/company/hostname logins report saved expiry rather than authenticating again.
- Successful non-quiet data calls check npm at most once per 24h (1-second timeout),
  notifying only on stderr when newer. No automatic installs or data output/exit changes.
  Local/help/auth/dry-run commands stay offline. bi version --check forces a lookup;
  unavailable does not mean current. BI remains private until separately authorized.
- Do not commit, push, publish, create releases or delegate unless requested.
- Never reuse STS credentials/tokens or invoke live BI calls without user authorization.
- Location discovery requires explicit --all-locations when locRef is omitted.
  Never turn location-scoped approval into organization-wide queries. Do not guess
  location references or business dates. Preserve searchCriteria verbatim; the tested
  deployment requires a where prefix. --include is projection, not additive.
- Tests use synthetic loopback mocks and internal isolated stores. Never place secrets,
  tenant data, API dumps or local references in source, tests, docs or npm packages.
- /references/ and generated dist/node_modules are ignored; never publish their contents.
- Keep docs/help/tests aligned. UTF-8, LF, two spaces, no em dashes in new project content.
- Before declaring ready: npm test; npm run test:package; node bin/bi.js --help.

Nine groups: aggregations, cash-management, fiscal-transactions, kitchen-performance,
labor, payment-dimensions, payment-transactions, pos-dimensions, pos-transactions.
