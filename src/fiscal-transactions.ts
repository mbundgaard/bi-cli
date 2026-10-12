import { Command } from 'commander';
import { fiscalEndpoints, type FiscalEndpoint } from './areas/fiscal-transactions.js';
import { buildPostRequest, validateLocationDateBody, executeQuery, type QueryOptions } from './requests.js';
import { StateStore, stateDirectory, type State } from './state.js';
import { notifyForUpdates } from './updates.js';
import { CliError, Exit } from './output.js';
export interface FiscalOptions extends QueryOptions { businessDate?: string }
export function buildFiscalRequest(endpoint: FiscalEndpoint, state: State, options: FiscalOptions, input: Record<string, unknown> = {}) {
  if (options.allLocations) throw new CliError(Exit.usage, 'Fiscal reads require one explicit location; no all-location mode');
  const body = { ...input };
  for (const [flag, field] of [
    ['locRef', 'locRef'], ['businessDate', 'busDt'], ['searchCriteria', 'searchCriteria'],
    ['include', 'include'], ['applicationName', 'applicationName'],
  ] as const) if (options[flag] !== undefined) body[field] = options[flag];
  validateLocationDateBody(endpoint.operation, body);
  return buildPostRequest(endpoint.operation, state, body);
}
export async function executeFiscal(endpoint: FiscalEndpoint, source: State | StateStore, options: FiscalOptions,
  directory = source instanceof StateStore ? source.directory : stateDirectory(), notifyUpdate = notifyForUpdates): Promise<number> {
  return executeQuery(endpoint.operation, source, options, (state, input) => buildFiscalRequest(endpoint, state, options, input), directory, notifyUpdate);
}
export function registerFiscal(root: Command, store: StateStore, setExit: (code: number) => void, notifyUpdate = notifyForUpdates): void {
  const area = root.command('fiscal-transactions').description('[read-only] Fiscal Transactions: three explicit location/business-date queries');
  area.action(() => { area.outputHelp(); });
  area.addHelpText('after', '\nRead existing fiscal records only. No invoice issuance, cancellation, signing, sequence changes\nor locking. Country-specific fiscal values remain verbatim; no tax/compliance conclusions.\n');
  for (const endpoint of fiscalEndpoints) {
    const noun = area.command(endpoint.noun).description(endpoint.description);
    noun.action(() => { noun.outputHelp(); });
    const command = noun.command('list').description(`[read-only][location/date-scoped] ${endpoint.description}`)
      .option('--loc-ref <reference>', 'Exact location reference, max 99 characters; required, never guessed')
      .option('--business-date <YYYY-MM-DD>', 'Explicit busDt calendar date; no default or alternate fiscal-date selector')
      .option('--search-criteria <expression>', 'Oracle filter verbatim, max 2000 characters; no inferred filters')
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
    const example = `bi fiscal-transactions ${endpoint.noun} list --loc-ref "<location-reference>" --business-date "<YYYY-MM-DD>"`;
    command.addHelpText('after', `\nOracle: POST /bi/v1/{orgIdentifier}/${endpoint.operation}\nExamples (replace placeholders):\n  ${example} --dry-run\n  ${example} --include "locRef,busDt,revenueCenters.rvcNum,revenueCenters.${endpoint.responseArray}.wsNum"\n\nJSON/file/stdin use locRef, busDt, searchCriteria, include and applicationName.\nUnknown fields and exact request numbers survive. Input is read once before renewal.\nNo native RVC, workstation, invoice-number, open/closed-date, fiscal-date or cursor flags.\nAn explicit RVC filter can use "where equals(revenueCenters.rvcNum,<rvc-number>)".\nScoped reads/input modes passed; totals had workstation data and an RVC-filtered read succeeded.\nOnly one RVC was present, so excluding other RVCs was not established.\nInvoices/invoice controls were empty; populated data and nested filtering remain unverified.\nNo filter rewrite or broader fallback.\n\nKeep country-specific codes, numbered subtotal/tax/info fields and embedded json as returned.\nNever decode an embedded JSON string, rename fields, label codes, sum taxes or infer legal\nvalidity, invoice sequence completeness or lock ownership from a successful read.\nResponse device/open/resolution dates are not alternate request dates. Invoice schema\nfcrBusinessDate differs from example fcrBusinessDt; fiscal totals use fcrBusDt.\nPreserve actual spelling. Embedded json is documented as object but examples show string\n(20.1.12+); neither representation is transformed. customerDataNum requires 20.1.10+.\nProtect customer references, invoice identifiers, fiscalKey and country-specific blobs.\n\nResponses stay verbatim up to 16 KiB AND 500 lines; larger bodies are stored privately\nand stdout receives a compact file reference, including API errors and redirected output.\nNo parsing, redaction, truncation, data retries or redirects. Files remain until deleted.\nPinned-company renewal and ID-token authorization are shared with other BI reads.\nSuccessful non-quiet calls check npm daily; no automatic installation.\nHelp/local/dry-run commands stay offline.\n`);
    command.action(async options => setExit(await executeFiscal(endpoint, store, options, store.directory, notifyUpdate)));
  }
}
