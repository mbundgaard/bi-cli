import { Command } from 'commander';
import { dailyEndpoints } from './areas/aggregations.js';
import { executeDaily } from './daily-requests.js';
import { StateStore } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export function registerDaily(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('aggregations').description('[partially implemented] Aggregations: daily totals; control and quarter-hour totals remain planned');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nEleven regular daily totals are implemented. Control totals and quarter-hour totals are not.\nThese are Oracle-reported aggregates, not CLI calculations or reconciled accounting totals.\n');
  const daily = area.command('daily').description('[read-only] Eleven location/business-date-scoped daily-total POST queries');
  daily.action(() => { daily.outputHelp(); });
  daily.addHelpText('after', '\nRequire an explicit location and business date; no default date, date ranges or all-location mode.\nNo latest-date lookup, completion check, RVC inference, cursor or local aggregation.\nFor reconciliation, agree a completed business date and compatible measures with the caller.\n');
  const control = daily.command('control').description('[planned] Control daily totals; no data request is sent');
  control.action(() => { control.outputHelp(); });
  const quarter = area.command('quarter-hour').description('[planned] Quarter-hour totals; no data request is sent');
  quarter.action(() => { quarter.outputHelp(); });
  for (const endpoint of dailyEndpoints) {
    const noun = daily.command(endpoint.noun).description(endpoint.description);
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command('list').description(`[read-only][location/date-scoped] ${endpoint.description}`)
      .option('--loc-ref <reference>', 'Exact location reference, max 99 characters; never guessed')
      .option('--business-date <YYYY-MM-DD>', 'Explicit busDt calendar date; no open/closed-date interpretation')
      .option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no implicit RVC filter')
      .option('--include <fields>', 'Projection replaces default fields, max 2000 characters')
      .option('--application-name <name>', 'Optional applicationName, max 128 characters (20.1.10+)')
      .option('--json <object>', 'JSON body; explicit flags override matching fields only')
      .option('--file <path>', 'JSON file or - for stdin; mutually exclusive with --json')
      .option('--dry-run', 'Local preview without authorization, tokens or network')
      .option('--quiet', 'Suppress HTTP diagnostics and automatic update checks, not data/errors')
      .option('--timeout <seconds>', 'Positive timeout per network request, at most 300 seconds', value => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new CliError(Exit.usage, '--timeout must be greater than 0 and at most 300');
        return seconds;
      }, 30);
    const example = `bi aggregations daily ${endpoint.noun} list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>"`;
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}\nExample (replace placeholders):\n  ${example}\nPreview:\n  ${example} --include "locRef,busDt,revenueCenters.rvcNum" --dry-run\n\nJSON/file/stdin use Oracle field names, including locRef and busDt. Input is read once.\nUnknown fields and exact request numbers survive; flags override matching fields only.\nNo native --rvc-num, open/closed selector, since-cursor or implicit filter is supported.\nFor explicit RVC filtering, supply --search-criteria "where equals(revenueCenters.rvcNum,<rvc-number>)".\nScoped tests accepted operations/menu-item RVC filters; other filters and nested\npruning remain unverified. No automatic fallback.\n\nKeep location/date, identifiers and grouping dimensions in projections needed for comparison.\nDo not blindly sum menu-item/combo rows or equate tender totals with settlement receipts.\nHistorical dates can change after late postings; HTTP 200 does not establish finality.\nNo control-total lookup, polling, local reconciliation, rounding or tax/tip calculations.\n${endpoint.note ? `\nCompatibility: ${endpoint.note}\n` : ''}\nResponses remain verbatim up to 16 KiB AND 500 lines; above either limit the complete\nbody is stored privately and stdout returns a file reference, even if redirected.\nHTTP errors keep their status/exit code; no retries, redirects, redaction or truncation.\nProtect commercial, employee and payroll exports; files remain until explicitly deleted.\nDue company profiles renew before data calls; active company identity remains pinned.\nSuccessful non-quiet calls check npm daily; no automatic installation.\nHelp/local/dry-run commands stay offline.\n`);
    command.action(async options => setExit(await executeDaily(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
