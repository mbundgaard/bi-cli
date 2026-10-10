# Changelog

## Unreleased

- Implement seven POS-transaction read-only POST commands: guest checks, non-sales,
  journal logs, waste, check/line-item extensibility and SPI payments. Require explicit
  location and date, preserve unknown fields and exact numbers, and validate native
  selectors/cursors without defaults or automatic date/location loops.
- Require exactly one guest-check date despite Swagger's contradictory required list.
  Distinguish cloud-change and transaction-time cursors, forwarding UTC spelling and
  fractions unchanged; no cursor persistence, polling, aggregation or reconciliation.
- Share pinned-company renewal, one-read JSON/file/stdin input, response delivery and
  update notices across dimensions/transactions. Add schema, selector, error, package
  and 128 MiB plain/compressed transaction-stream tests. Authorized scoped live reads
  covered all seven endpoints; empty line-item extensibility leaves its populated-data
  behavior unverified. No publication was performed.
- Document live compatibility: offsetless UTC seconds/fractions accepted, trailing Z
  rejected by all four cursor endpoints, inclusive non-sales/waste cursor boundaries,
  and nested guest-check predicates retaining nonmatching sibling lines. Preserve
  caller input and Oracle output; never normalize/retry a rejected cursor or locally
  prune returned child arrays. Add synthetic regressions for those guarantees.

- Mirror STS company management with BI-specific identity: explicit enterprise
  shortname plus lowercase auth hostname, opaque client IDs and ID tokens only.
  Add exact-key list/status/select/delete, active-only logout, schema-1 migration
  to a BI-only schema-2 registry, staged config and duplicate-login detection.
  Successful login saves/selects; failed login preserves profiles and selection.
- Before data calls, renew all due profiles (+24h success, +1h failure), persisting
  rotations separately under lock. Remove expired token sets without refreshing;
  retain configuration and selection. Manual refresh bypasses cooldown for all
  profiles. Pin the active key and read input once to prevent cross-company mixing.
- Preserve rotated credentials when optional expiry metadata is unusable, reporting
  unknown expiry instead of guessing. Actual expiry comes from Oracle, not a fixed TTL.
- Add explicit `bi version --check` and daily update notices after successful
  non-quiet data calls. Use a 1-second automatic lookup timeout, stderr-only notices
  and isolated local scheduling; never install updates or change data output/exit codes.
  Help/local/auth/dry-run commands stay offline; failures remain advisory. BI remains
  private/unpublished and npm may report unavailable until publication is authorized.
- Add offline tests for company migration/isolation, renewal/backoff/expiry, lock
  rechecks, full-registry recovery, pinned selection and update-notice behavior.
  These changes do not authorize or claim new live BI testing or publication.

- Scaffold TypeScript/Node CLI with nine Oracle BI task areas and daily/quarter-hour
  aggregation subdivisions; seven areas remain planned after adding transactions.
- Implement all 16 POS-dimension read-only POST calls, explicit location/all-location
  scope, Oracle search/projection, menu-price dates, JSON/file/stdin input and dry-run.
  Preserve raw response bytes and exact request numbers; no data retries or redirects.
- Cross-check paths/request fields against Oracle Swagger version 2025.09.22.
- Verify all 16 scoped calls and organization-wide location discovery live on Windows.
  Also verify where-prefixed filtering/projection and an explicit menu-price date range.
  The tested deployment rejects bare equals(...) filters; expressions remain verbatim.
- Broader live option comparisons found Oracle compatibility differences: latest-business-date
  rejects include/searchCriteria despite Swagger, negation requires !equals(...) rather
  than !(equals(...)), and price-date ranges are not reliable as-of snapshots.
  Document the observed behavior without dropping options or rewriting requests.
- Centralize automatic verbatim data delivery: above 16 KiB or 500 decoded lines,
  stream to a protected retained file and return a compact JSON reference. Smaller
  responses stay inline; error exit codes remain unchanged. No mode flags or truncation.
  Auth parsing/persistence remains separate. This changes stdout for large responses.
- Verify threshold/compression/error/cleanup cases, Windows file protection and exact
  128 MiB response hashes with bounded memory; update agent/script guidance.
- Add offline coverage for absolute query deadlines, option boundaries, UTF-8 BOM input,
  explicit overrides and unchanged unsupported-field responses.
- Implement PKCE S256 login, verbatim Oracle cookies, BI id_token storage, explicit
  refresh, token rotation and safe auth diagnostics.
- Add separate fixed per-user BI state, schema validation, atomic persistence, locks,
  complete recovery copies, local status/show and protected restore.
- Add offline mocks, package/shim checks and six-platform/Node CI configuration.
- Verify live BI login and subsequent refresh on Windows, including persisted token
  rotation. Data-query testing does not imply access to untested locations or areas.
