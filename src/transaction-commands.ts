import { Command } from 'commander';
import { transactionEndpoints } from './areas/pos-transactions.js';
import { executeTransaction, booleanOption, integerOption } from './transaction-requests.js';
import { StateStore } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
const dateFlags = { busDt: '--business-date', opnBusDt: '--open-business-date', clsdBusDt: '--closed-business-date' } as const;
export function registerTransactions(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('pos-transactions').description('[read-only] Transactions: seven location/date-scoped BI JSON POST queries');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nEvery call requires one explicit location and business-date selection. No all-location mode.\nNo date guessing, polling, cursor advancement, pagination, aggregation or reconciliation.\nData remains verbatim; protect check, journal, employee, extensibility and payment data.\n');
  for (const endpoint of transactionEndpoints) {
    const noun = area.command(endpoint.noun).description(endpoint.description);
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command('list').description(`[read-only][location/date-scoped] ${endpoint.description}`)
      .option('--loc-ref <reference>', 'Exact location reference, max 99 characters; never guessed')
      .option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no rewriting')
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
    for (const field of endpoint.dates) command.option(`${dateFlags[field]} <YYYY-MM-DD>`, `Explicit ${field}; exactly one business-date selector, no timezone conversion`);
    if (endpoint.guestSelectors) command
      .option('--rvc-num <integer>', 'Native guest-check RVC selector (20.1.9.7+); no implicit RVC filter', integerOption)
      .option('--closed-only <true|false>', 'Explicit clsdGuestChecksOnly boolean; omitted by default', booleanOption);
    if (endpoint.cursor) command.option(`${endpoint.cursor === 'changedSinceUTC' ? '--changed-since-utc' : '--trans-since-utc'} <timestamp>`, `${endpoint.cursor}: offsetless UTC recommended; optional fraction; never normalized or saved`);
    const example = `bi pos-transactions ${endpoint.noun} list --loc-ref "<location-reference>" ${dateFlags[endpoint.dates[0]!]} "<YYYY-MM-DD>"`;
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}\nExample (replace placeholders):\n  ${example}\nPreview:\n  ${example} --dry-run\n\nJSON/file/stdin input uses Oracle field names and the same validations as flags.\nUnknown fields and exact numbers survive. Flags do not clear other date selectors.\nCursors accept YYYY-MM-DDTHH:mm:ss[.fraction][Z], forwarded unchanged. Offsetless\nvalues mean UTC, never machine-local time; offsets are rejected, not converted.\nA since-cursor cannot replace the business date. Scoped live tests accepted offsetless\nseconds and fractions but rejected explicit Z with HTTP 400 on all four cursor endpoints.\nThe CLI still forwards syntactically valid Z unchanged; it never strips Z and retries.\nNon-sales/waste cursor boundaries were inclusive in the tested deployment.\nNo hidden latest-date lookup, date loop, retry or fallback.\n\n--include is projection, not additive. Keep IDs, relationships and curUTC when needed.\nFilters are sent verbatim. Scoped tests verified where-prefixed RVC filters; empty\nline-item extensibility data left its filtering unverified. A nested guest-check line\nfilter selected the parent but retained nonmatching sibling lines. Do not assume\nchild-array pruning or locally aggregate results without understanding their scope.\n${endpoint.note ? `\nCompatibility: ${endpoint.note}\n` : ''}\nResponses are unchanged bytes up to 16 KiB AND 500 lines; above either limit the full\nbody is stored privately and stdout returns a compact file reference, even if redirected.\nProtect sensitive exports; files remain until deleted. No body redaction or truncation.\nDue company profiles renew before data calls; expired tokens require login.\nSuccessful non-quiet calls check npm daily (1-second timeout), notices on stderr only.\nHelp/local/dry-run commands stay offline. No automatic installation or data retries.\n`);
    command.action(async options => setExit(await executeTransaction(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
