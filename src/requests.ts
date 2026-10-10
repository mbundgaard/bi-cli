import { readFile } from 'node:fs/promises';
import { CliError, Exit, localResult } from './output.js';
import { baseUrl, bearerToken, stateDirectory, StateStore, activeState, type State } from './state.js';
import { deliverResponse } from './responses.js';
import { refreshCompanies } from './companies.js';
import { notifyForUpdates } from './updates.js';
import { readFileSync } from 'node:fs';
const version: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
import { parseJson, isRawJson } from './json.js';
import type { DimensionEndpoint } from './areas/pos-dimensions.js';
export interface QueryOptions {
  locRef?: string; allLocations?: boolean; searchCriteria?: string; include?: string;
  applicationName?: string; effectiveFrom?: string; effectiveTo?: string;
  json?: string; file?: string; dryRun?: boolean; quiet?: boolean; timeout?: number;
}
export async function inputBody(options: QueryOptions): Promise<Record<string, unknown>> {
  if (options.json !== undefined && options.file !== undefined) throw new CliError(Exit.usage, 'Use either --json or --file, not both');
  let text = options.json;
  if (options.file !== undefined) {
    try {
      if (options.file === '-') {
        const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
        text = Buffer.concat(chunks).toString('utf8');
      } else text = await readFile(options.file, 'utf8');
    } catch { throw new CliError(Exit.usage, 'Cannot read request body file/stdin'); }
  }
  if (text === undefined) return {};
  let body: unknown;
  try { body = parseJson(text.replace(/^\uFEFF/, '')); }
  catch { throw new CliError(Exit.usage, 'Request body is not valid JSON; contents withheld'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || isRawJson(body)) throw new CliError(Exit.usage, 'Request body must be a JSON object');
  return body as Record<string, unknown>;
}
export function stringField(body: Record<string, unknown>, key: string, maximum?: number): void {
  const value = body[key];
  if (value === undefined) return;
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value) || (maximum !== undefined && value.length > maximum)) {
    throw new CliError(Exit.usage, `${key} must be a nonblank string without control characters${maximum ? ` (maximum ${maximum} characters)` : ''}`);
  }
}
export function dateField(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new CliError(Exit.usage, `${field} must be an actual calendar date in YYYY-MM-DD format`);
  }
}
export function buildDimensionRequest(endpoint: DimensionEndpoint, state: State, options: QueryOptions, input: Record<string, unknown> = {}) {
  const body = { ...input };
  for (const [flag, field] of [['locRef', 'locRef'], ['searchCriteria', 'searchCriteria'], ['include', 'include'], ['applicationName', 'applicationName'], ['effectiveFrom', 'effFrDt'], ['effectiveTo', 'effToDt']] as const) {
    if (options[flag] !== undefined) body[field] = options[flag];
  }
  for (const key of ['locRef', 'searchCriteria', 'include']) stringField(body, key);
  stringField(body, 'applicationName', 128);
  if (options.allLocations) {
    if (!endpoint.allLocations) throw new CliError(Exit.usage, '--all-locations is supported only by locations list');
    if (body.locRef !== undefined) throw new CliError(Exit.usage, 'Do not combine --all-locations with locRef (including JSON input)');
  } else if (body.locRef === undefined) {
    throw new CliError(Exit.usage, endpoint.allLocations
      ? 'Supply --loc-ref (or JSON locRef), or explicitly opt into organization-wide discovery with --all-locations'
      : 'Supply --loc-ref or a locRef string in the request body');
  }
  for (const field of ['effFrDt', 'effToDt']) {
    if (body[field] !== undefined) {
      if (!endpoint.priceDates) throw new CliError(Exit.usage, `${field} is supported only by menu-item-prices list`);
      dateField(body[field], field);
    }
  }
  if (typeof body.effFrDt === 'string' && typeof body.effToDt === 'string' && body.effFrDt > body.effToDt) throw new CliError(Exit.usage, 'Effective-from date cannot be after effective-to date');
  return buildPostRequest(endpoint.operation, state, body, options.allLocations ? 'organization-wide' : 'location-scoped');
}
export function buildPostRequest(operation: string, state: State, body: Record<string, unknown>, scope = 'location-scoped') {
  if (!state.auth.orgName || !state.auth.apiUrl) throw new CliError(Exit.notConfigured, 'BI application URL and enterprise shortname are required; run bi auth config');
  // Dot segments are normalized even when encoded by URL implementations.
  if (['.', '..'].includes(state.auth.orgName)) throw new CliError(Exit.usage, 'Enterprise shortname cannot be a URL dot segment');
  const url = `${baseUrl(state.auth.apiUrl)}/bi/v1/${encodeURIComponent(state.auth.orgName)}/${operation}`;
  return { method: 'POST', url, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body, scope };
}
export async function executeDimension(endpoint: DimensionEndpoint, source: State | StateStore, options: QueryOptions, responseDirectory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildDimensionRequest(endpoint, state, options, input), responseDirectory, notifyUpdate);
}
// Shared execution for every implemented data area: one input read, pinned company,
// preflight validation, renewal, unchanged delivery and advisory update notices.
export async function executeQuery(operation: string, source: State | StateStore, options: QueryOptions,
  build: (state: State, input: Record<string, unknown>) => ReturnType<typeof buildPostRequest>,
  responseDirectory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  const store = source instanceof StateStore ? source : undefined;
  const registry = store ? await store.loadCompanies() : undefined;
  const selected = registry?.activeCompany;
  let state: State = registry ? selected ? activeState(registry) : options.dryRun && registry.pending ? registry.pending : activeState(registry) : source as State;
  const input = await inputBody(options); // Read stdin/file exactly once, before any renewal.
  let built = build(state, input);
  if (options.dryRun) {
    localResult('dry-run', { ...built, readOnly: true, authorizationOmitted: true });
    return Exit.ok;
  }
  if (store) {
    await refreshCompanies(store, true, options.timeout, options.quiet);
    const latest = await store.loadCompanies(), profile = selected ? latest.companies[selected] : undefined;
    if (!profile) throw new CliError(Exit.notConfigured, 'Selected BI company was removed; no data request was sent');
    state = profile;
    built = build(state, input);
  }
  const token = bearerToken(state); // BI id_token, never access_token.
  const code = await deliverResponse({ ...built, headers: { ...built.headers, Authorization: `Bearer ${token}` },
    body: JSON.stringify(built.body), timeoutMs: (options.timeout ?? 30) * 1000 }, operation, responseDirectory, options.quiet);
  if (store && code === Exit.ok && !options.quiet) {
    try { await notifyUpdate(store.directory, version); } catch { /* Advisory only. */ }
  }
  return code;
}
