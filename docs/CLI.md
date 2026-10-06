# Commands

## Implemented

| Command | Scope |
|---|---|
| `bi --help`, `bi --version` | Local human-readable help/version |
| `bi version` | Local JSON version information |
| `bi endpoints` | Local implementation status; no data endpoints yet |
| `bi auth status` | Local configuration presence and ID-token expiry summary |
| `bi auth show` | Local saved configuration plus token presence, never token values |
| `bi auth config` | Local configuration; changed values invalidate BI tokens |
| `bi auth login --password "<password>"` | Network authentication and state write |
| `bi auth refresh` | Explicit network refresh and state write |
| `bi auth restore --file <path> [--force]` | Local BI state restore |

Login/refresh support `--timeout <seconds>` (default 30, maximum 300) and `--quiet`
(suppress HTTP status diagnostics only). They never follow redirects or retry.
Passwords are used for login only; no shell-variable or state-directory overrides.
No feedback, update lookup, arbitrary request command or data queries are implemented.

## Scaffolded only

`aggregations` (`daily`, `quarter-hour`), `cash-management`, `fiscal-transactions`,
`kitchen-performance`, `labor`, `payment-dimensions`, `payment-transactions`,
`pos-dimensions`, `pos-transactions`. Use `<group> --help` for scope and Oracle names.
The scaffold sends no data requests. Unimplemented operations fail as usage errors.

## Output and exit codes

Local successful commands use `{ "ok": true, "command": "...", "data": ... }` on stdout.
Errors and diagnostics go to stderr; failures do not produce success JSON on stdout.
Future BI response bodies will pass unchanged to stdout, including API errors.
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
| 11 | Data API non-success (reserved for future query commands) |
| 12 | Invalid/locked/unreadable/unwritable state |
