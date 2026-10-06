# Changelog

## Unreleased

- Scaffold TypeScript/Node CLI with nine Oracle BI task areas and daily/quarter-hour
  aggregation subdivisions. Data query commands are not yet implemented.
- Implement PKCE S256 login, verbatim Oracle cookies, BI id_token storage, explicit
  refresh, token rotation and safe auth diagnostics.
- Add separate fixed per-user BI state, schema validation, atomic persistence, locks,
  complete recovery copies, local status/show and protected restore.
- Add offline mocks, package/shim checks and six-platform/Node CI configuration.
- Verify live BI login and subsequent refresh on Windows, including persisted token
  rotation. No BI data queries or data-permission validation performed.
