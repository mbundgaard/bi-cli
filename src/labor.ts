import { Command } from 'commander';
import { laborEndpoint as endpoint } from './areas/labor.js';
import { integerValue, utcCursor } from './transaction-requests.js';
import { parseJson } from './json.js';
import { buildPostRequest, dateField, stringField, executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export interface LaborOptions extends QueryOptions {
  businessDate?: string; postedDate?: string; changedSinceUtc?: string;
  includeAdjustments?: boolean; empNum?: unknown; extPayrollId?: string;
}
function employeeNumber(value: string): unknown {
  if (!/^-?\d+$/.test(value)) throw new CliError(Exit.usage, '--emp-num must be an integer');
  return parseJson(BigInt(value).toString());
}
function adjustments(value: string): boolean {
  if (value !== 'true' && value !== 'false') throw new CliError(Exit.usage, '--include-adjustments must be true or false');
  return value === 'true';
}
export function buildLaborRequest(state: State, options: LaborOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, 'Time cards require one explicit location; no all-location mode');
  const body = { ...input };
  for (const [flag, field] of [
    ['locRef', 'locRef'], ['businessDate', 'busDt'], ['postedDate', 'postedDt'],
    ['searchCriteria', 'searchCriteria'], ['include', 'include'], ['applicationName', 'applicationName'],
    ['changedSinceUtc', 'changedSinceUTC'], ['includeAdjustments', 'includeAdjustments'],
    ['empNum', 'empNum'], ['extPayrollId', 'extPayrollID'],
  ] as const) if (options[flag] !== undefined) body[field] = options[flag];
  for (const [field, maximum] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128], ['extPayrollID', 32]] as const) stringField(body, field, maximum);
  if (body.locRef === undefined) throw new CliError(Exit.usage, 'Supply --loc-ref or an explicit locRef string in the request body');
  for (const field of ['opnBusDt', 'clsdBusDt', 'rvcNum', 'clsdGuestChecksOnly', 'transSinceUTC', 'PostedDt']) {
    if (body[field] !== undefined) throw new CliError(Exit.usage, `${field} is not supported by ${endpoint.operation}; use documented busDt/postedDt selectors`);
  }
  if (body.busDt === undefined && body.postedDt === undefined) throw new CliError(Exit.usage, 'Supply busDt or postedDt (or both with AND semantics); changedSinceUTC cannot replace a date');
  for (const field of ['busDt', 'postedDt']) if (body[field] !== undefined) dateField(body[field], field);
  if (body.empNum !== undefined && body.extPayrollID !== undefined) throw new CliError(Exit.usage, 'Use at most one employee selector: empNum or extPayrollID');
  if (body.empNum !== undefined && !integerValue(body.empNum)) throw new CliError(Exit.usage, 'empNum must be an integer JSON number');
  if (body.includeAdjustments !== undefined && typeof body.includeAdjustments !== 'boolean') throw new CliError(Exit.usage, 'includeAdjustments must be a JSON boolean');
  if (body.changedSinceUTC !== undefined) utcCursor(body.changedSinceUTC, 'changedSinceUTC');
  return buildPostRequest(endpoint.operation, state, body);
}
export async function executeLabor(source: State | StateStore, options: LaborOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildLaborRequest(state, options, input), directory, notifyUpdate);
}
export function registerLabor(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('labor').description('[read-only] Labor: sensitive time-card reads with explicit location and date selection (20.2+)');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nRequires Labor Management payroll preprocessing. Read current time-card state only; no\nclock-in/out, adjustment, approval, payroll export submission or employee writes.\n');
  const cards = area.command(endpoint.noun).description(endpoint.description);
  cards.action(() => { cards.outputHelp(); });
  const command = cards.command(endpoint.verb).description('[read-only][location/date-scoped] Time cards, optionally including existing adjustments')
    .option('--loc-ref <reference>', 'Required exact location reference, max 99 characters')
    .option('--business-date <YYYY-MM-DD>', 'busDt: time-card business date; busDt and/or postedDt required')
    .option('--posted-date <YYYY-MM-DD>', 'postedDt: cloud posting/update date; combines with busDt using AND, not OR')
    .option('--changed-since-utc <timestamp>', 'Optional changedSinceUTC, unchanged UTC cursor; does not replace date')
    .option('--emp-num <integer>', 'Optional exact employee object number; mutually exclusive with external payroll ID', employeeNumber)
    .option('--ext-payroll-id <identifier>', 'Optional extPayrollID string, max 32 characters; preserves leading zeros/case')
    .option('--include-adjustments <true|false>', 'Explicit includeAdjustments; omitted leaves Oracle default false', adjustments)
    .option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no inferred RVC/employee filters')
    .option('--include <fields>', 'Projection replaces default fields, max 2000 characters; consider sensitive payroll fields')
    .option('--application-name <name>', 'Optional applicationName, max 128 characters')
    .option('--json <object>', 'JSON body; flags override matching fields only')
    .option('--file <path>', 'JSON file or - for stdin; mutually exclusive with --json')
    .option('--dry-run', 'Offline request preview without authorization; supplied identifiers remain visible')
    .option('--quiet', 'Suppress HTTP diagnostics/update checks, not data/errors')
    .option('--timeout <seconds>', 'Positive timeout per network request, at most 300 seconds', value => {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new CliError(Exit.usage, '--timeout must be greater than 0 and at most 300');
      return seconds;
    }, 30);
  command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}
Examples (replace placeholders with authorized values):
  bi labor time-cards list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>" --dry-run
  bi labor time-cards list --loc-ref "<location-reference>" --posted-date "<YYYY-MM-DD>" --include "curUTC,locRef,businessDates.busDt" --dry-run
  bi labor time-cards list --file request.json --dry-run

JSON keys: locRef, busDt, postedDt, changedSinceUTC, empNum, extPayrollID,
includeAdjustments, searchCriteria, include, applicationName. Unknown fields/exact numbers
survive; input is read once before renewal. No native RVC, open/closed or transSinceUTC flag.
Use busDt, postedDt or both (AND), never an inferred default. Ask when date intent is unclear.
Swagger required list incorrectly names PostedDt; property descriptions allow either date.
Use lowercase postedDt, not PostedDt; no silent alias. Oracle descriptions conflict on
insertion versus last-update semantics of postedDt; do not claim a historical snapshot.
Without empNum/extPayrollID, the request can return all employees in the selected scope.
Never silently remove an employee filter; both selectors together are rejected.
includeAdjustments reads existing previous values only; it never creates an adjustment.

Requires API 20.2+ and payroll preprocessing. Results describe the most recent/current
state of time cards; the calculation engine is documented to run every 15 minutes.
Cards without clock-out continue to recur with changedSinceUTC. No polling, cursor
persistence/advancement, deduplication, completeness or finalized-payroll inference.
Cursor syntax: YYYY-MM-DDTHH:mm:ss[.fraction][Z]; offsets rejected, spelling unchanged.
Other endpoints rejected trailing Z; labor cursor compatibility remains live-unverified.
No automatic Z stripping, filter broadening, data retries or redirects.

Response nesting: businessDates[].timeCardDetails[].adjustments[]. Preserve all IDs,
local/UTC timestamps, numeric statuses, unknown codes, missing/null/zero fields and numbers.
Use documented jcNum rather than deprecated jobCodeRef; never rename returned properties.
Protect employee/payroll identifiers, hours/rates/pay/tips, manager names and reasons.
Do not calculate wages/overtime/tax, join employees automatically, or infer clock-out status
from a field omitted by projection. No legal/payroll correctness or compliance conclusions.

Scoped business-date metadata reads and JSON/file/stdin passed but returned no time cards.
Malformed filter syntax returned 400/33214. No employee IDs/pay/tips/adjustments were fetched.
Populated cards, employee filters, posted-date/cursor/adjustment behavior remain unverified.
Empty data does not prove payroll preprocessing is enabled or disabled.
Responses stay verbatim up to 16 KiB AND 500 lines; larger bodies are private complete
exports with compact stdout receipts, including errors with preserved exit codes.
No response parsing, redaction or truncation; files remain until explicitly deleted.
Pinned-company renewal, BI ID-token auth and advisory daily update notices are shared.
Help/local/dry-run stay offline. No automatic installation or STS credential reuse.
`);
  command.action(async options => setExit(await executeLabor(store, options, store.directory, notifyUpdate)));
}
