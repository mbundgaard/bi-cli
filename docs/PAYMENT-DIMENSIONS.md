# Payment dimensions

Two read-only payment dimension commands are implemented and offline-tested. Both
require Oracle MICROS Payment Cloud Service, first available in 20.1.11. These are not
SPI payment metadata or STS operations. Live status-only probes were permission-rejected;
successful data behavior remains unverified.

| Command | POST operation | Scope |
|---|---|---|
| `bi payment-dimensions account-holders list` | `getPaymentAccountHolderDimensions` | Organization-wide; explicit `--organization-wide` required |
| `bi payment-dimensions accounts list` | `getPaymentAccountDimensions` | One explicit location required |

Paths are `/bi/v1/{orgIdentifier}/{operation}`. No account creation, activation,
verification, payment, refund, transfer or settlement writes.

## Explicit scope and request fields

Account holders has three documented optional request fields: include, searchCriteria,
applicationName. There is no locRef or business date. The CLI requires
`--organization-wide` even with a projection/filter or JSON/file input. This is a local
safety acknowledgement, never an API field. An empty request body is sent as `{}` when
no API fields are specified. Location-only permission is insufficient; never silently
remove locRef to make a failing holder query work. Both flag and JSON locRef are rejected.

Accounts requires nonblank string locRef (maximum 99), plus the same three optional
fields. No organization-wide/all-location mode is provided for accounts.

| Oracle field | CLI flag | Requirement |
|---|---|---|
| `locRef` | `--loc-ref` | Accounts only; required string, maximum 99 |
| `include` | `--include` | Optional nonblank string, maximum 2000; replaces defaults |
| `searchCriteria` | `--search-criteria` | Optional nonblank string, maximum 2000; unchanged Oracle expression |
| `applicationName` | `--application-name` | Optional nonblank string, maximum 128 |

No dates, effective-date ranges, cursors, native RVC, account-code or holder-code flags
are documented. Known date/cursor/RVC fields are rejected in JSON too. Other unknown
fields and exact numeric values survive without being endorsed as supported selectors.
An explicit searchCriteria is never rewritten or dropped after rejection. A filter
cannot turn account holders into a location-scoped API. No automatic account-holder joins,
location discovery, pagination, polling or hidden filtering.

```sh
bi payment-dimensions accounts list --loc-ref "<location-reference>" --dry-run
bi payment-dimensions accounts list --loc-ref "<location-reference>" --include "accounts.acctStatus" --dry-run
bi payment-dimensions account-holders list --organization-wide --include "accountHolders.acctHldrStatus" --dry-run
```

Replace placeholders with authorized values; obtain explicit approval before live
organization-wide access. These examples are offline previews, not live authorization.
`--json` and `--file` (`-` for stdin) use API fields. Flags override matching fields only;
input is read once before renewal. Putting organizationWide in JSON does not substitute
for the CLI acknowledgement. `--quiet` suppresses diagnostics/update notices, not data or
errors. `--timeout` is seconds per request, default 30, greater than zero and at most 300.
Help/local/dry-run stay offline. Dry-run omits authorization, not caller-supplied data.

## Response interpretation and privacy

Documented arrays are accountHolders and accounts; accounts also has root locRef.
Account-holder records can contain holder codes/names, settlement currency, numeric
status/verification, business email/phone/web/address and creation date. Accounts can
contain holder/account codes, account name/status, creation date and statement name.
These are Payment Cloud account dimensions, not a customer card-number collection API.

Treat identifiers, business contacts and statement names as sensitive. Use narrow
projections for live tests; never place tenant responses in fixtures or publish
unreviewed exports. Status-only projections are useful for functional validation but
omit relationships needed for consumers. Projection replaces the default field set.

Keep codes as strings with leading zeros/case, numeric statuses (including unknown
values), dates/currency and missing/null fields unchanged. No status labeling, verification
or settlement-eligibility inference, currency conversion, compliance conclusions or
response normalization. A successful/empty read does not establish service configuration,
complete account coverage or support across deployments. SPI records do not prove
Payment Cloud Service is in use.

## Shared execution and validation

Both commands use executeQuery for pinned BI company, one input read, due renewal,
ID-token auth and daily advisory update notices. Invalid scope is rejected before
renewal or any data request. No STS state, data retries, redirects or automatic installs.

[Response delivery](RESPONSES.md) is unchanged: up to 16 KiB AND 500 lines stays exact
stdout; exceeding either bound creates a complete private export and compact receipt.
Error bodies follow the same rules with preserved exit codes. No parsing, redaction or
truncation. Exports remain until explicitly deleted.

Synthetic coverage includes both public schemas, explicit scope/no widening, unsupported
selectors/limits, exact unknown numbers, string codes, JSON/file/stdin, one input read
across renewal, company pinning, quiet/notices, verbatim sensitive synthetic fields,
HTTP errors/no retries/redirects and 128 MiB plain/compressed streams through both routes.
Installed-package checks verify both commands/help, inventory and isolated scope previews.
Two separately authorized status-only live probes were attempted: one location-scoped
account read and one organization-wide holder read. Both returned HTTP 400 with Oracle
code 33108, documented as FORBIDDEN/permission denial (the status-code guide lists 403).
The CLI preserved the actual HTTP 400, verbatim error and exit 11; it did not rewrite the
status from the Oracle code. No account/holder records were returned. Remaining input/
filter probes were stopped, with no retry, wider scope or broader projection.

Successful permissions, filter paths, projection acceptance and populated/empty behavior
remain unverified. This does not prove Payment Cloud Service is enabled or disabled.
Resolve API access/service entitlement with the administrator before an authorized retest.

References:
- [Oracle account holders](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getpaymentaccountholderdimensions-post.html)
- [Oracle payment accounts](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/op-bi-v1-orgidentifier-getpaymentaccountdimensions-post.html)
