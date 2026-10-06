import { mkdir, readFile, rename, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { CliError, Exit } from './output.js';
import { validateUrl } from './transport.js';

export interface AuthConfig {
  authUrl?: string; apiUrl?: string; clientId?: string; orgName?: string; username?: string;
}
export interface TokenSet {
  idToken: string; refreshToken: string; codeVerifier: string; obtainedAt: string; expiresIn: number;
}
export interface State { schemaVersion: 1; auth: AuthConfig; tokens?: TokenSet }
export const emptyState = (): State => ({ schemaVersion: 1, auth: {} });
export function stateDirectory(home = os.homedir()): string {
  if (process.platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'BiCli');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'BiCli');
  return path.join(home, '.config', 'BiCli');
}
export function baseUrl(value: string): string {
  const url = validateUrl(value);
  if (url.search || value.includes('?') || value.includes('#')) throw new CliError(Exit.usage, 'Base URL cannot contain a query or fragment');
  return url.href.replace(/\/$/, '');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(message: string): never { throw new CliError(Exit.state, message); }
export function validateState(value: unknown): State {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.auth)) fail('Expected BI state schemaVersion 1 with an auth object; STS state cannot be imported');
  if (Object.keys(value).some(key => !['schemaVersion', 'auth', 'tokens'].includes(key))) fail('Unknown BI state field');
  const keys = ['authUrl', 'apiUrl', 'clientId', 'orgName', 'username'];
  if (Object.keys(value.auth).some(key => !keys.includes(key))) fail('Unknown auth field; passwords must never be saved');
  for (const key of keys) {
    const item = value.auth[key];
    if (item !== undefined && (typeof item !== 'string' || !item.trim() || /[\u0000-\u001f\u007f]/.test(item))) fail(`Invalid auth.${key}`);
  }
  for (const key of ['authUrl', 'apiUrl']) {
    if (typeof value.auth[key] === 'string') {
      try { baseUrl(value.auth[key]); } catch { fail(`Invalid auth.${key}: HTTPS base URL required`); }
    }
  }
  if (value.tokens !== undefined) {
    if (!object(value.tokens)) fail('Invalid tokens object');
    if (Object.keys(value.tokens).some(key => !['idToken', 'refreshToken', 'codeVerifier', 'obtainedAt', 'expiresIn'].includes(key))) fail('Unknown token field; BI requires id_token, not STS access_token');
    for (const key of ['idToken', 'refreshToken', 'codeVerifier', 'obtainedAt']) {
      if (typeof value.tokens[key] !== 'string' || !value.tokens[key]) fail(`Missing or invalid tokens.${key}`);
    }
    const time = Date.parse(value.tokens.obtainedAt as string);
    const seconds = value.tokens.expiresIn;
    if (!Number.isFinite(time) || typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isFinite(new Date(time + seconds * 1000).getTime())) fail('Invalid token lifetime');
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(value.tokens.codeVerifier as string)) fail('Invalid saved PKCE verifier');
  }
  return value as unknown as State;
}
export class StateStore {
  readonly file: string;
  constructor(readonly directory = stateDirectory()) { this.file = path.join(directory, 'BiCli.json'); }
  async load(): Promise<State> {
    let text: string;
    try { text = await readFile(this.file, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
      throw new CliError(Exit.state, `Cannot read BI state at ${this.file}; it has not been overwritten`);
    }
    let value: unknown;
    try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new CliError(Exit.state, `Invalid JSON in BI state at ${this.file}; repair from a protected backup`); }
    return validateState(value);
  }
  async save(state: State): Promise<void> {
    validateState(state);
    const temp = `${this.file}.${randomUUID()}.tmp`;
    let complete = false;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const handle = await open(temp, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(state, null, 2) + '\n'); await handle.sync(); complete = true; }
      finally { await handle.close(); }
      await rename(temp, this.file);
    } catch {
      throw new CliError(Exit.state, `Cannot save BI state at ${this.file}`,
        complete ? `Complete recovery copy: ${temp}. Tokens may already have rotated. Do not retry login/refresh using old state. Repair filesystem access, then use bi auth restore --file "${temp}" --force. Keep the copy private.` : 'No complete recovery copy was written. If Oracle issued tokens, resolve the state failure before further auth operations.');
    } finally {
      if (!complete) await unlink(temp).catch(() => {});
    }
  }
  async mutate<T>(run: (state: State) => Promise<T>): Promise<T> {
    const file = `${this.file}.lock`;
    let lock;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      lock = await open(file, 'wx', 0o600);
    } catch { throw new CliError(Exit.state, `Cannot lock BI state; inspect ${file} before removing a stale lock`); }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      const state = await this.load();
      const result = await run(state);
      await this.save(state);
      return result;
    } finally { await lock.close(); await unlink(file); }
  }
}
export function tokenSummary(tokens?: TokenSet) {
  const expiresAt = tokens ? new Date(Date.parse(tokens.obtainedAt) + tokens.expiresIn * 1000).toISOString() : undefined;
  const secondsRemaining = expiresAt ? Math.floor((Date.parse(expiresAt) - Date.now()) / 1000) : undefined;
  return { hasIdToken: !!tokens?.idToken, hasRefreshToken: !!tokens?.refreshToken,
    obtainedAt: tokens?.obtainedAt, expiresIn: tokens?.expiresIn, expiresAt, secondsRemaining,
    expired: secondsRemaining === undefined ? undefined : secondsRemaining <= 0 };
}
// Future BI request builders must use this helper, never access_token.
export function bearerToken(state: State): string {
  if (!state.tokens?.idToken) throw new CliError(Exit.noTokens, 'No BI ID token saved; run bi auth login');
  if (tokenSummary(state.tokens).expired) throw new CliError(Exit.auth, 'BI ID token expired; run bi auth refresh explicitly');
  return state.tokens.idToken;
}
