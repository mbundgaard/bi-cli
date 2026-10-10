# Commands

## Implemented

| Command | Scope |
|---|---|
| `bi --help`, `bi --version` | Local human-readable help/version |
| `bi version` | Local JSON version information |
| `bi version --check` | Explicit advisory npm lookup; never installs |
| `bi endpoints` | Local registry of implemented paths/methods/scopes and planned areas |
| `bi pos-dimensions <noun> <list|get>` | 16 read-only POST endpoints; see [POS dimensions](POS-DIMENSIONS.md) |
| `bi pos-transactions <noun> list` | Seven read-only location/date-scoped POST endpoints; see [POS transactions](POS-TRANSACTIONS.md) |
| `bi aggregations daily <noun> list` | Eleven read-only regular daily totals; see [Daily totals](DAILY-TOTALS.md) |
| `bi auth status` | Local configuration presence and ID-token expiry summary |
| `bi auth show` | Local saved configuration plus token presence, never token values |
| `bi auth config` | Prepare the next login without changing saved profiles/tokens |
| `bi auth login --password "<password>"` | Network authentication and state write |
| `bi auth refresh` | Renew all unexpired profiles now; bypass cooldown and persist each result |
| `bi auth logout` | Remove active-company tokens only, no Oracle revocation |
| `bi company list` | Saved profiles and secret-free token summaries, not an access check |
| `bi company status` | Current active key |
| `bi company select <exact-key>` | Select saved profile; discard unfinished login configuration |
| `bi company delete <exact-key>` | Remove local profile; deleting active clears selection |
| `bi auth restore --file <path> [--force]` | Local BI state restore |

Login/refresh support `--timeout <seconds>` (default 30, maximum 300) and `--quiet`
(suppress HTTP status diagnostics only). They never follow redirects or retry.
Passwords are used for login only; no shell-variable or state-directory overrides.
POS dimensions supports explicit location scope, Oracle filters/projection, JSON/file/stdin
input, menu-price date flags, network-free dry-run, quiet and timeout flags. Responses
are verbatim, inline or in referenced files. Before data calls, all due company
profiles renew: +24h after success, +1h after failure while retaining valid tokens.
Expired token sets are removed without refresh. No background daemon or data retries.
Help/local/dry-run commands stay offline. Details: [Authentication](AUTHENTICATION.md).
No feedback or arbitrary-endpoint request command is implemented.

## Update notices

Successful non-quiet data calls check npm at most once per 24 hours, after delivery,
with a 1-second network timeout. Only newer versions produce stderr notices; stdout
and the data exit code stay unchanged. `--quiet` skips the check. Failed data calls,
help, local/auth commands and dry-runs never check automatically. Nothing installs.

The separate `update-notice.json` beneath the BI state directory contains only a
schema version and next-attempt timestamp. An exclusive lock and persisted reservation
prevent concurrent checks, including after failed attempts. Corrupt cache, contention
and storage/network errors silently skip the notice; auth state is not changed.
Hard termination during reservation may leave `update-notice.json.lock`; inspect and
remove it only when no BI command is running.

`bi version --check` bypasses this schedule with a 5-second lookup and reports
installed/latest versions, availability and a version-pinned suggested npm command.
Unavailable is not up to date. BI remains private/unpublished, so registry lookup may
be unavailable. Preserve the installation method and get approval before updating.
No Oracle credentials, cookies or customer data are sent to npm.

## Scaffolded only

`cash-management`, `fiscal-transactions`,
`kitchen-performance`, `labor`, `payment-dimensions`, `payment-transactions`. Use `<group> --help` for scope and Oracle names.
These six planned groups send no data requests. Aggregations is partially implemented:
`aggregations daily control` and `aggregations quarter-hour` remain help-only.
Unimplemented operations fail as usage errors.

## Output and exit codes

Local successful commands use `{ "ok": true, "command": "...", "data": ... }` on stdout.
Errors and diagnostics go to stderr. `auth refresh` returns a local summary even
with nonzero exit: inspect each company's outcome, not just the summary envelope.
BI response bodies stay unchanged: stdout receives the body up to 16 KiB and 500 lines;
above either limit it receives a small JSON reference to a private file containing the
complete body. API errors keep their exit codes even when saved. This automatic behavior
has no mode flag. See [Response delivery](RESPONSES.md), including script compatibility,
file retention and error handling. Dry-run is a local
JSON preview that omits authorization but exposes the caller's request body.
Auth necessarily parses token responses internally and must never print them.

| Exit | Meaning |
|---|---|
| 0 | Success |
| 1 | Unexpected local failure |
| 6 | Usage/input failure |
| 7 | Missing configuration |
| 8 | Missing saved tokens/verifier |
| 9 | Authentication failure or expired ID token |
| 10 | Network failure/uncertain outcome |
| 11 | Data API non-success (other than HTTP 401, which exits 9) |
| 12 | Invalid/locked/unreadable/unwritable state |
