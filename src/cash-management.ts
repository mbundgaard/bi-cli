import { Command } from 'commander';
import { cashManagementEndpoint as endpoint } from './areas/cash-management.js';
import { buildPostRequest, validateLocationDateBody, executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export interface CashOptions extends QueryOptions { businessDate?: string }
export function buildCashRequest(state: State, options: CashOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, 'Cash details require one explicit location; no all-location mode');
  const body = { ...input };
  for (const [flag, field] of [
    ['locRef', 'locRef'], ['businessDate', 'busDt'], ['searchCriteria', 'searchCriteria'],
    ['include', 'include'], ['applicationName', 'applicationName'],
  ] as const) if (options[flag] !== undefined) body[field] = options[flag];
  validateLocationDateBody(endpoint.operation, body);
  return buildPostRequest(endpoint.operation, state, body);
}
export async function executeCash(source: State | StateStore, options: CashOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildCashRequest(state, options, input), directory, notifyUpdate);
}
export function registerCash(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('cash-management').description('[read-only] Cash Management: location/business-date-scoped detail query');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nRead existing cash-management records only. No paid-in/out, count, transfer or deposit writes.\nNo financial reconciliation, date lookup, polling or implicit RVC/receptacle/employee selection.\n');
  const details = area.command(endpoint.noun).description(endpoint.description);
  details.action(() => { details.outputHelp(); });
  const command = details.command(endpoint.verb).description('[read-only][location/date-scoped] Cash-management detail records')
    .option('--loc-ref <reference>', 'Exact location reference, max 99 characters; required, never guessed')
    .option('--business-date <YYYY-MM-DD>', 'Explicit busDt calendar date; no default or date range')
    .option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no implicit filters')
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
  command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}\nExamples (replace placeholders):\n  bi cash-management details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run\n  bi cash-management details list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.cmDetails.cmItemNum,revenueCenters.cmDetails.transType"\n  bi cash-management details list --file request.json --dry-run\n\nJSON/file/stdin use locRef, busDt, searchCriteria, include and applicationName.\nUnknown fields and exact request numbers survive; input is read once before renewal.\nNo native RVC, receptacle, employee, transaction-type, open/closed-date or cursor flags.\nUse explicit searchCriteria, for example "where equals(revenueCenters.rvcNum,<rvc-number>)".\nScoped live reads/projections/input modes succeeded but returned empty revenueCenters.\nFilter paths include revenueCenters.cmDetails.transType; populated data and RVC/child\nfiltering remain unverified. Empty data is not proof of complete cash coverage. Never remove a rejected filter and retry a broader request.\n\nProtect amounts, receptacle identifiers/names, employee references, refInfo and notes.\nKeep IDs, session/target relationships and date/time fields needed by the consumer.\ntransUTC and transLcl are distinct; no timezone conversion. actBusDate is returned data,\nnot an alternate request date. balanceAmt requires 20.1.15+; actBusDate, sessionNum,\ntargetReceptacleNum and targetSessionNum require 20.1.16+. Preserve missing/zero fields\nand numeric transaction/receptacle codes; no inferred labels or local balance math.\n\nResponses stay verbatim up to 16 KiB AND 500 lines; above either limit the complete\nbody is stored privately and stdout receives a file reference, even when redirected.\nHTTP errors keep their exit codes. No response parsing, redaction, truncation, retries\nor redirects. Files remain until deleted. Dry-run prints the caller's request body.\nCompany identity remains pinned across due renewal; BI uses ID tokens, not STS tokens.\nSuccessful non-quiet calls check npm daily; notices are advisory, never auto-install.\nHelp/local/dry-run commands stay offline.\n`);
  command.action(async options => setExit(await executeCash(store, options, store.directory, notifyUpdate)));
}
