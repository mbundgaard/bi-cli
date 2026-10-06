# Agent guide

BiCli is a TypeScript/Node 22+ Oracle Simphony Business Intelligence CLI. Read
CONTRIBUTING.md and docs/DEVELOPMENT.md before changing implementation.

- Initial scope: authentication and nine help-only data-area scaffolds. Never claim
  data queries work before implementing and testing them.
- Keep aligned with STS: explicit requests, raw future BI response bytes on stdout,
  local JSON envelopes, diagnostics on stderr and matching exit codes.
- BI uses id_token, not access_token. Client IDs are opaque; enterprise shortname is
  explicit. Preserve Oracle cookies, client-ID padding and username case.
- State belongs in fixed per-user BiCli application data, separate from STS. No
  application environment-variable configuration or user-facing directory override.
- Passwords are used for login only. Use supplied credentials for authorized login;
  do not save/echo them or infer password expiry from HTTP 401 alone.
- No automatic refresh, retries, redirects or TLS bypass. Lock auth mutations and
  atomically persist rotated tokens. Preserve complete recovery files on rename failure.
- Do not commit, push, publish, create releases or delegate unless requested.
- Never reuse STS credentials/tokens or invoke live BI calls without user authorization.
- Tests use synthetic loopback mocks and internal isolated stores. Never place secrets,
  tenant data, API dumps or local references in source, tests, docs or npm packages.
- /references/ and generated dist/node_modules are ignored; never publish their contents.
- Keep docs/help/tests aligned. UTF-8, LF, two spaces, no em dashes in new project content.
- Before declaring ready: npm test; npm run test:package; node bin/bi.js --help.

Nine groups: aggregations, cash-management, fiscal-transactions, kitchen-performance,
labor, payment-dimensions, payment-transactions, pos-dimensions, pos-transactions.
