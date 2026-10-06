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
STS's client-ID decoder. Changing configuration clears existing BI tokens. Repeating
identical configuration does not clear them. Failed login with `--username` does not
change the saved account.

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
the previous value. There are no automatic refreshes or retries. Actual expiry from
the token response controls status; token lifetimes are not hardcoded.

## Private state and recovery

State lives in the fixed per-user `BiCli` directory listed in the [README](../README.md),
not beside the binary or inside a project. Different OS users/machines do not share it.
`BiCli.json` uses schema version 1 and cannot be confused with `StsCli.json`.

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
validates BI schema and cannot import STS state. Corrupt files are reported, never
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
  including saved refresh-token rotation. No BI data queries were sent; data permissions
  remain unverified. Automated tests still use synthetic local mocks, not real tenants.

References:
[Authenticate](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/authenticate.html),
[Send Requests](https://docs.oracle.com/en/industries/food-beverage/back-office/20.1/biapi/send-requests.html).
