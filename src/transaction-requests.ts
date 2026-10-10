import { CliError, Exit } from './output.js';
import { parseJson, isRawJson } from './json.js';
import { buildPostRequest, dateField, stringField, executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import type { TransactionEndpoint } from './areas/pos-transactions.js';
export interface TransactionOptions extends QueryOptions {
  businessDate?: string; openBusinessDate?: string; closedBusinessDate?: string;
  rvcNum?: unknown; closedOnly?: boolean; changedSinceUtc?: string; transSinceUtc?: string;
}
export function booleanOption(value: string): boolean {
  if (value !== 'true' && value !== 'false') throw new CliError(Exit.usage, '--closed-only must be true or false');
  return value === 'true';
}
export function integerOption(value: string): unknown {
  if (value.trim() !== value || !/^-?\d+$/.test(value)) throw new CliError(Exit.usage, '--rvc-num must be an integer');
  return parseJson(BigInt(value).toString());
}
// Validate numeric integer values without rounding raw JSON integers/decimals/exponents.
function integerValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && Number.isInteger(value);
  if (!isRawJson(value)) return false;
  const match = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(JSON.stringify(value));
  if (!match) return false;
  const fraction = match[2] ?? '', digits = match[1]! + fraction;
  const scale = BigInt(match[3] ?? '0') - BigInt(fraction.length);
  if (scale >= 0n || /^0+$/.test(digits)) return true;
  const zeros = -scale;
  return zeros <= BigInt(digits.length) && /^0+$/.test(digits.slice(-Number(zeros)));
}
export function utcCursor(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim() !== value || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z?$/.test(value)) {
    throw new CliError(Exit.usage, `${field} must be UTC YYYY-MM-DDTHH:mm:ss, optional fractional seconds and optional Z; offsets are not converted`);
  }
  dateField(value.slice(0, 10), field);
}
const dateFields = ['busDt', 'opnBusDt', 'clsdBusDt'] as const;
const ownedFields = [...dateFields, 'rvcNum', 'clsdGuestChecksOnly', 'changedSinceUTC', 'transSinceUTC'] as const;
export function buildTransactionRequest(endpoint: TransactionEndpoint, state: State, options: TransactionOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, 'Transactions require one explicit location; no all-location mode');
  const body = { ...input };
  for (const [flag, field] of [
    ['locRef', 'locRef'], ['searchCriteria', 'searchCriteria'], ['include', 'include'], ['applicationName', 'applicationName'],
    ['businessDate', 'busDt'], ['openBusinessDate', 'opnBusDt'], ['closedBusinessDate', 'clsdBusDt'],
    ['rvcNum', 'rvcNum'], ['closedOnly', 'clsdGuestChecksOnly'], ['changedSinceUtc', 'changedSinceUTC'], ['transSinceUtc', 'transSinceUTC'],
  ] as const) if (options[flag] !== undefined) body[field] = options[flag];
  for (const [field, maximum] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128]] as const) stringField(body, field, maximum);
  if (body.locRef === undefined) throw new CliError(Exit.usage, 'Supply --loc-ref or an explicit locRef string in the request body');
  const allowed = new Set<string>(endpoint.dates);
  if (endpoint.cursor) allowed.add(endpoint.cursor);
  if (endpoint.guestSelectors) { allowed.add('rvcNum'); allowed.add('clsdGuestChecksOnly'); }
  for (const field of ownedFields) if (body[field] !== undefined && !allowed.has(field)) throw new CliError(Exit.usage, `${field} is not supported by ${endpoint.operation}`);
  const selected = dateFields.filter(field => body[field] !== undefined);
  if (selected.length !== 1) throw new CliError(Exit.usage, `Supply exactly one business date: ${endpoint.dates.join(', ')}; a since-cursor cannot replace it`);
  dateField(body[selected[0]!], selected[0]!);
  if (body.rvcNum !== undefined && !integerValue(body.rvcNum)) throw new CliError(Exit.usage, 'rvcNum must be an integer JSON number');
  if (body.clsdGuestChecksOnly !== undefined && typeof body.clsdGuestChecksOnly !== 'boolean') throw new CliError(Exit.usage, 'clsdGuestChecksOnly must be a JSON boolean');
  if (endpoint.cursor && body[endpoint.cursor] !== undefined) utcCursor(body[endpoint.cursor], endpoint.cursor);
  return buildPostRequest(endpoint.operation, state, body);
}
export async function executeTransaction(endpoint: TransactionEndpoint, source: State | StateStore, options: TransactionOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildTransactionRequest(endpoint, state, options, input), directory, notifyUpdate);
}
