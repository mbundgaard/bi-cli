# bi

Oracle Simphony Business Intelligence CLI, aligned with the Muneris STS CLI.
Node.js 22+, TypeScript, Windows/macOS/Linux.

**Current status: authentication-first scaffold.** PKCE login, explicit refresh and
private per-user state are implemented and tested offline. Fresh BI login and a
subsequent refresh have also been verified against Oracle on Windows. BI data
queries and their permissions have not been tested or implemented. This package
is private/unpublished. No STS configuration, credentials or token state are copied.

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

These are placeholders, not default endpoints. `--api-url` is saved for future BI
queries; login/refresh only contact the configured `--auth-url`. The password is
used for login only, never saved. Arguments may be visible in shell history/process
listings. Refresh needs no password and saves rotated tokens atomically. No automatic
refresh, retries or redirects. TLS verification cannot be disabled.

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

Each area has its own source module and help entry. These groups currently display
help only and do not query Oracle. `bi endpoints` explicitly reports no implemented
data endpoints. Planned BI queries use POST for reads; POST does not imply a business
write. Future implementation will preserve response bytes on stdout, including errors,
and send diagnostics to stderr, following the STS contract.

[Commands](docs/CLI.md) | [Development](docs/DEVELOPMENT.md) |
[Contributing](CONTRIBUTING.md) | [Security](SECURITY.md)

Oracle reference: https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/index.html

Support: **support@muneris.dk**. Do not send passwords, tokens or customer data.
