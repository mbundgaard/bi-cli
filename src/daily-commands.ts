import { Command } from 'commander';
import { allDailyEndpoints, quarterHourEndpoints } from './areas/aggregations.js';
import { integerOption } from './transaction-requests.js';
import { executeDaily } from './daily-requests.js';
import { StateStore } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export function registerDaily(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('aggregations').description('[read-only] Aggregations: all 12 daily and eight quarter-hour totals');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nAll twenty aggregation endpoints are implemented: twelve daily and eight quarter-hour.\nThese are Oracle-reported aggregates, not CLI calculations or reconciled accounting totals.\n');
  const daily = area.command('daily').description('[read-only] Twelve location/business-date-scoped daily-total POST queries');
  daily.action(() => { daily.outputHelp(); });
  daily.addHelpText('after', '\nRequire an explicit location and business date; no default date, date ranges or all-location mode.\nNo latest-date lookup, completion check, RVC inference, cursor or local aggregation.\nFor reconciliation, agree a completed business date and compatible measures with the caller.\n');
  const quarter = area.command('quarter-hour').description('[read-only] Eight location/business-date-scoped quarter-hour POST queries (20.1.16+)');
  quarter.action(() => { quarter.outputHelp(); });
  quarter.addHelpText('after', '\nOne explicit locRef and busDt; no time window, native RVC/quarter selector or date loop.\nPreserve qtrHrNum, busHrNum and dpName; no timezone conversion, gap filling or roll-up.\n');
  for (const [period, endpoints] of [[daily, allDailyEndpoints], [quarter, quarterHourEndpoints]] as const)
  for (const endpoint of endpoints) {
    const noun = period.command(endpoint.noun).description(endpoint.description);
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command('list').description(`[read-only][location/date-scoped] ${endpoint.description}`)
      .option('--loc-ref <reference>', 'Exact location reference, max 99 characters; never guessed')
      .option('--business-date <YYYY-MM-DD>', endpoint.control ? 'Explicit busDt: open OR closed business date matches; exactly one date selector' : 'Explicit busDt calendar date; no open/closed-date interpretation')
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
    if (endpoint.control) command
      .option('--open-business-date <YYYY-MM-DD>', 'Opened/reopened on this business date; mutually exclusive with other dates')
      .option('--closed-business-date <YYYY-MM-DD>', 'Closed/reopen-closed on this business date; mutually exclusive with other dates')
      .option('--rvc-num <integer>', 'Explicit native control-total RVC selector (20.1.9.7+)', integerOption);
    const selectionHelp = endpoint.control
      ? 'Require exactly one date: opened/reopened, closed/reopen-closed, or their union.\nFlags never clear a different date from JSON. Choose the basis from user intent.\nOptional native --rvc-num is not inferred. No closed-only filter or since-cursor.\nMatch the guest-check date basis when comparing control counts; no automatic comparison.\neodStatus is reported verbatim, not interpreted as immutable finality. Historical data can change.\nScoped live responses used lastUpdateUTC/lastUpdateLcl, not the documented lastUpdated names.\nProjecting lastUpdatedUTC returned HTTP 400; use observed field names, never automatic aliases.'
      : 'No native --rvc-num, open/closed selector, since-cursor or implicit filter is supported.';
    const periodHelp = period === quarter
      ? 'Requires 20.1.16+. Keep locRef, busDt, rvcNum and quarterHours grouping metadata.\nqtrHrNum is documented as 1-96; busHrNum as 1-240; neither is converted to a UTC timestamp.\nDo not assume 96 returned rows, fill missing slots, collapse day parts or infer DST rules.\nNo native time-window or quarter selector; provide explicit searchCriteria if needed.\nScoped operations RVC/slot filters worked, but a slot predicate retained sibling quarterHours.\nDo not assume child-array pruning; other quarter-hour filters remain unverified.'
      : 'Scoped tests accepted operations/menu-item daily RVC filters; other filters and nested pruning remain unverified.';
    const example = `bi aggregations ${period.name()} ${endpoint.noun} list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>"`;
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}\nExample (replace placeholders):\n  ${example}\nPreview:\n  ${example} --include "locRef,busDt,revenueCenters.rvcNum" --dry-run\n\nJSON/file/stdin use Oracle field names; control accepts exactly one of busDt/opnBusDt/clsdBusDt. Input is read once.\nUnknown fields and exact request numbers survive; flags override matching fields only.\n${selectionHelp}\nFor explicit RVC filtering, supply --search-criteria "where equals(revenueCenters.rvcNum,<rvc-number>)".\n${periodHelp}\nNo automatic fallback.\n\nKeep location/date, identifiers and grouping dimensions in projections needed for comparison.\nDo not blindly sum menu-item/combo rows or equate tender totals with settlement receipts.\nHistorical dates can change after late postings; HTTP 200 does not establish finality.\nNo additional queries, polling, local reconciliation, rounding or tax/tip calculations.\n${endpoint.note ? `\nCompatibility: ${endpoint.note}\n` : ''}\nResponses remain verbatim up to 16 KiB AND 500 lines; above either limit the complete\nbody is stored privately and stdout returns a file reference, even if redirected.\nHTTP errors keep their status/exit code; no retries, redirects, redaction or truncation.\nProtect commercial, employee and payroll exports; files remain until explicitly deleted.\nDue company profiles renew before data calls; active company identity remains pinned.\nSuccessful non-quiet calls check npm daily; no automatic installation.\nHelp/local/dry-run commands stay offline.\n`);
    command.action(async options => setExit(await executeDaily(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
