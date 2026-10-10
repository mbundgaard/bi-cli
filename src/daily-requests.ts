import { CliError, Exit } from './output.js';
import { buildPostRequest, dateField, stringField, executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import type { DailyEndpoint } from './areas/aggregations.js';
import { integerValue } from './transaction-requests.js';
export interface DailyOptions extends QueryOptions {
  businessDate?: string; openBusinessDate?: string; closedBusinessDate?: string; rvcNum?: unknown;
}
export function buildDailyRequest(endpoint: DailyEndpoint, state: State, options: DailyOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, 'Daily totals require one explicit location; no all-location mode');
  const body = { ...input };
  for (const [flag, field] of [
    ['locRef', 'locRef'], ['businessDate', 'busDt'], ['searchCriteria', 'searchCriteria'],
    ['include', 'include'], ['applicationName', 'applicationName'],
    ['openBusinessDate', 'opnBusDt'], ['closedBusinessDate', 'clsdBusDt'], ['rvcNum', 'rvcNum'],
  ] as const) if (options[flag] !== undefined) body[field] = options[flag];
  for (const [field, maximum] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128]] as const) stringField(body, field, maximum);
  if (body.locRef === undefined) throw new CliError(Exit.usage, 'Supply --loc-ref or an explicit locRef string in the request body');
  if (endpoint.control) {
    const dates = ['busDt', 'opnBusDt', 'clsdBusDt'].filter(field => body[field] !== undefined);
    if (dates.length !== 1) throw new CliError(Exit.usage, 'Control totals require exactly one business date: busDt, opnBusDt or clsdBusDt');
    dateField(body[dates[0]!], dates[0]!);
    if (body.rvcNum !== undefined && !integerValue(body.rvcNum)) throw new CliError(Exit.usage, 'rvcNum must be an integer JSON number');
  } else {
    if (body.busDt === undefined) throw new CliError(Exit.usage, 'Supply --business-date or an explicit busDt; daily totals do not default a date');
    dateField(body.busDt, 'busDt');
  }
  // These CLI-recognized selectors belong to other operations. Never silently ignore them.
  const unsupported = ['clsdGuestChecksOnly', 'changedSinceUTC', 'transSinceUTC', ...(!endpoint.control ? ['opnBusDt', 'clsdBusDt', 'rvcNum'] : [])];
  for (const field of unsupported) {
    if (body[field] !== undefined) throw new CliError(Exit.usage, `${field} is not supported by ${endpoint.operation}`);
  }
  return buildPostRequest(endpoint.operation, state, body);
}
export async function executeDaily(endpoint: DailyEndpoint, source: State | StateStore, options: DailyOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildDailyRequest(endpoint, state, options, input), directory, notifyUpdate);
}
