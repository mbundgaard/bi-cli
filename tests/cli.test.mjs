import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { areas } from '../dist/areas/index.js';
import { setup, tokens, clientId } from './helpers.mjs';

test('nine areas retain Oracle terminology; POS dimensions and transactions are implemented', async t => {
  assert.deepEqual(areas.map(a => a.name), ['aggregations', 'cash-management', 'fiscal-transactions', 'kitchen-performance', 'labor', 'payment-dimensions', 'payment-transactions', 'pos-dimensions', 'pos-transactions']);
  const s = await setup(t);
  for (const area of areas) {
    const result = await s.run([area.name, '--help']); assert.equal(result.code, 0);
    assert.ok(result.stdout.includes(area.oracleName));
    if (area.name === 'pos-dimensions') assert.match(result.stdout, /16 BI JSON POST queries/);
    else if (area.name === 'pos-transactions') assert.match(result.stdout, /seven location\/date-scoped BI JSON POST queries/);
    else if (area.name === 'aggregations') assert.match(result.stdout, /partially implemented/);
    else assert.match(result.stdout, /not implemented/);
  }
  const endpoints = await s.run(['endpoints']);
  assert.equal(JSON.parse(endpoints.stdout).data.dataEndpoints.length, 35);
  assert.equal(JSON.parse(endpoints.stdout).data.areas.filter(area => area.implemented).length, 2);
  const aggregation = JSON.parse(endpoints.stdout).data.areas.find(area => area.name === 'aggregations');
  assert.equal(aggregation.implemented, false); assert.equal(aggregation.partiallyImplemented, true);
  assert.deepEqual(aggregation.plannedSections, ['quarter-hour']);
  assert.equal((await s.run(['pos-transactions', 'guest-checks', 'list'])).code, 6);
  assert.equal((await s.run(['payment-transactions', 'unknown'])).code, 6);
  assert.equal(s.calls.length, 0);
});
test('configuration uses explicit BI organization and preserves opaque client ID and case', async t => {
  const s = await setup(t);
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const result = await s.run(['auth', 'config', '--org', 'EXPLICIT', '--client-id', clientId, '--username', 'CasePreserved']);
  assert.equal(result.code, 0, result.stderr);
  const saved = await s.store.load(); assert.equal(saved.auth.orgName, 'EXPLICIT'); assert.equal(saved.auth.clientId, clientId);
  assert.equal(saved.auth.username, 'CasePreserved'); assert.equal(saved.tokens, undefined);
  assert.equal(s.calls.length, 0);
});
test('identical settings keep saved tokens; changed endpoints prepare token-free login configuration', async t => {
  const s = await setup(t); await s.store.mutate(async state => { state.tokens = tokens(); });
  assert.equal((await s.run(['auth', 'config', '--client-id', clientId])).code, 0);
  assert.ok((await s.store.load()).tokens);
  assert.equal((await s.run(['auth', 'config', '--api-url', 'https://reports.example.invalid'])).code, 0);
  assert.equal((await s.store.load()).tokens, undefined);
});
test('status and show never print token values and status is explicitly local-only', async t => {
  const s = await setup(t); await s.store.mutate(async state => { state.tokens = tokens(); });
  for (const command of ['status', 'show']) {
    const result = await s.run(['auth', command]); assert.equal(result.code, 0);
    assert.doesNotMatch(result.stdout, /synthetic-id|synthetic-refresh/);
    if (command === 'status') assert.equal(JSON.parse(result.stdout).data.serverValidated, false);
  }
  assert.equal(s.calls.length, 0);
});
test('invalid flags/configuration and missing credentials fail locally without touching tokens', async t => {
  const s = await setup(t);
  assert.equal((await s.run(['auth', 'login'])).code, 6);
  assert.equal((await s.run(['auth', 'login', '--password', ''])).code, 6);
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8');
  for (const args of [
    ['auth', 'refresh', '--timeout', 'NaN'],
    ['auth', 'config', '--auth-url', 'http://idm.example.invalid'],
    ['auth', 'config', '--auth-url', 'https://secret@example.invalid'],
    ['auth', 'config', '--api-url', 'https://example.invalid/?query=x'],
    ['auth', 'config', '--org', ' '], ['--state-dir', 'unused', 'auth', 'status'],
    ['auth', 'login', '--password', 'synthetic', '--insecure'],
  ]) { const result = await s.run(args); assert.equal(result.code, 6, JSON.stringify(args)); assert.equal(result.stdout, ''); }
  assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('missing saved refresh token has its own exit code and makes no call', async t => {
  const s = await setup(t); const result = await s.run(['auth', 'refresh']);
  assert.equal(result.code, 8); assert.equal(s.calls.length, 0);
});
test('restore validates BI schema, protects configured state and never imports STS state', async t => {
  const s = await setup(t), file = path.join(s.directory, 'backup.json');
  const old = await s.store.load(); await writeFile(file, JSON.stringify({ ...old, tokens: tokens() }));
  assert.equal((await s.run(['auth', 'restore', '--file', file])).code, 12);
  assert.equal((await s.run(['auth', 'restore', '--file', file, '--force'])).code, 0);
  assert.ok((await s.store.load()).tokens.idToken);
  const before = await readFile(s.store.file, 'utf8');
  await writeFile(file, JSON.stringify({ auth: old.auth, tokens: { accessToken: 'STS-SECRET' } }));
  const result = await s.run(['auth', 'restore', '--file', file, '--force']);
  assert.equal(result.code, 12); assert.doesNotMatch(result.stderr, /STS-SECRET/);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
  assert.equal(s.calls.length, 0);
});
