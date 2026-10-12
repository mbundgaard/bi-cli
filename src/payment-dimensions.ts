import { Command } from 'commander';
import { paymentDimensionEndpoints, type PaymentDimensionEndpoint } from './areas/payment-dimensions.js';
import { buildPostRequest, stringField, executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export interface PaymentDimensionOptions extends QueryOptions { organizationWide?: boolean }
export function buildPaymentDimensionRequest(endpoint: PaymentDimensionEndpoint, state: State, options: PaymentDimensionOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, '--all-locations is not supported by payment dimensions');
  const body = { ...input };
  for (const [flag, field] of [['locRef', 'locRef'], ['include', 'include'], ['searchCriteria', 'searchCriteria'], ['applicationName', 'applicationName']] as const) {
    if (options[flag] !== undefined) body[field] = options[flag];
  }
  for (const [field, maximum] of [['include', 2000], ['searchCriteria', 2000], ['applicationName', 128]] as const) stringField(body, field, maximum);
  if (endpoint.organizationWide) {
    if (body.locRef !== undefined) throw new CliError(Exit.usage, 'Account holders have no locRef selector; do not imply location scope');
    if (options.organizationWide !== true) throw new CliError(Exit.usage, 'Account holders require explicit --organization-wide; location-only approval is insufficient');
  } else {
    if (options.organizationWide) throw new CliError(Exit.usage, 'Payment accounts require one explicit location, not --organization-wide');
    stringField(body, 'locRef', 99);
    if (body.locRef === undefined) throw new CliError(Exit.usage, 'Supply --loc-ref or an explicit locRef string in the request body');
  }
  for (const field of ['busDt', 'postedDt', 'opnBusDt', 'clsdBusDt', 'changedSinceUTC', 'transSinceUTC', 'rvcNum', 'clsdGuestChecksOnly', 'effFrDt', 'effToDt']) {
    if (body[field] !== undefined) throw new CliError(Exit.usage, `${field} is not supported by ${endpoint.operation}; these dimensions have no date/cursor/RVC selector`);
  }
  return buildPostRequest(endpoint.operation, state, body, endpoint.organizationWide ? 'organization-wide' : 'location-scoped');
}
export async function executePaymentDimension(endpoint: PaymentDimensionEndpoint, source: State | StateStore, options: PaymentDimensionOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildPaymentDimensionRequest(endpoint, state, options, input), directory, notifyUpdate);
}
export function registerPaymentDimensions(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('payment-dimensions').description('[read-only] Payment Dimensions: two Payment Cloud Service queries (20.1.11+)');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nOracle MICROS Payment Cloud Service only, not SPI payment metadata.\nAccount holders are organization-wide; accounts require one explicit location. No business dates.\nNo account creation, activation, verification, settlement or payment writes.\n');
  for (const endpoint of paymentDimensionEndpoints) {
    const noun = area.command(endpoint.noun).description(endpoint.organizationWide ? 'Sensitive organization-wide account-holder dimensions' : 'Sensitive location-scoped payment-account dimensions');
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command('list').description(`[read-only][${endpoint.organizationWide ? 'organization-wide' : 'location-scoped'}] Payment Cloud dimensions`);
    if (endpoint.organizationWide) command.option('--organization-wide', 'Explicitly acknowledge organization scope; required even with filters or JSON input');
    else command.option('--loc-ref <reference>', 'Required exact location reference, max 99 characters; never guessed');
    command.option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no scope inference')
      .option('--include <fields>', 'Projection replaces defaults, max 2000 characters; consider sensitive contact/account fields')
      .option('--application-name <name>', 'Optional applicationName, max 128 characters')
      .option('--json <object>', 'JSON body; flags override matching fields only')
      .option('--file <path>', 'JSON file or - for stdin; mutually exclusive with --json')
      .option('--dry-run', 'Offline preview without authorization; supplied request fields remain visible')
      .option('--quiet', 'Suppress HTTP diagnostics/update checks, not data/errors')
      .option('--timeout <seconds>', 'Positive timeout per network request, at most 300 seconds', value => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new CliError(Exit.usage, '--timeout must be greater than 0 and at most 300');
        return seconds;
      }, 30);
    const scope = endpoint.organizationWide ? '--organization-wide' : '--loc-ref "<location-reference>"';
    const status = endpoint.organizationWide ? 'acctHldrStatus' : 'acctStatus';
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}
Examples (replace placeholders and obtain scope approval):
  bi payment-dimensions ${endpoint.noun} list ${scope} --dry-run
  bi payment-dimensions ${endpoint.noun} list ${scope} --include "${endpoint.responseArray}.${status}" --dry-run

JSON fields: ${endpoint.organizationWide ? '' : 'locRef, '}include, searchCriteria, applicationName.
${endpoint.organizationWide ? '--organization-wide is a local safety acknowledgement, never an API field. No locRef selector.\nFilters and projections do not turn this into a location-scoped request.' : 'An explicit location is required; no organization-wide or all-location mode.'}
No business/posted/effective dates, cursor, native RVC or account-code flags are documented.
Unknown JSON fields and exact numbers survive without endorsement as supported selectors.
Input is read once before renewal. Never drop a rejected filter or invent a broader fallback.

Requires Oracle MICROS Payment Cloud Service, 20.1.11+. SPI/STS permissions or data do not
establish availability. Empty results do not prove the service is enabled or disabled.
Offline-tested. Scoped status-only live probes on both routes were rejected with HTTP 400,
Oracle 33108 (documented permission denial). CLI preserves HTTP 400/exit 11, not a guessed 403.
Successful data/projection/filter behavior remains unverified. No retries or scope expansion.
Protect account/holder codes and names, business email/phone/address and statement names.
These are Payment Cloud account dimensions, not an API for collecting customer card numbers.
Keep codes as strings, leading zeros, unknown numeric statuses and missing/null fields.
Do not label statuses, join holder/account records automatically, infer verification or
settlement eligibility, change currency values or make compliance conclusions.

Responses stay verbatim up to 16 KiB AND 500 lines; larger bodies are complete private
exports with compact stdout receipts. HTTP errors retain exit codes. No response parsing,
redaction, truncation, data retries or redirects. Exports remain until explicitly deleted.
Shared pinned-company renewal uses BI ID tokens, never STS credentials. Successful
non-quiet reads may show daily advisory update notices; no automatic installation.
Help/local/dry-run stay offline. No business writes or date/location discovery.
`);
    command.action(async options => setExit(await executePaymentDimension(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
