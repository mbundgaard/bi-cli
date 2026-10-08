import { Command } from 'commander';
import { dimensionEndpoints } from './areas/pos-dimensions.js';
import { executeDimension } from './requests.js';
import { StateStore } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';

export function registerDimensions(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('pos-dimensions').description('[read-only] Point of Sale Dimensions: 16 BI JSON POST queries');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nAll operations are reads, despite using HTTP POST. Supply the exact location reference.\nLocation discovery with --all-locations is organization-wide; do not use it for location-only authorization.\nResponses remain verbatim: inline, or a file reference above 16 KiB or 500 lines. Diagnostics go to stderr. Due company tokens are renewed before data calls; no data retries. Local commands/dry-runs stay offline.\n');
  for (const endpoint of dimensionEndpoints) {
    const noun = area.command(endpoint.noun).description(endpoint.description);
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command(endpoint.verb).description(`[read-only][${endpoint.allLocations ? 'location-or-organization-wide' : 'location-scoped'}] ${endpoint.description}`)
      .option('--loc-ref <reference>', 'Exact location reference (string, not a numeric conversion)')
      .option('--search-criteria <expression>', 'Oracle searchCriteria expression, sent verbatim')
      .option('--include <fields>', 'Oracle comma-separated field projection; overrides default response fields')
      .option('--application-name <name>', 'Optional applicationName, max 128 characters; requires Oracle 20.1.10+')
      .option('--json <object>', 'Structured JSON request body; explicit flags override corresponding fields')
      .option('--file <path>', 'JSON request body file, or - for stdin; mutually exclusive with --json')
      .option('--dry-run', 'Print a local request preview without authorization, tokens or network')
      .option('--quiet', 'Suppress HTTP diagnostics and automatic update checks, not data or local errors')
      .option('--timeout <seconds>', 'Positive request timeout, at most 300 seconds', value => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0 || number > 300) throw new CliError(Exit.usage, '--timeout must be greater than 0 and at most 300');
        return number;
      }, 30);
    if (endpoint.allLocations) command.option('--all-locations', 'Explicitly allow organization-wide location discovery; conflicts with locRef');
    if (endpoint.priceDates) command
      .option('--effective-from <YYYY-MM-DD>', 'effFrDt: effective-from date; no timezone conversion')
      .option('--effective-to <YYYY-MM-DD>', 'effToDt: effective-to date; no timezone conversion');
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}\nExample (replace placeholders):\n  bi pos-dimensions ${endpoint.noun} ${endpoint.verb} --loc-ref "<location-reference>"\nPreview:\n  bi pos-dimensions ${endpoint.noun} ${endpoint.verb} --loc-ref "<location-reference>" --dry-run\n\nBody: --json '{"locRef":"<location-reference>"}', or --file request.json, or --file -.\nNo location is guessed. Unknown body fields and exact JSON number values survive.\n--include is projection, not an additive field list. Nested fields need parent prefixes.\nSearch grammar: where equals(parent.field,'value'), AND/OR and parentheses.\nThe tested Oracle deployment requires the where prefix; some guide examples omit it.\nNegation tested successfully as where !equals(parent.field,value), not !(equals(...)).\nExpressions are forwarded, not rewritten or evaluated by the CLI.\n${endpoint.compatibilityNote ? `\nCompatibility: ${endpoint.compatibilityNote}\n` : ''}${endpoint.allLocations ? '\nOrganization-wide example (requires that scope):\n  bi pos-dimensions locations list --all-locations\n' : ''}${endpoint.priceDates ? '\nWithout dates Oracle returns active prices. Explicit dates select historical/effective prices;\nOracle limits dates to three years from the current business date. The CLI does not\nguess that date or issue hidden queries. Do not assume both dates give an as-of snapshot:\nthe tested API excluded active prices from a same-day range. Upper-bound-only queries\ncan return substantial history. See docs/POS-DIMENSIONS.md for observed differences.\n' : ''}\nBI uses the saved id_token and application URL. Response bytes remain unchanged.\nAbove 16 KiB (16,384 bytes) OR 500 lines, the full decoded body is saved privately\nand stdout returns a small JSON file reference. Otherwise stdout is the exact body.\nFiles remain until you delete them. HTTP error exit codes are unchanged.\nAll due company profiles renew before data calls: success +24h, failure +1h.\nExpired token sets are removed without refresh; new login is required.\nSuccessful non-quiet calls check npm daily (1-second timeout); notices use stderr.\nHelp/local/dry-run commands stay offline. No automatic installation, data retries or redirects.\n`);
    command.action(async options => setExit(await executeDimension(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
