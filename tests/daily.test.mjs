import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { dailyEndpoints } from '../dist/areas/aggregations.js';
import { buildDailyRequest, executeDaily } from '../dist/daily-requests.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const body = { locRef: 'L-1', busDt: '2024-02-29' };
const operation = dailyEndpoints[0];
const args = endpoint => ['aggregations', 'daily', endpoint.noun, 'list', '--loc-ref', body.locRef, '--business-date', body.busDt];
const raw = '{ "locRef":"L-1", "busDt":"2024-02-29", "revenueCenters":[{"rvcNum":7,"netSlsTtl":1.234567890123456789,"extension":9007199254740993}] }\r\n';
test('eleven regular daily endpoints match public Oracle schemas, excluding control and quarter-hour', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/daily-totals-contract.json', 'utf8'));
  assert.equal(fixture.version, '2025.09.22'); assert.equal(dailyEndpoints.length, 11); assert.equal(fixture.endpoints.length, 11);
  assert.equal(new Set(dailyEndpoints.map(e => e.operation)).size, 11);
  for (const endpoint of dailyEndpoints) {
    const contract = fixture.endpoints.find(e => e.path.endsWith('/' + endpoint.operation)); assert.ok(contract);
    assert.equal(contract.method, 'POST'); assert.deepEqual(contract.required, ['locRef', 'busDt']);
    assert.deepEqual(Object.keys(contract.properties), ['locRef', 'busDt', 'searchCriteria', 'include', 'applicationName']);
    assert.equal(contract.properties.busDt.format, 'date'); assert.equal(contract.properties.locRef.maxLength, 99);
    assert.equal(contract.properties.searchCriteria.maxLength, 2000); assert.equal(contract.properties.include.maxLength, 2000);
    assert.equal(contract.properties.applicationName.maxLength, 128);
  }
  assert.ok(!dailyEndpoints.some(e => /Control|QuarterHour/.test(e.operation)));
});
for (const endpoint of dailyEndpoints) test(`${endpoint.operation}: one exact authorized POST, raw data, tokenless offline preview and help`, async t => {
  const s = await setup(t, async (req, res) => {
    assert.equal(req.url, '/bi/v1/test-enterprise/' + endpoint.operation); assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.equal(req.headers.accept, 'application/json');
    assert.equal(req.headers['content-type'], 'application/json');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), body); res.end(raw);
  });
  const preview = await s.run([...args(endpoint), '--dry-run']); assert.equal(preview.code, 0, preview.stderr);
  const data = JSON.parse(preview.stdout).data; assert.deepEqual(data.body, body); assert.equal(data.authorizationOmitted, true);
  assert.equal(data.headers.Authorization, undefined); assert.equal(s.calls.length, 0);
  const help = await s.run(['aggregations', 'daily', endpoint.noun, 'list', '--help']); assert.equal(help.code, 0);
  assert.match(help.stdout, /location\/date-scoped/); assert.match(help.stdout, /16 KiB AND 500 lines/);
  assert.match(help.stdout, /No native --rvc-num/); assert.match(help.stdout, /Historical dates can change/);
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8'), result = await s.run(args(endpoint));
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw); assert.equal(s.calls.length, 1);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('daily scope/date and known selectors fail locally; unknown fields and raw numbers survive', () => {
  for (const endpoint of dailyEndpoints) {
    for (const input of [{}, { locRef: 'L' }, { busDt: body.busDt }, { ...body, busDt: '2023-02-29' }, { ...body, busDt: '2024-02-30' }, { ...body, busDt: '2024-02-29T00:00:00Z' }, { ...body, busDt: null }]) {
      assert.throws(() => buildDailyRequest(endpoint, state, {}, input), e => e.exitCode === 6);
    }
    for (const field of ['opnBusDt', 'clsdBusDt', 'rvcNum', 'clsdGuestChecksOnly', 'changedSinceUTC', 'transSinceUTC']) {
      assert.throws(() => buildDailyRequest(endpoint, state, {}, { ...body, [field]: null }), /not supported/);
    }
    assert.throws(() => buildDailyRequest(endpoint, state, { allLocations: true }, body), /explicit location/);
    const extension = parseJson('{"extension":{"id":9007199254740993,"amount":1.234567890123456789}}');
    assert.equal(JSON.stringify(buildDailyRequest(endpoint, state, {}, { ...body, ...extension }).body), JSON.stringify({ ...body, ...extension }));
  }
  for (const [field, maximum] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128]]) {
    assert.doesNotThrow(() => buildDailyRequest(operation, state, {}, { ...body, [field]: 'x'.repeat(maximum) }));
    for (const value of ['x'.repeat(maximum + 1), '', ' ', 'x\n', null, 1]) assert.throws(() => buildDailyRequest(operation, state, {}, { ...body, [field]: value }));
  }
  assert.deepEqual(buildDailyRequest(operation, state, { locRef: 'L-2', businessDate: '2024-03-01', include: 'new' }, { ...body, include: 'old' }).body, { locRef: 'L-2', busDt: '2024-03-01', include: 'new' });
});
test('invalid daily requests and planned subareas stay offline, before due company renewal', async t => {
  const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const before = await readFile(s.store.file, 'utf8');
  for (const invalid of [
    ['aggregations', 'daily', 'operations', 'list'], [...args(operation), '--business-date', 'bad'],
    [...args(operation), '--rvc-num', '7'], [...args(operation), '--open-business-date', body.busDt],
    [...args(operation), '--changed-since-utc', '2024-02-29T00:00:00'], [...args(operation), '--all-locations'],
    [...args(operation), '--timeout', '0'], [...args(operation), '--timeout', '301'],
    [...args(operation), '--file', 'missing', '--json', '{}'], [...args(operation), '--json', '{bad'],
    [...args(operation), '--json', '{"rvcNum":7}'], [...args(operation), '--json', '[]'],
    ['aggregations', 'daily', 'control', 'list'], ['aggregations', 'quarter-hour', 'operations', 'list'],
  ]) { const r = await s.run(invalid); assert.equal(r.code, 6, r.stderr); assert.equal(r.stdout, ''); }
  for (const help of [['aggregations'], ['aggregations', 'daily'], ['aggregations', 'daily', 'control'], ['aggregations', 'quarter-hour']]) {
    assert.equal((await s.run(help)).code, 0);
  }
  assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('daily file/stdin/JSON survive renewal once, with exact numbers and explicit filters/projections', async t => {
  const input = '{"locRef":"L-1","busDt":"2024-02-29","searchCriteria":"where equals(revenueCenters.rvcNum,7)","include":"revenueCenters.rvcNum","applicationName":"Synthetic","extension":9007199254740993}';
  let refreshes = 0, queries = 0;
  const s = await setup(t, async (req, res) => {
    if (req.url.endsWith('/token')) { assert.equal((await form(req)).get('grant_type'), 'refresh_token'); refreshes++; res.end(JSON.stringify({ id_token: 'renewed', refresh_token: 'rotated', expires_in: 1209600 })); return; }
    assert.equal(req.headers.authorization, 'Bearer renewed');
    const chunks = []; for await (const c of req) chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(), input); queries++; res.end(raw);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const base = ['aggregations', 'daily', 'operations', 'list'];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...base, '--file', '-']); let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw);
  const file = path.join(s.directory, 'input.json'); await writeFile(file, input);
  for (const source of [['--file', file], ['--json', input]]) assert.equal((await s.run([...base, ...source])).stdout, raw);
  assert.equal(refreshes, 1); assert.equal(queries, 3); assert.equal((await s.store.load()).tokens.refreshToken, 'rotated');
});
for (const status of [200, 400, 401, 403, 503, 302]) test(`daily HTTP ${status}: unchanged large response, preserved exit and no retry/redirect`, async t => {
  const response = 'x'.repeat(16385);
  const s = await setup(t, (req, res) => { req.resume(); res.writeHead(status, { Location: '/never-follow' }); res.end(response); });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const result = await s.run(args(operation)); assert.equal(result.code, status === 200 ? 0 : status === 401 ? 9 : 11, result.stderr);
  const receipt = JSON.parse(result.stdout); assert.equal(receipt.delivery, 'file'); assert.equal(receipt.httpStatus, status);
  assert.equal(await readFile(receipt.path, 'utf8'), response); assert.equal(s.calls.length, 1);
});
test('daily calls pin active company and notify only after successful non-quiet delivery', async t => {
  const s = await setup(t, (req, res) => { req.resume(); assert.match(req.url, /test-enterprise/); assert.equal(req.headers.authorization, 'Bearer synthetic-id'); res.end(raw); });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const original = (await s.store.loadCompanies()).activeCompany, other = 'OTHER@127.0.0.1';
  await s.store.mutateCompanies(async r => { r.companies[other] = { ...r.companies[original], auth: { ...r.companies[original].auth, orgName: 'OTHER' }, tokens: { ...tokens(), idToken: 'other-id' }, refreshAfter: new Date(Date.now() + DAY).toISOString() }; });
  class Switching extends StateStore { count = 0; async loadCompanies() { if (++this.count === 2) await s.store.mutateCompanies(async r => { r.activeCompany = other; }); return super.loadCompanies(); } }
  let out = '', notices = 0;
  t.mock.method(process.stdout, 'write', (chunk, cb) => { out += chunk; if (typeof cb === 'function') cb(); return true; });
  const options = { locRef: body.locRef, businessDate: body.busDt };
  const notify = async () => { assert.equal(out, raw); notices++; };
  assert.equal(await executeDaily(operation, new Switching(s.directory), options, s.directory, notify), 0);
  assert.equal(out, raw); assert.equal(notices, 1); assert.equal((await s.store.loadCompanies()).activeCompany, other);
  await s.store.mutateCompanies(async r => { r.activeCompany = original; }); out = '';
  assert.equal(await executeDaily(operation, s.store, { ...options, quiet: true }, s.directory, notify), 0);
  assert.equal(out, raw); assert.equal(notices, 1);
});
