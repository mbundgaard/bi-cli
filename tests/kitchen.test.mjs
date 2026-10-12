import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildKitchenRequest, executeKitchen } from '../dist/kitchen-performance.js';
import { kitchenEndpoint } from '../dist/areas/kitchen-performance.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const body = { locRef: 'L-1', busDt: '2024-02-29' };
const base = ['kitchen-performance', 'details', 'list'];
const args = [...base, '--loc-ref', body.locRef, '--business-date', body.busDt];
const raw = '{ "revenueCenters":[{"rvcNum":7,"orders":[{"guestCheckId":9007199254740993,"stationName":"Synthetic","serviceRoundNum":2,"startTimeUTC":"2024-02-29T10:00:00.1234567","startTimeLcl":"2024-02-29T11:00:00.1234567","subOrders":[{"actualPrepTimeinSecs":1.234567890123456789,"actualPrepTimeInSecs":null,"miMod":"Synthetic only"}]}]}] }\r\n';
test('KDS six-field public contract, explicit scope, dates and exact unknown numbers', async () => {
  const f = JSON.parse(await readFile('tests/fixtures/kitchen-contract.json', 'utf8'));
  assert.equal(f.version, '2025.09.22');
  assert.equal(f.path, '/bi/v1/{orgIdentifier}/' + kitchenEndpoint.operation);
  assert.equal(f.method, 'POST');
  assert.deepEqual(f.request.required, ['locRef', 'busDt']);
  assert.deepEqual(Object.keys(f.request.properties), ['locRef', 'busDt', 'transSinceUTC', 'searchCriteria', 'include', 'applicationName']);
  assert.equal(f.request.properties.transSinceUTC.format, 'date-time');
  for (const [field, max] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128]]) {
    assert.equal(f.request.properties[field].maxLength, max);
    assert.doesNotThrow(() => buildKitchenRequest(state, {}, {...body, [field]: 'x'.repeat(max)}));
    for (const bad of [null, 1, '', ' ', 'x\n', 'x'.repeat(max + 1)]) {
      assert.throws(() => buildKitchenRequest(state, {}, {...body, [field]: bad}));
    }
  }
  for (const bad of [{}, {locRef: 'L'}, {busDt: body.busDt}, {...body, busDt: '2023-02-29'}, {...body, busDt: null}, {...body, busDt: '2024-02-29T00:00:00'}]) {
    assert.throws(() => buildKitchenRequest(state, {}, bad), e => e.exitCode === 6);
  }
  for (const field of ['opnBusDt', 'clsdBusDt', 'rvcNum', 'clsdGuestChecksOnly', 'changedSinceUTC']) {
    assert.throws(() => buildKitchenRequest(state, {}, {...body, [field]: null}), /not supported/);
  }
  assert.throws(() => buildKitchenRequest(state, {allLocations: true}, body), /explicit location/);
  const input = parseJson('{"locRef":"L-1","busDt":"2024-02-29","extension":9007199254740993,"amount":1.234567890123456789}');
  assert.equal(JSON.stringify(buildKitchenRequest(state, {}, input).body), JSON.stringify(input));
  assert.deepEqual(buildKitchenRequest(state, {locRef: 'L-2', businessDate: '2024-03-01', include: 'new'}, {...body, include: 'old'}).body,
    {locRef: 'L-2', busDt: '2024-03-01', include: 'new'});
});
test('KDS cursor calendar/clock validation, unchanged spelling, no inferred date or offset conversion', () => {
  for (const cursor of ['2024-02-29T00:00:00', '2024-02-29T23:59:59Z', '2024-02-29T10:00:00.1234567', '2024-02-29T10:00:00.000Z']) {
    assert.equal(buildKitchenRequest(state, {transSinceUtc: cursor}, body).body.transSinceUTC, cursor);
    assert.equal(buildKitchenRequest(state, {}, {...body, transSinceUTC: cursor}).body.transSinceUTC, cursor);
  }
  for (const cursor of [null, 1, '', '2023-02-29T00:00:00', '2024-02-29', '2024-02-29T24:00:00', '2024-02-29T23:59:60', '2024-02-29T10:00:00+00:00', '2024-02-29T10:00:00z', ' 2024-02-29T10:00:00']) {
    assert.throws(() => buildKitchenRequest(state, {}, {...body, transSinceUTC: cursor}), e => e.exitCode === 6);
  }
  assert.throws(() => buildKitchenRequest(state, {}, {locRef: 'L', transSinceUTC: '2024-02-29T00:00:00'}), /exactly one business date/);
  assert.equal(buildKitchenRequest(state, {}, body).body.transSinceUTC, undefined);
});
test('KDS one authorized read POST; help and dry-run offline; response dates, precision, missing flags and spelling untouched', async t => {
  const s = await setup(t, async (req, res) => {
    assert.equal(req.url, '/bi/v1/test-enterprise/getKDSDetails');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer synthetic-id');
    assert.equal(req.headers['content-type'], 'application/json');
    const chunks = []; for await (const c of req) chunks.push(c);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), body); res.end(raw);
  });
  const preview = await s.run([...args, '--dry-run']);
  assert.equal(preview.code, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted, true);
  const help = await s.run([...base, '--help']);
  assert.equal(help.code, 0); assert.match(help.stdout, /actualPrepTimeinSecs/);
  assert.match(help.stdout, /16 KiB AND 500 lines/); assert.equal(s.calls.length, 0);
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8');
  const result = await s.run(args);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw);
  assert.equal(s.calls.length, 1); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('KDS invalid input rejects before due renewal; no station writes or implicit filters', async t => {
  const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const before = await readFile(s.store.file, 'utf8');
  for (const extra of [['--rvc-num', '7'], ['--station', '7'], ['--all-locations'], ['--open-business-date', body.busDt], ['--changed-since-utc', '2024-02-29T00:00:00'], ['--trans-since-utc', '2024-02-29T00:00:00+00:00'], ['--json', '{bad'], ['--json', '[]'], ['--json', '{"rvcNum":7}'], ['--file', 'missing', '--json', '{}'], ['--timeout', '0'], ['--timeout', '301']]) {
    const r = await s.run([...args, ...extra]); assert.equal(r.code, 6, r.stderr); assert.equal(r.stdout, '');
  }
  assert.equal((await s.run(base)).code, 6);
  for (const verb of ['bump', 'recall', 'add', 'delete']) assert.equal((await s.run(['kitchen-performance', 'details', verb])).code, 6);
  assert.equal((await s.run(['kitchen-performance'])).code, 0);
  assert.equal((await s.run(['kitchen-performance', 'details'])).code, 0);
  assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('KDS all fields and JSON/file/stdin survive one input read across renewal', async t => {
  const input = '{"locRef":"L-1","busDt":"2024-02-29","transSinceUTC":"2024-02-29T10:00:00.1234567","searchCriteria":"where equals(revenueCenters.rvcNum,7)","include":"revenueCenters.orders.subOrders.miNum","applicationName":"Synthetic","extension":9007199254740993}';
  let refreshes = 0, queries = 0;
  const s = await setup(t, async (req, res) => {
    if (req.url.endsWith('/token')) {
      assert.equal((await form(req)).get('grant_type'), 'refresh_token'); refreshes++;
      res.end(JSON.stringify({id_token: 'renewed', refresh_token: 'rotated', expires_in: 1209600})); return;
    }
    assert.equal(req.headers.authorization, 'Bearer renewed');
    const chunks = []; for await (const c of req) chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(), input); queries++; res.end(raw);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...base, '--file', '-']);
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => resolve({code, stdout, stderr})); child.stdin.end(input);
  });
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw);
  const file = path.join(s.directory, 'kds.json'); await writeFile(file, input);
  for (const source of [['--file', file], ['--json', input]]) assert.equal((await s.run([...base, ...source])).stdout, raw);
  assert.equal(refreshes, 1); assert.equal(queries, 3);
  assert.equal((await s.store.load()).tokens.refreshToken, 'rotated');
});
test('KDS rejected Z cursor stays unchanged, one request, verbatim API error and no state mutation', async t => {
  const cursor = '2024-02-29T10:00:00.1234567Z';
  const error = '{ "o:errorCode":33205,"detail":"Synthetic cursor rejection" }\r\n';
  const s = await setup(t, async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    assert.equal(JSON.parse(Buffer.concat(chunks).toString()).transSinceUTC, cursor);
    res.writeHead(400); res.end(error);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8');
  const r = await s.run([...args, '--trans-since-utc', cursor]);
  assert.equal(r.code, 11); assert.equal(r.stdout, error); assert.equal(s.calls.length, 1);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
});
for (const status of [200, 400, 401, 403, 503, 302]) test(`KDS HTTP ${status}: complete export, exit code, no retry/redirect`, async t => {
  const response = 'x'.repeat(16385), s = await setup(t, (req, res) => { req.resume(); res.writeHead(status, {Location: '/never-follow'}); res.end(response); });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const r = await s.run(args);
  assert.equal(r.code, status === 200 ? 0 : status === 401 ? 9 : 11, r.stderr);
  const receipt = JSON.parse(r.stdout);
  assert.equal(receipt.httpStatus, status); assert.equal(await readFile(receipt.path, 'utf8'), response);
  assert.equal(s.calls.length, 1);
});
test('KDS pins company identity; update notice only after successful non-quiet delivery', async t => {
  const s = await setup(t, (req, res) => { req.resume(); assert.match(req.url, /test-enterprise/); assert.equal(req.headers.authorization, 'Bearer synthetic-id'); res.end(raw); });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const original = (await s.store.loadCompanies()).activeCompany, other = 'OTHER@127.0.0.1';
  await s.store.mutateCompanies(async r => { r.companies[other] = {...r.companies[original], auth: {...r.companies[original].auth, orgName: 'OTHER'}, tokens: {...tokens(), idToken: 'other-id'}, refreshAfter: new Date(Date.now() + DAY).toISOString()}; });
  class Switching extends StateStore {
    count = 0;
    async loadCompanies() { if (++this.count === 2) await s.store.mutateCompanies(async r => { r.activeCompany = other; }); return super.loadCompanies(); }
  }
  let out = '', notices = 0;
  t.mock.method(process.stdout, 'write', (chunk, cb) => { out += chunk; if (typeof cb === 'function') cb(); return true; });
  const options = {locRef: body.locRef, businessDate: body.busDt}, notify = async () => { assert.equal(out, raw); notices++; };
  assert.equal(await executeKitchen(new Switching(s.directory), options, s.directory, notify), 0);
  assert.equal(out, raw); assert.equal(notices, 1);
  assert.equal((await s.store.loadCompanies()).activeCompany, other);
  await s.store.mutateCompanies(async r => { r.activeCompany = original; }); out = '';
  assert.equal(await executeKitchen(s.store, {...options, quiet: true}, s.directory, notify), 0);
  assert.equal(out, raw); assert.equal(notices, 1);
});
