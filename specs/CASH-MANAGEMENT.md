# Cash management

Status: implemented locally, offline-tested, with scoped live functionality checks
returning empty data. See [command guide](../docs/CASH-MANAGEMENT.md).

Reviewed the operation description, example, request schema and all referenced response
schemas in Oracle Swagger 2025.09.22, SHA-256
`ca16ae423d03a81d5aa6316f530f09e9de0e7cd64d53679ea4fa287d80da2ec9`.
Public request-only fixture: tests/fixtures/cash-management-contract.json. No tenant
payloads, private dumps or credentials in tests/source/packages.

## Contract

- One read-only operation: POST /bi/v1/{orgIdentifier}/getCashManagementDetails.
- CLI: bi cash-management details list. No arbitrary endpoint or business-write verbs.
- Required locRef/busDt; optional searchCriteria/include/applicationName, matching the
  five-field requestPayload shared with regular daily and quarter-hour totals.
- Shared body validation and executeQuery lifecycle, not aggregation-specific behavior.
  No implicit RVC/employee/receptacle/date selection or since-cursor support.
- JSON/file/stdin read once, flags override matching fields, unknown fields/exact numbers
  survive. Validate before renewal, pin company, persist rotations, preserve output/errors.
- Response codes, missing fields, amounts, UTC/local times and actBusDate remain untouched.
  Do not infer balances, label numeric codes, reconcile transfers or fetch related checks.

## Acceptance and observations

Synthetic validation, all five request fields, precision, input modes, due renewal,
pinned company identity, notices/quiet, large responses and errors/no retry tests.
128 MiB plain/compressed streams and installed-package checks cover shared delivery.

Scoped live requests returned HTTP 200 with an empty RVC array. JSON/file/stdin,
applicationName, quiet and projections were accepted. Malformed filtering returned
400/33214 and exit 11. Populated data, RVC/child filtering and completeness remain
unverified. No financial reconciliation, scope expansion or publication was performed.
