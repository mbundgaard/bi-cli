# Contributing

Use Node.js 22+. Read docs/DEVELOPMENT.md, run `npm ci`, `npm test` and
`npm run test:package`. Keep implementation in TypeScript, tests in Node's built-in
runner, and changes focused. Use UTF-8/LF and two-space indentation.

Tests must use synthetic data and local mocks. Never put credentials, tenant data,
token responses or private screenshots in source control or public reports. Live
operations need explicit scope/authorization; authentication success alone does not
establish data permissions. Do not share state with STS.

Keep command help, docs and tests synchronized. Review package allowlists and actual
installed shims before claiming packaging complete. Do not claim native cross-platform
or live validation solely because CI is configured. Maintainers authorize commits,
remote setup and publishing separately. The scaffold is private/unpublished.

Contributions use the MIT license in LICENSE. Security contact: support@muneris.dk.
