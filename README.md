# bi

Oracle Simphony Business Intelligence CLI, aligned with the Muneris STS CLI.
Node.js 22+, TypeScript, Windows/macOS/Linux.

**Current status: authentication, POS dimensions, POS transactions and regular daily totals implemented.** PKCE login,
refresh and private per-user state were tested offline and against Oracle on
Windows. Multi-company management, scheduled renewal and update notices now mirror
STS. Scheduled BI renewal has live coverage; multi-company isolation remains
synthetically tested, not live-tested with multiple BI companies. All 16 POS-dimension queries are implemented and returned HTTP 200 in
live scoped testing at one location. Seven POS-transaction calls are implemented, offline-tested and passed scoped live
reads. Cursor spelling and nested-filter caveats are documented in the transaction guide. All twelve daily-total calls, including control, are offline-tested and passed scoped live
functionality checks, without numerical reconciliation.
Quarter-hour totals and six other data areas remain planned.
This package is private/unpublished. No STS configuration, credentials or token state are copied.

## Local setup

```sh
npm ci
npm test
npm run test:package
node bin/bi.js --help
```

To install this local checkout's `bi` command, build and pack it first:

```sh
npm run build
npm pack
npm install --global ./muneris-bi-cli-0.1.0-dev.0.tgz
bi --help
```

There is no registry installation instruction until a release is explicitly approved.

## Authentication

Use the details of a **BI API account** from Reporting and Analytics, not an STS
account assumed to have BI access. Check state first:

```sh
bi auth status
bi auth config --auth-url https://idm.example.com --api-url https://reports.example.com --username "<user>" --client-id "<client-id>" --org "<enterprise-shortname>"
bi auth login --password "<password>"
bi auth status
bi auth refresh
```

These are placeholders, not default endpoints. Data queries use `--api-url`;
login/refresh only contact the configured `--auth-url`. The password is
used for login only, never saved. Arguments may be visible in shell history/process
listings. Refresh needs no password and saves rotated tokens atomically. There are
no data retries or redirects. TLS verification cannot be disabled.

```sh
bi company list
bi company select "<enterpriseShortname>@<authHostname>"
bi company delete "<enterpriseShortname>@<authHostname>"
```

Company keys use the explicit shortname and lowercase auth hostname. Select/delete
require an exact key; deleting the active entry clears selection without guessing
another. Successful login saves and selects its company; failed login preserves
profiles. Configuration prepares the next login without changing active tokens.
A matching company/hostname/username reports existing tokens instead of logging in again.

Before data calls, all due profiles are renewed: success schedules +24 hours,
failure +1 hour while retaining still-valid tokens. Known-expired token sets are
removed without refresh; new login is required. Manual `bi auth refresh` checks all
profiles now, bypassing cooldown. No daemon; help/local/dry-run commands stay offline.

**BI uses `id_token` as its Bearer token, not `access_token`.** The client ID is opaque
and preserved exactly. Unlike STS, BI documentation does not guarantee that decoding
it yields the enterprise shortname, so `--org` is explicit. Username case is preserved.

| Platform | Shared per-user state directory |
|---|---|
| Windows | `C:\Users\<user>\AppData\Roaming\BiCli` |
| macOS | `~/Library/Application Support/BiCli` |
| Linux | `~/.config/BiCli` |

State is `BiCli.json`, separate from STS. No directory flag or application environment
variables. `auth status` checks local presence/expiry, not server-side validity.
Token values never appear in CLI output. `auth show` does show saved account configuration;
do not paste it publicly without review. Tokens are plaintext private state; protect
OS permissions and use disk encryption.

See [Authentication](docs/AUTHENTICATION.md) for recovery and troubleshooting.

## Update notices

Successful non-quiet data calls check npm at most once per 24 hours, with a 1-second
network timeout. A newer version produces a short stderr notice; API output and exit
codes remain unchanged. Failures stay silent, and no update installs automatically.
`--quiet` skips the check. Help/local/auth/dry-run commands do not check automatically.

`bi version --check` performs an explicit advisory lookup with a 5-second timeout.
BI remains private/unpublished: an unavailable npm lookup is not proof it is up to
date. Review the installation method and ask before updating; this feature does not
authorize publication or copy any STS credentials.

## Nine task areas

| Command group | Oracle terminology |
|---|---|
| `bi aggregations` | Aggregations (daily and quarter-hour) |
| `bi cash-management` | Cash Management |
| `bi fiscal-transactions` | Fiscal Transactions |
| `bi kitchen-performance` | Kitchen Performance |
| `bi labor` | Labor |
| `bi payment-dimensions` | Payment Dimensions |
| `bi payment-transactions` | Payment Transactions |
| `bi pos-dimensions` | Point of Sale Dimensions |
| `bi pos-transactions` | Transactions |

Each area has its own source module and help entry. POS dimensions implements all
16 documented calls; POS transactions implements seven location/date-scoped reads.
Aggregations implements all twelve daily totals, including control; quarter-hour totals
remain planned. Six other groups display help only. `bi endpoints`
lists implemented requests and scopes. BI uses POST for reads; POST does not imply
a business write. API data remains verbatim: small bodies go directly to stdout;
bodies exceeding **16 KiB or 500 lines** are saved privately and stdout returns a
small JSON file reference. This is automatic, with no output-mode flags. Diagnostics
go to stderr and API error exit codes remain unchanged. See
[Response delivery](docs/RESPONSES.md) for agent/script handling and file retention.

```sh
bi pos-dimensions revenue-centers list --loc-ref "<location-reference>"
bi pos-dimensions menu-items list --loc-ref "<location-reference>" --dry-run
bi pos-dimensions locations list --all-locations --include locations.locRef
```

`--all-locations` explicitly permits organization-wide discovery; it must not be
used under location-only authorization. No location is guessed. See
[POS dimensions](docs/POS-DIMENSIONS.md) for all commands, JSON input, filters and price dates.

## POS transactions

```sh
bi pos-transactions --help
bi pos-transactions guest-checks list --loc-ref "<location-reference>" --open-business-date "<YYYY-MM-DD>" --dry-run
bi pos-transactions non-sales list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
```

Location and business date are explicit. Guest checks requires exactly one open,
closed or union date. No polling, cursor advancement, date/location loops, aggregation
or reconciliation. Use projections to avoid unnecessarily large/sensitive exports.
[POS transactions](docs/POS-TRANSACTIONS.md) describes all seven calls and caveats.

## Daily totals

```sh
bi aggregations daily --help
bi aggregations daily operations list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
```

Regular totals require one explicit location and `busDt`. Control totals instead
supports one open/closed/union date basis and optional native RVC. No cursors, inferred
filters or local calculations. Totals are reported
by Oracle, not reconciled by the CLI. [Daily totals](docs/DAILY-TOTALS.md) covers all
twelve commands, grouping and sensitive employee/payroll data considerations.

[Commands](docs/CLI.md) | [Development](docs/DEVELOPMENT.md) |
[Contributing](CONTRIBUTING.md) | [Security](SECURITY.md)

Oracle reference: https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/index.html

Support: **support@muneris.dk**. Do not send passwords, tokens or customer data.
