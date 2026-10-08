# Verbatim response delivery

BiCli manages auth/tokens, builds explicit requests, and delivers API data verbatim.
Response size changes only the delivery location, never the data itself. This policy
is automatic for every data command, independent of which agent or shell runs it.
There is no output-mode flag, agent detection or configuration switch.

## Inline or file

After HTTP compression decoding:

- At most **16,384 bytes (16 KiB) and 500 lines**: stdout receives the exact body,
  with no parsing, wrapper, reformatting, redaction or added newline.
- Exceeding **either** limit: the complete body is saved unchanged to disk. Stdout
  receives only a compact JSON delivery receipt, not the response body or a preview.

Bytes means bytes, not Unicode characters. Lines are LF-delimited physical lines;
CRLF counts once, and a final newline does not create an extra empty line. Empty
bodies have zero lines. The saved body keeps its original whitespace, byte order mark,
number spellings, character encoding and line endings. HTTP gzip/deflate/Brotli decoding
is transport processing, not JSON interpretation. Binary and non-JSON errors work too.

## Receipt

A large response produces this shape (paths and values below are illustrative):

```json
{
  "delivery": "file",
  "path": "/home/example/.config/BiCli/responses/response-AbCdEf/response.body",
  "uri": "file:///home/example/.config/BiCli/responses/response-AbCdEf/response.body",
  "bytes": 25000,
  "lines": 1200,
  "sha256": "<SHA-256 of the saved response bytes>",
  "httpStatus": 200,
  "description": "Large Oracle BI response for getMenuItemDimensions, saved verbatim.",
  "instructions": "Filter, aggregate, or read selected portions of this file instead of loading it all into context. Keep it private and delete it when no longer needed."
}
```

The receipt is CLI metadata, **not API data**. Its description comes from the known
operation name, not from inspecting records. It contains no token, request body,
customer-name summary or sample records. The `.body` extension is intentional: the
CLI does not guess that every response is valid JSON. Use `path` for local tools;
`uri` is a local file URI, not a public download link.

`--quiet` hides HTTP diagnostics, not response bodies, file receipts or local errors.
A saved HTTP error retains its status and exit code: HTTP 401 exits 9; other API
non-success exits 11. A file receipt is not proof of API success. No error response
is retried with broader filters, refreshed tokens or different options.

## Agent and script behavior

1. Check the process exit code. Small API error bodies may be inline too.
2. If output is a file receipt (`delivery: "file"` plus path/status/size metadata),
   operate on the referenced file instead of copying it wholesale into context.
3. Filter, aggregate or read selected portions using appropriate local tools.
   Preserve large IDs and monetary precision when choosing a JSON processor.
4. Delete the saved file/directory when it is no longer needed. Files have **no
   automatic expiry**, and repeated calls create separate files, not overwrites.

Existing scripts must handle the two delivery forms. Shell redirection captures what
stdout delivers: `> result.json` can contain a **receipt**, not the original API body.
The receipt's path is the authoritative location of a saved response. No flag forces
an oversized response back into stdout.

For large datasets, narrow server requests before retrieval when practical. For
example, using synthetic selectors and replacing the location placeholder:

```sh
bi pos-dimensions menu-item-prices list --loc-ref "<location-reference>" --search-criteria "where equals(menuItemPrices.rvcNum,1)" --include "locRef,menuItemPrices.num,menuItemPrices.prcLvlNum,menuItemPrices.price"
```

Filters remain explicit and verbatim; projections replace the default field set.
There is no silent truncation, automatic date/location loop, fabricated pagination
or completeness guarantee based on HTTP 200. Historical queries may be much larger
than active-data queries.

## Storage and failure handling

Files live under `responses/` in the fixed per-user BiCli directory:

- Windows: `C:\Users\<user>\AppData\Roaming\BiCli\responses\`
- macOS: `~/Library/Application Support/BiCli/responses/`
- Linux: `~/.config/BiCli/responses/`

Each response gets its own randomly named directory. Names contain no location,
query or record identifiers. On Unix, directories use mode 0700 and files 0600.
On Windows, the new empty directory receives a current-user-only inheritable ACL
before data is written. Failure to establish protection fails closed. OS
administrators/privileged processes may still access private files.

The inline candidate is bounded in memory. Once a limit is exceeded, decoded chunks
are written with backpressure to a protected `response.part` file. Only after the
transfer/decompression finishes, the file is synced, closed and renamed to
`response.body`; only then can its receipt be emitted.

Network/decompression failures and handled cancellation discard partial files and
emit no API body/receipt. Storage failures exit 1, with no fallback to dumping a large
body into stdout or buffering it in RAM. Cleanup failures report the partial-directory
path for manual attention. Hard termination, process crashes or power loss can leave
private partial files; there is no crash-proof cleanup guarantee. A `.part` file is
never advertised as a completed response.

Completed files remain available if stdout delivery subsequently fails. Auth state
and tokens are not changed by data delivery. Auth responses still use their separate
internal parsing/persistence path and are never exported through this mechanism.
Local commands and dry-run previews also retain their existing output behavior.

Tests use synthetic local responses, including 128 MiB plain/compressed bodies, exact
byte hashes, threshold boundaries, error statuses, cancellation and storage failures.
Native Windows protection has been exercised locally; cross-platform CI configuration
alone is not proof of native macOS/Linux validation.
