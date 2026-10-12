import { Command } from 'commander';
import { kitchenEndpoint as endpoint } from './areas/kitchen-performance.js';
import { buildTransactionRequest } from './transaction-requests.js';
import { executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export interface KitchenOptions extends QueryOptions { businessDate?: string; transSinceUtc?: string }
export function buildKitchenRequest(state: State, options: KitchenOptions, input: Record<string, unknown> = {}) {
  return buildTransactionRequest(endpoint, state, options, input);
}
export async function executeKitchen(source: State | StateStore, options: KitchenOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildKitchenRequest(state, options, input), directory, notifyUpdate);
}
export function registerKitchen(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('kitchen-performance').description('[read-only] Kitchen Performance: explicit location/business-date KDS details');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nRead existing KDS orders/suborders only. No bump, recall, routing, priority or station writes.\nNo implicit date discovery, polling, cursor advancement or performance calculations.\n');
  const details = area.command(endpoint.noun).description(endpoint.description);
  details.action(() => { details.outputHelp(); });
  const command = details.command(endpoint.verb).description('[read-only][location/date-scoped] Kitchen display system detail records')
    .option('--loc-ref <reference>', 'Exact location reference, max 99 characters; required, never guessed')
    .option('--business-date <YYYY-MM-DD>', 'Required busDt calendar date; cursor never replaces it')
    .option('--trans-since-utc <timestamp>', 'Optional transSinceUTC; UTC seconds/fractions, unchanged, no offsets')
    .option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no inferred filters')
    .option('--include <fields>', 'Projection replaces default fields, max 2000 characters')
    .option('--application-name <name>', 'Optional applicationName, max 128 characters (20.1.10+)')
    .option('--json <object>', 'JSON body; explicit flags override matching fields only')
    .option('--file <path>', 'JSON file or - for stdin; mutually exclusive with --json')
    .option('--dry-run', 'Local preview without authorization, tokens or network')
    .option('--quiet', 'Suppress HTTP diagnostics/update checks, not data/errors')
    .option('--timeout <seconds>', 'Positive timeout per network request, at most 300 seconds', value => {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new CliError(Exit.usage, '--timeout must be greater than 0 and at most 300');
      return seconds;
    }, 30);
  command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}
Examples (replace placeholders):
  bi kitchen-performance details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
  bi kitchen-performance details list --file request.json --dry-run
  bi kitchen-performance details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.orders.serviceRoundNum"

JSON/file/stdin use locRef, busDt, transSinceUTC, searchCriteria, include, applicationName.
Input is read once before renewal; unknown fields and exact request numbers survive.
No all-location mode, native RVC/station/check selector, open/closed date or changedSinceUTC.
Explicit filters may use "where equals(revenueCenters.rvcNum,<rvc-number>)".
Never broaden a rejected filter or assume nested filtering prunes sibling orders/suborders.

transSinceUTC selects KDS activity for the explicit business date, not cloud changedSinceUTC.
Accepted local syntax: YYYY-MM-DDTHH:mm:ss[.fraction][Z], with actual calendar/clock validation.
Numeric offsets are rejected; no timezone conversion, silent Z removal or data retry.
Scoped KDS tests accepted offsetless seconds/fractions but rejected trailing Z (400/33205).
Recommend offsetless UTC. Acceptance does not establish precision, selectivity or boundaries.
No cursor persistence/advancement, deduplication, polling or completeness guarantees.

Keep order/station/service-round/suborder relationships; a guestCheckId alone need not
identify a unique KDS order. Protect guest-check identifiers, station names and modifier text.
Keep seconds and local/UTC timestamps unchanged; no elapsed-time reconstruction or KPI math.
startTime is deprecated in favor of startTimeLcl; UTC/local fields are documented from 20.1.9.6.
Schema actualPrepTimeinSecs differs from example actualPrepTimeInSecs; never alias fields.
Missing false/zero/null fields remain missing, despite contradictory Swagger required lists.
No inferred false flags, zero recalls, unit conversion or guessed timezone/DST rules.
Scoped reads at three locations succeeded: two populated order results and one empty.
RVC filters selected one from two baseline RVCs; JSON/file/stdin and hash-verified exports passed.
Suborders were absent from tested projections; populated suborders/nested filters remain unverified.

Responses are verbatim up to 16 KiB AND 500 lines; larger bodies are stored privately and
stdout receives a compact file receipt, including API errors. No parsing, redaction or
truncation. Exports remain until deleted. No data retries, redirects or automatic installation.
Pinned-company renewal, ID-token authorization and daily advisory update notices are shared.
Help/local/dry-run stay offline. Dry-run includes the caller's supplied request body.
`);
  command.action(async options => setExit(await executeKitchen(store, options, store.directory, notifyUpdate)));
}
