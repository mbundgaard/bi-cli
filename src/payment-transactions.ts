import { Command } from 'commander';
import { paymentTransactionEndpoints, type PaymentTransactionEndpoint } from './areas/payment-transactions.js';
import { buildPostRequest, stringField, dateField, executeQuery, type QueryOptions } from './requests.js';
import { utcCursor } from './transaction-requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export interface PaymentTransactionOptions extends QueryOptions {
  businessDate?: string; settlementDate?: string; bookingDate?: string; payoutDate?: string;
  recordDate?: string; accountCode?: string; changedSinceUtc?: string;
}
export function buildPaymentTransactionRequest(endpoint: PaymentTransactionEndpoint, state: State, options: PaymentTransactionOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, 'Payment transactions have no all-location mode');
  const body = { ...input };
  for (const [flag, field] of [
    ['locRef', 'locRef'], ['accountCode', 'acctCode'], ['businessDate', 'busDt'],
    ['settlementDate', 'stlmtDt'], ['bookingDate', 'bookingDt'], ['payoutDate', 'payoutDt'], ['recordDate', 'recordDt'],
    ['changedSinceUtc', 'changedSinceUTC'], ['searchCriteria', 'searchCriteria'], ['include', 'include'], ['applicationName', 'applicationName'],
  ] as const) if (options[flag] !== undefined) body[field] = options[flag];
  for (const [field, maximum] of [['include', 2000], ['searchCriteria', 2000], ['applicationName', 128]] as const) stringField(body, field, maximum);
  const scopeField = endpoint.accountScoped ? 'acctCode' : 'locRef';
  stringField(body, scopeField, endpoint.accountScoped ? undefined : 99);
  if (body[scopeField] === undefined) throw new CliError(Exit.usage, `Supply explicit ${scopeField}; no account/location discovery or default`);
  if (body[endpoint.dateField] === undefined) throw new CliError(Exit.usage, `Supply ${endpoint.dateFlag} or ${endpoint.dateField}; no date inference`);
  dateField(body[endpoint.dateField], endpoint.dateField);
  const allowed = new Set<string>([scopeField, endpoint.dateField]);
  if (endpoint.cursor) allowed.add('changedSinceUTC');
  for (const field of ['locRef', 'acctCode', 'busDt', 'stlmtDt', 'bookingDt', 'payoutDt', 'recordDt', 'postedDt', 'opnBusDt', 'clsdBusDt', 'rvcNum', 'clsdGuestChecksOnly', 'transSinceUTC', 'changedSinceUTC', 'effFrDt', 'effToDt']) {
    if (body[field] !== undefined && !allowed.has(field)) throw new CliError(Exit.usage, `${field} is not supported by ${endpoint.operation}`);
  }
  if (body.changedSinceUTC !== undefined) utcCursor(body.changedSinceUTC, 'changedSinceUTC');
  return buildPostRequest(endpoint.operation, state, body, endpoint.accountScoped ? 'account/date-scoped' : 'location/date-scoped');
}
export async function executePaymentTransaction(endpoint: PaymentTransactionEndpoint, source: State | StateStore, options: PaymentTransactionOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildPaymentTransactionRequest(endpoint, state, options, input), directory, notifyUpdate);
}
export function registerPaymentTransactions(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('payment-transactions').description('[read-only] Payment Transactions: five explicit scope/date queries');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nPayment Cloud reporting, not payment execution or SPI metadata. Date bases differ by endpoint.\nPayout summary requires an account code, not a location. Never infer dates or discover accounts.\n');
  for (const endpoint of paymentTransactionEndpoints) {
    const noun = area.command(endpoint.noun).description(`${endpoint.operation}; ${endpoint.dateField}, ${endpoint.version}+`);
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command('list').description(`[read-only][${endpoint.accountScoped ? 'account' : 'location'}/date-scoped] ${endpoint.operation}`)
      .option(`${endpoint.dateFlag} <YYYY-MM-DD>`, `Required ${endpoint.dateField} calendar date; not interchangeable with other date bases`);
    if (endpoint.accountScoped) command.option('--account-code <code>', 'Required exact acctCode string; preserve leading zeros/case; no locRef selector');
    else command.option('--loc-ref <reference>', 'Required exact location reference, max 99 characters');
    if (endpoint.cursor) command.option('--changed-since-utc <timestamp>', 'Optional changedSinceUTC; unchanged UTC spelling, never replaces required date');
    command.option('--search-criteria <expression>', 'Oracle filter unchanged, max 2000 characters; no inferred filters')
      .option('--include <fields>', 'Projection replaces defaults, max 2000 characters; preserve needed relationships')
      .option('--application-name <name>', 'Optional applicationName, max 128 characters')
      .option('--json <object>', 'JSON body; flags override matching fields only')
      .option('--file <path>', 'JSON file or - for stdin; mutually exclusive with --json')
      .option('--dry-run', 'Offline preview without authorization; supplied account/request data remains visible')
      .option('--quiet', 'Suppress HTTP diagnostics/update checks, not data/errors')
      .option('--timeout <seconds>', 'Positive timeout per network request, maximum 300 seconds', value => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new CliError(Exit.usage, '--timeout must be greater than 0 and at most 300');
        return seconds;
      }, 30);
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}
Example (replace placeholders with explicitly authorized values):
  bi payment-transactions ${endpoint.noun} list ${endpoint.accountScoped ? '--account-code "<account-code>"' : '--loc-ref "<location-reference>"'} ${endpoint.dateFlag} "<YYYY-MM-DD>" --dry-run

JSON keys: ${endpoint.accountScoped ? 'acctCode' : 'locRef'}, ${endpoint.dateField}, ${endpoint.cursor ? 'changedSinceUTC, ' : ''}include, searchCriteria, applicationName.
No alternative date bases, native RVC, transSinceUTC, all-location or organization-wide mode.
${endpoint.accountScoped ? 'An account code is required; location-only approval does not cover this account-scoped query.' : 'One location is required; acctCode is not a native request selector.'}
Business, settlement, booking, payout and record dates have distinct meanings. Ask if intent
is unclear; never translate one into another, use returned busDt as a different selector,
or imply a date range. Source input is read once before renewal; exact numbers/unknown
fields survive. Filters/projections are forwarded unchanged, with no broader fallback.

Only transactions and payout-summary support changedSinceUTC. Accepted local syntax is
YYYY-MM-DDTHH:mm:ss[.fraction][Z]; calendar/clock validated, numeric offsets rejected.
No cursor conversion, Z stripping, persistence/advancement, polling or deduplication.
Other BI endpoints rejected Z; these endpoints' cursor acceptance/boundaries are unverified.
Payment Cloud Service reporting is distinct from SPI. Prior payment-dimension probes were
permission-rejected (33108); no payment-transaction live calls or availability claims.

Protect account/PSP/merchant/payment/check/employee identifiers, cardBin/cardAlias/authCode,
amounts/fees/tips and dispute details. Do not request full payment records for metadata tests.
Preserve returned data, including string amounts, unknown statuses and type discrepancies:
pmntType schema says boolean but describes PAY/VOID/etc.; cardPresentFlag describes boolean
semantics despite integer schema. Never coerce, label or normalize these fields.
Keep pymtID/pymtDtlID relationships (20.2+); no automatic joins, settlement/payout reconciliation,
netting fees, currency conversion, chargeback state updates or financial/compliance conclusions.
No charge/refund/cancel/settle/payout/dispute writes; list reads existing records only.

Responses stay verbatim up to 16 KiB AND 500 lines; larger bodies become complete private
exports with compact stdout receipts, including errors with preserved exit codes.
No response parsing, redaction, truncation, data retries or redirects. Exports persist until
deleted. Shared execution pins the BI company across renewal and uses ID tokens, never STS.
Successful non-quiet reads may show daily advisory updates; no automatic installation.
Help/local/dry-run stay offline. Live data/filter/selector behavior remains unverified.
`);
    command.action(async options => setExit(await executePaymentTransaction(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
