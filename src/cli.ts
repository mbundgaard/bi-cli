import { Command, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { AuthClient } from './auth.js';
import { StateStore, baseUrl, validateState, tokenSummary } from './state.js';
import { areas } from './areas/index.js';
import { CliError, Exit, localResult, reportError } from './output.js';
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
export function createProgram(store = new StateStore()): Command {
  const root = new Command('bi')
    .description('Oracle Simphony Business Intelligence CLI. Auth is implemented; nine data areas are scaffolded only.')
    .version(version).exitOverride().configureOutput({ writeErr: () => {} });
  root.addHelpText('after', '\nStart: bi auth status; reuse saved tokens or explicitly refresh.\nSetup: bi auth config --help, then bi auth login --help.\nBI uses id_token, not access_token. State is separate from STS and shared per OS user.\nNo environment-variable configuration, directory override, automatic refresh or retries.\nData requests are not implemented yet. Support: support@muneris.dk.\n');
  root.action(() => { root.outputHelp(); });
  root.command('version').description('[read-only][local] Installed version; no update lookup').action(() => localResult('version', { version, node: process.version, dataQueriesImplemented: false }));
  root.command('endpoints').description('[read-only][local] Implementation status and Oracle task areas').action(() => localResult('endpoints', { dataEndpoints: [], areas, status: 'auth-only scaffold' }));
  const auth = root.command('auth').description('Oracle authorization-code + PKCE S256, ID tokens and explicit refresh');
  const status = async () => {
    const state = await store.load(); const tokens = tokenSummary(state.tokens);
    localResult('auth status', { configured: !!(state.auth.authUrl && state.auth.clientId && state.auth.orgName && state.auth.username),
      apiConfigured: !!state.auth.apiUrl, configPath: store.file,
      state: !tokens.hasIdToken ? 'no-tokens' : tokens.expired ? 'expired' : 'valid', tokens,
      serverValidated: false });
  };
  auth.action(status);
  auth.command('status').description('[read-only][local] Token presence/expiry, not server-side validation').action(status);
  auth.command('show').description('[read-only][local] Saved configuration and token summary, never token values').action(async () => {
    const state = await store.load(); localResult('auth show', { configPath: store.file, config: state.auth, tokens: tokenSummary(state.tokens) });
  });
  auth.command('config').description('[writes-state][local] Configure a BI account; changed settings clear saved tokens')
    .option('--auth-url <url>', 'IDM HTTPS base URL from the BI API account details')
    .option('--api-url <url>', 'BI application HTTPS base URL from the account details (saved for future queries)')
    .option('--username <user>', 'BI API account username; case is preserved')
    .option('--client-id <id>', 'Opaque BI client ID, preserved exactly; no STS-format assumption')
    .option('--org <shortname>', 'Explicit enterprise shortname; do not infer it from a BI client ID')
    .addHelpText('after', '\nExample (replace placeholders):\n  bi auth config --auth-url https://idm.example.com --api-url https://reports.example.com --username "<user>" --client-id "<client-id>" --org "<shortname>"\nNo URLs, accounts or organization values are guessed. Passwords are not configuration.\n')
    .action(async opts => {
      if (!Object.keys(opts).length) { const state = await store.load(); localResult('auth config', { configPath: store.file, config: state.auth }); return; }
      await store.mutate(async state => {
        const before = JSON.stringify(state.auth);
        for (const [option, field] of [['authUrl', 'authUrl'], ['apiUrl', 'apiUrl'], ['username', 'username'], ['clientId', 'clientId'], ['org', 'orgName']] as const) {
          if (opts[option] !== undefined) {
            const value = nonblank(opts[option], option);
            state.auth[field] = ['authUrl', 'apiUrl'].includes(option) ? baseUrl(value) : value;
          }
        }
        if (before !== JSON.stringify(state.auth)) delete state.tokens;
      });
      localResult('auth config', { updated: true, configPath: store.file });
    });
  network(auth.command('login').description('[writes-state][network] Fresh Oracle login; password is used for login only'))
    .requiredOption('--password <password>', 'Password used for login only; never saved')
    .option('--username <user>', 'Override the saved username for this login (saved only on success)')
    .addHelpText('after', '\nExample: bi auth login --password "<password>"\nAgents: reuse saved tokens first. Use supplied credentials when the user authorizes login.\nDo not echo passwords, cookies, authorization codes or tokens. Shell history/process listings\ncan expose argument values. Refresh requires no password. HTTP 401 alone is not proof\nof password expiry; only an explicit Oracle expiry response establishes that.\n')
    .action(async opts => {
      await store.mutate(async state => {
        if (opts.username !== undefined) state.auth.username = nonblank(opts.username, '--username');
        state.tokens = await new AuthClient(opts.timeout * 1000, opts.quiet).login(state.auth, opts.password);
      });
      localResult('auth login', { saved: true, configPath: store.file, tokens: tokenSummary((await store.load()).tokens) });
    });
  network(auth.command('refresh').description('[writes-state][network] Explicit refresh; atomically persist rotated tokens'))
    .action(async opts => {
      let rotated = false;
      await store.mutate(async state => {
        const previous = state.tokens?.refreshToken;
        state.tokens = await new AuthClient(opts.timeout * 1000, opts.quiet).refresh(state.auth, state.tokens);
        rotated = previous !== state.tokens.refreshToken;
      });
      localResult('auth refresh', { saved: true, refreshTokenRotated: rotated, configPath: store.file, tokens: tokenSummary((await store.load()).tokens) });
    });
  auth.command('restore').description('[writes-state][local] Restore a private BiCli.json; never import STS tokens')
    .requiredOption('--file <path>', 'Saved BI state or complete recovery file')
    .option('--force', 'Replace already-configured BI state')
    .action(async opts => {
      let imported;
      try { imported = validateState(JSON.parse((await readFileAsync(opts.file, 'utf8')).replace(/^\uFEFF/, ''))); }
      catch { throw new CliError(Exit.state, 'Cannot import this file as BI state; credentials and parser details withheld'); }
      await store.mutate(async state => {
        if (!opts.force && (Object.keys(state.auth).length || state.tokens)) throw new CliError(Exit.state, 'BI state already configured; explicitly use --force to replace it');
        state.auth = imported.auth;
        if (imported.tokens) state.tokens = imported.tokens; else delete state.tokens;
      });
      localResult('auth restore', { restored: true, configPath: store.file });
    });
  for (const area of areas) {
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
export async function main(argv = process.argv, store = new StateStore()): Promise<number> {
  try { await createProgram(store).parseAsync(argv); return Exit.ok; }
  catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) return Exit.ok;
      return reportError(new CliError(Exit.usage, 'Invalid command or arguments; run bi --help or bi auth <command> --help'));
    }
    return reportError(error);
  }
}
