import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { StateStore, baseUrl, validateCompanies, tokenSummary, activeState, emptyState, type State } from './state.js';
import { registerCompanies, loginCompany, refreshCompanies } from './companies.js';
import { checkForUpdates, notifyForUpdates } from './updates.js';
import { areas } from './areas/index.js';
import { dimensionEndpoints } from './areas/pos-dimensions.js';
import { registerDimensions } from './query-commands.js';
import { registerTransactions } from './transaction-commands.js';
import { transactionEndpoints } from './areas/pos-transactions.js';
import { CliError, Exit, localResult, reportError } from './output.js';
const implementedAreas = ['pos-dimensions', 'pos-transactions'];
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
function network(command: Command): Command {
  return command.option('--quiet', 'Suppress HTTP status diagnostics (not failures)')
    .option('--timeout <seconds>', 'Positive request timeout, at most 300 seconds', value => {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new CliError(Exit.usage, '--timeout must be a number greater than 0 and at most 300');
      return seconds;
    }, 30);
}
function nonblank(value: string, flag: string): string {
  if (!value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new CliError(Exit.usage, `${flag} must be nonblank and contain no control characters`);
  return value; // Preserve significant client-ID characters and username casing.
}
export function createProgram(store = new StateStore(), setExit: (code: number) => void = code => { process.exitCode = code; }, checkVersion = checkForUpdates, notifyUpdate = notifyForUpdates): Command {
  const root = new Command('bi')
    .description('Oracle Simphony Business Intelligence CLI. Auth, POS dimensions and POS transactions are implemented; seven other data areas are planned.')
    .version(version).exitOverride().configureOutput({ writeErr: () => {} });
  root.addHelpText('after', '\nStart: bi auth status; reuse saved tokens or explicitly refresh.\nSetup: bi auth config --help, then bi auth login --help.\nBI uses id_token, not access_token. State is separate from STS and shared per OS user.\nNo environment-variable configuration, directory override or data retries.\nCompany profiles renew when due before data calls; expired token sets require login.\nSuccessful non-quiet calls check npm daily and notify on stderr; never install automatically.\nHelp/local/dry-run commands stay offline. Use bi version --check for an explicit lookup.\nPOS dimensions: bi pos-dimensions --help. Transactions: bi pos-transactions --help. Other data areas remain planned. Support: support@muneris.dk.\n');
  root.action(() => { root.outputHelp(); });
  registerCompanies(root, store);
  root.command('version').description('[read-only] Installed version; --check explicitly queries npm')
    .option('--check', 'Check npm latest with a 5-second timeout; never installs updates')
    .addHelpText('after', '\nExample: bi version --check\nRespect the installation method and ask before updating. No credentials are sent.\nAutomatic checks run daily after successful non-quiet data calls (1-second timeout).\nUntil BI is published, npm may report unavailable; that never means up to date.\nSupport: support@muneris.dk. Never share credentials or unreviewed customer data.\n')
    .action(async opts => localResult('version', { version, node: process.version, implementedDataAreas: implementedAreas, ...(opts.check ? { update: await checkVersion(version) } : {}) }));
  root.command('endpoints').description('[read-only][local] Implemented data endpoints and Oracle task areas').action(() => localResult('endpoints', {
    dataEndpoints: [
      ...dimensionEndpoints.map(endpoint => ({ command: `bi pos-dimensions ${endpoint.noun} ${endpoint.verb}`, method: 'POST', path: `/bi/v1/{orgIdentifier}/${endpoint.operation}`, readOnly: true, scope: endpoint.allLocations ? 'location-or-organization-wide' : 'location-scoped' })),
      ...transactionEndpoints.map(endpoint => ({ command: `bi pos-transactions ${endpoint.noun} ${endpoint.verb}`, method: 'POST', path: `/bi/v1/{orgIdentifier}/${endpoint.operation}`, readOnly: true, scope: 'location/date-scoped', dateFields: endpoint.dates, cursorField: endpoint.cursor })),
    ],
    areas: areas.map(area => ({ ...area, implemented: implementedAreas.includes(area.name) })),
  }));
  const auth = root.command('auth').description('Oracle authorization-code + PKCE S256, ID tokens and scheduled company renewal');
  const status = async () => {
    const registry = await store.loadCompanies();
    const state = registry.activeCompany ? activeState(registry) : registry.pending ?? emptyState();
    const tokens = tokenSummary(state.tokens);
    localResult('auth status', { configured: !!(state.auth.authUrl && state.auth.clientId && state.auth.orgName && state.auth.username),
      apiConfigured: !!state.auth.apiUrl, configPath: store.file,
      state: !tokens.hasIdToken ? 'no-tokens' : tokens.expired === undefined ? 'unknown-expiry' : tokens.expired ? 'expired' : 'valid', tokens,
      activeCompany: registry.activeCompany, pendingConfiguration: !!registry.pending,
      refreshAfter: registry.activeCompany ? registry.companies[registry.activeCompany]?.refreshAfter : undefined, serverValidated: false });
  };
  auth.action(status);
  auth.command('status').description('[read-only][local] Token presence/expiry, not server-side validation').action(status);
  auth.command('show').description('[read-only][local] Saved configuration and token summary, never token values').action(async () => {
    const registry = await store.loadCompanies();
    const state = registry.pending ?? (registry.activeCompany ? activeState(registry) : emptyState());
    localResult('auth show', { configPath: store.file, config: state.auth, tokens: tokenSummary(state.tokens),
      activeCompany: registry.activeCompany, pendingConfiguration: !!registry.pending });
  });
  auth.command('config').description('[writes-state][local] Prepare BI login configuration; saved companies/tokens remain unchanged')
    .option('--auth-url <url>', 'IDM HTTPS base URL from the BI API account details')
    .option('--api-url <url>', 'BI application HTTPS base URL from the account details (used for data queries)')
    .option('--username <user>', 'BI API account username; case is preserved')
    .option('--client-id <id>', 'Opaque BI client ID, preserved exactly; no STS-format assumption')
    .option('--org <shortname>', 'Explicit enterprise shortname; do not infer it from a BI client ID')
    .addHelpText('after', '\nExample (replace placeholders):\n  bi auth config --auth-url https://idm.example.com --api-url https://reports.example.com --username "<user>" --client-id "<client-id>" --org "<shortname>"\nNo URLs, accounts or organization values are guessed. Passwords are not configuration.\nSuccessful login saves/selects the company. Failed login preserves profiles/selection.\nTo replace a same-user login/configuration, select its exact key and explicitly log out first.\n')
    .action(async opts => {
      if (!Object.keys(opts).length) { const state = await store.load(); localResult('auth config', { configPath: store.file, config: state.auth }); return; }
      await store.mutateCompanies(async registry => {
        const current = registry.activeCompany ? activeState(registry) : undefined;
        const state: State = { schemaVersion: 1, auth: { ...(registry.pending?.auth ?? current?.auth ?? {}) } };
        for (const [option, field] of [['authUrl', 'authUrl'], ['apiUrl', 'apiUrl'], ['username', 'username'], ['clientId', 'clientId'], ['org', 'orgName']] as const) {
          if (opts[option] !== undefined) {
            const value = nonblank(opts[option], option);
            state.auth[field] = ['authUrl', 'apiUrl'].includes(option) ? baseUrl(value) : value;
          }
        }
        if (JSON.stringify(state.auth) === JSON.stringify(current?.auth)) delete registry.pending;
        else registry.pending = state;
      });
      localResult('auth config', { updated: true, configPath: store.file });
    });
  network(auth.command('login').description('[writes-state][network] Fresh Oracle login; password is used for login only'))
    .option('--password <password>', 'Password used for login only; never saved')
    .option('--username <user>', 'Override the saved username for this login (saved only on success)')
    .addHelpText('after', '\nExample: bi auth login --password "<password>"\nAgents: reuse saved tokens first. Use supplied credentials when the user authorizes login.\nDo not echo passwords, cookies, authorization codes or tokens. Shell history/process listings\ncan expose argument values. Refresh requires no password. HTTP 401 alone is not proof\nof password expiry; only an explicit Oracle expiry response establishes that.\n')
    .action(async opts => {
      const username = opts.username === undefined ? undefined : nonblank(opts.username, '--username');
      localResult('auth login', await loginCompany(store, opts.password, username, opts.timeout, opts.quiet));
    });
  network(auth.command('refresh').description('[writes-state][network] Renew all unexpired company profiles now; persist rotations separately'))
    .addHelpText('after', '\nExplicit refresh bypasses cooldown but never renews expired tokens.\nSuccess schedules +24 hours; failure +1 hour while retaining valid tokens.\nNo daemon or retries. Active selection is unchanged.\n')
    .action(async opts => {
      const companies = await refreshCompanies(store, false, opts.timeout, opts.quiet);
      setExit(companies.find(result => result.code)?.code ?? (companies.length ? Exit.ok : Exit.noTokens));
      localResult('auth refresh', { companies, activeCompany: (await store.loadCompanies()).activeCompany, configPath: store.file });
    });
  auth.command('logout').description('[writes-state][local] Remove active-company tokens only; no Oracle revocation').action(async () => {
    await store.mutateCompanies(async registry => {
      const profile = registry.activeCompany ? activeState(registry) : registry.pending;
      if (profile) { delete profile.tokens; if ('refreshAfter' in profile) delete profile.refreshAfter; }
    });
    localResult('auth logout', { cleared: true, configPath: store.file });
  });
  auth.command('restore').description('[writes-state][local] Restore a private BiCli.json; never import STS tokens')
    .requiredOption('--file <path>', 'Saved BI state or complete recovery file')
    .option('--force', 'Replace already-configured BI state')
    .action(async opts => {
      let imported;
      try { imported = validateCompanies(JSON.parse((await readFileAsync(opts.file, 'utf8')).replace(/^\uFEFF/, ''))); }
      catch { throw new CliError(Exit.state, 'Cannot import this file as BI state; credentials and parser details withheld'); }
      await store.mutateCompanies(async registry => {
        if (!opts.force && (Object.keys(registry.companies).length || registry.pending)) throw new CliError(Exit.state, 'BI state already configured; explicitly use --force to replace it');
        for (const key of Object.keys(registry)) delete (registry as unknown as Record<string, unknown>)[key];
        Object.assign(registry, imported);
      });
      localResult('auth restore', { restored: true, configPath: store.file });
    });
  registerDimensions(root, store, setExit, notifyUpdate);
  registerTransactions(root, store, setExit, notifyUpdate);
  for (const area of areas.filter(area => !implementedAreas.includes(area.name))) {
    const command = root.command(area.name).description(`[planned] ${area.oracleName}; data queries not implemented`);
    command.action(() => { command.outputHelp(); });
    command.addHelpText('after', '\nThis area is scaffolded only. No data request is sent.\n');
    for (const section of area.sections ?? []) {
      const child = command.command(section).description('[planned] Aggregation queries not implemented');
      child.action(() => { child.outputHelp(); });
    }
  }
  return root;
}
export async function main(argv = process.argv, store = new StateStore(), notifyUpdate = notifyForUpdates): Promise<number> {
  let code: number = Exit.ok;
  try { await createProgram(store, result => { code = result; }, checkForUpdates, notifyUpdate).parseAsync(argv); return code; }
  catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return Exit.ok;
      return reportError(new CliError(Exit.usage, 'Invalid command or arguments; run bi --help or bi auth <command> --help'));
    }
    return reportError(error);
  }
}
