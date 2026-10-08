# Authentication

## Credentials and configuration

Obtain a BI API account's authentication server URL, application server URL, username,
client ID and enterprise shortname from Reporting and Analytics. No environment hosts,
organizations, accounts, locations or revenue centers are guessed. HTTPS is required;
HTTP loopback is accepted for synthetic local tests only. There is no TLS bypass flag.

```sh
bi auth config --auth-url https://idm.example.com --api-url https://reports.example.com --username "<user>" --client-id "<client-id>" --org "<shortname>"
bi auth login --password "<password>"
bi auth status
bi auth refresh
```

The password is used for login only. Agents may use supplied credentials for authorized
login; do not refuse simply because a password was supplied. Do not echo the password
or store it in source, files, logs, examples or feedback. Arguments may be visible in
process listings and shell history. Prefer existing saved tokens when usable.

The client ID is opaque. The guide's example decodes to two UUID-like components,
not an enterprise shortname. BI therefore has an explicit `--org`; it does not borrow
STS's client-ID decoder. Configuration prepares the next login without altering
saved profiles or active tokens. Successful login stores the new configuration and
selects its company; failed login preserves profiles and selection. `auth show`
shows prepared configuration when present; `auth status` describes the active profile.

## Companies

```sh
bi company list
bi company status
bi company select "<enterpriseShortname>@<authHostname>"
bi company delete "<enterpriseShortname>@<authHostname>"
bi auth logout
```

Keys combine the explicitly supplied enterprise shortname with the lowercase auth
hostname, excluding scheme, port and path. Full URLs remain in each profile. No
client-ID decoding, bare-code selection or fuzzy matching. Agents should list and
disambiguate shorthand, and confirm deletion intent before running the command.
Listing means locally configured, not verified Oracle access.

Successful login always selects its key. Same-host accounts/ports/paths are not
separate identities: another username's successful login replaces that key. A
matching company/hostname/exact username with an ID token not known to be expired
reports the saved expiry without contacting Oracle or changing selection. No password
is needed for that duplicate report. Known-expired tokens do not block a fresh login.

To replace same-user credentials/configuration deliberately, select that company,
run `bi auth logout`, then configure and log in again. Logout removes only the active
company's token set and schedule. Selection discards unfinished login configuration.
Deletion removes the exact profile and matching prepared configuration; deleting the
active entry clears selection rather than choosing another. Neither operation revokes
credentials at Oracle.

## Wire flow

1. Generate a random PKCE verifier and S256 base64url challenge.
2. GET `/oidc-provider/v1/oauth2/authorize` with client ID, challenge, S256,
   `scope=openid`, `response_type=code`, `redirect_uri=apiaccount://callback`.
3. Preserve Oracle's cookies exactly, including client-ID padding. Do not overwrite
   them or follow an HTTP redirect. Authorize may return 200, 302 or 303.
4. POST form-encoded username/password/orgname to `/oidc-provider/v1/oauth2/signin`.
5. Extract the code from the expected `apiaccount://callback` URI. Do not follow it.
6. POST the code/verifier/client ID to `/oidc-provider/v1/oauth2/token`.
7. Save `id_token`, refresh token, verifier, obtained time and numeric `expires_in`.
   Oracle documents `expires_in` as both a number and a numeric string; both are supported.

BI requests need **`Authorization: Bearer <id_token>`**. The returned `access_token`
is not used or stored. This is an intentional difference from STS, not an alias.

`bi auth refresh` explicitly exchanges the saved refresh token with the same client
ID/verifier. Rotated refresh tokens replace old values; an omitted replacement retains
the previous value. Actual expiry from the token response controls status; lifetimes
are never hardcoded. If optional expiry metadata is absent or unusable, preserve the
rotated credentials with unknown expiry, not a guessed lifetime.

## Scheduled renewal

Before a non-preview data request, all saved companies, including inactive ones, are
checked. The selected key is pinned for the operation so concurrent selection cannot
mix one profile's endpoint with another's ID token. Validate input before any renewal;
stdin/file bodies are read once and reused unchanged.

1. If `obtainedAt + expiresIn <= now`, remove the entire token set, including the
   refresh token, without renewal. Keep configuration and selection; login is required.
   This intentionally discards a refresh token Oracle might still accept.
2. Renew each remaining profile whose persisted `refreshAfter` is due. Successful
   login/refresh schedules **now +24 hours**.
3. Failed renewal schedules **now +1 hour** and retains still-valid tokens. Expiry
   remains independent and overrides cooldown. No escalating delay or failure counter.
4. Recheck eligibility under the state lock and persist each result separately.
   A usable active ID token can still serve the original query if renewal fails for
   it or another company. No BI data request is retried, including after HTTP 401.

`bi auth refresh` checks all profiles immediately, bypassing cooldown but never
renewing known-expired tokens. It returns per-company outcomes and a nonzero exit
when any profile fails or lacks tokens. Unknown expiry is retained and reported,
not renewed by guessing. Active selection is unchanged.

There is no daemon: if BI is unused until expiry, the next data call removes those
tokens and requires login. Help/local/config/list/status/dry-run commands do not
renew or clean up expiry. Timeout applies to each renewal/request, not the combined
sweep. Persistence and lock errors stop before the data request; they are not Oracle
backoff events. Resolve rotated-token recovery before any further data/auth operation.

## Private state and recovery

State lives in the fixed per-user `BiCli` directory listed in the [README](../README.md),
not beside the binary or inside a project. Different OS users/machines do not share it.
`BiCli.json` uses schema version 2 with `product: "bi"`, `activeCompany`, a `companies`
map and optional prepared configuration. Each profile retains its own BI auth settings,
ID tokens and `refreshAfter`. STS state is rejected, even an empty STS registry.

Legacy schema-1 BI state is read as one active company without losing tokens, and
persisted as schema 2 on the next mutation. Its initial renewal schedule is the saved
acquisition timestamp +24 hours. Incomplete legacy configuration is preserved for
config/login. Older BI versions cannot read schema 2; protect backups and never
refresh independent copies of the same token set.

Tokens are plaintext protected by the OS account. Unix files are created owner-only;
Windows uses the user's directory permissions. Backups and recovery copies are secrets.

Writes are locked (`BiCli.json.lock`) and use synced temporary files followed by atomic
replacement. Locks are never automatically stolen. Inspect the lock's PID and other
clients before removing a stale lock. Other programs may not honor it.

If replacement fails after tokens have rotated, a complete temporary recovery copy
is retained and its path reported. Do not refresh with the old state. Fix the filesystem
problem and restore the new copy:

```sh
bi auth restore --file "/private/path/BiCli.json.complete.tmp" --force
bi auth status
```

Without `--force`, restore refuses to replace configured state. Restore is local-only,
accepts legacy BI state or a complete BI registry and cannot import STS state. Force
replaces the entire registry and selection, not just one profile. Corrupt files are reported, never
silently reset. Auth failures normally preserve existing state, but a lost/malformed
response or persistence failure may leave the server-side outcome uncertain; never
blindly retry with a potentially superseded refresh token.

## Troubleshooting and diagnostic privacy

- `auth status` is local-only; a locally unexpired token is not proof Oracle accepts it.
- HTTP 400 can mean invalid client/request configuration, not necessarily bad credentials.
- HTTP 401 alone does not establish password expiry, a required password change or account
  lockout. Do not repeatedly try password/username variations. Oracle's explicit
  `nextOp: expired` is reported separately; reset through Oracle only when appropriate.
- HTTP errors show the auth stage/status and allowlisted documented machine codes.
  Raw response bodies/messages, cookies, callback URLs and reset tokens remain private.
- A missing `id_token` is an auth failure even if an `access_token` was returned.
- API permissions, location authorization and data freshness are not established by login.
- Fresh BI login and subsequent refresh were verified against Oracle on Windows,
  including saved refresh-token rotation. Subsequent authorized testing verified all
  16 POS-dimension calls at one returned location plus organization-wide location
  discovery; other locations/areas remain unverified. Automated tests still use
  synthetic local mocks, not real tenants. Multi-company migration, scheduled renewal
  and update notices have been validated offline only, not by new live BI calls.

References:
[Authenticate](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/authenticate.html),
[Send Requests](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/send-requests.html).
