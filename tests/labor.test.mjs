import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildLaborRequest, executeLabor } from '../dist/labor.js';
import { laborEndpoint } from '../dist/areas/labor.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const body = { locRef: 'L-1', busDt: '2024-02-29' };
const base = ['labor', 'time-cards', 'list'];
const args = [...base, '--loc-ref', body.locRef, '--business-date', body.busDt];
const raw = '{ "businessDates":[{"busDt":"2024-02-28","timeCardDetails":[{"tcId":9007199254740993,"extPayrollID":"000Synthetic","payRt":1.234567890123456789,"clkInStatus":999,"clkInLcl":"2024-02-28T10:00:00","clkInUTC":"2024-02-28T09:00:00","adjustments":[{"adjId":9007199254740995,"mgrName":"Synthetic only","rsn":"Synthetic only","prevDrctTips":null}]}]}] }\r\n';
test('labor ten-field schema retains contradictory required list; limits and unknown precision', async () => {
  const f = JSON.parse(await readFile('tests/fixtures/labor-contract.json', 'utf8'));
  assert.equal(f.version, '2025.09.22'); assert.equal(f.path, '/bi/v1/{orgIdentifier}/' + laborEndpoint.operation);
  assert.equal(f.method, 'POST'); assert.deepEqual(f.request.required, ['locRef', 'busDt', 'PostedDt']);
  assert.deepEqual(Object.keys(f.request.properties), ['applicationName', 'searchCriteria', 'include', 'busDt', 'postedDt', 'locRef', 'includeAdjustments', 'empNum', 'extPayrollID', 'changedSinceUTC']);
  for (const [field, max] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128], ['extPayrollID', 32]]) {
    assert.equal(f.request.properties[field].maxLength, max);
    assert.doesNotThrow(() => buildLaborRequest(state, {}, {...body, [field]: 'x'.repeat(max)}));
    for (const bad of [null, 1, '', ' ', 'x\n', 'x'.repeat(max + 1)]) assert.throws(() => buildLaborRequest(state, {}, {...body, [field]: bad}), e => e.exitCode === 6);
  }
  const input = parseJson('{"locRef":"L-1","busDt":"2024-02-29","empNum":9007199254740993,"extension":1.234567890123456789}');
  assert.equal(JSON.stringify(buildLaborRequest(state, {}, input).body), JSON.stringify(input));
  assert.deepEqual(buildLaborRequest(state, {locRef: 'L-2', businessDate: '2024-03-01', include: 'new'}, {...body, include: 'old'}).body, {locRef: 'L-2', busDt: '2024-03-01', include: 'new'});
});
test('labor dates allow business, posted or both AND; no cursor-only, scope defaults or uppercase alias', () => {
  for (const dates of [{busDt: '2024-02-29'}, {postedDt: '2024-03-01'}, {busDt: '2024-02-29', postedDt: '2024-03-01'}]) {
    assert.deepEqual(buildLaborRequest(state, {}, {locRef: 'L', ...dates}).body, {locRef: 'L', ...dates});
  }
  for (const bad of [{}, {locRef: 'L'}, {busDt: body.busDt}, {locRef: 'L', changedSinceUTC: '2024-02-29T00:00:00'}, {...body, busDt: '2023-02-29'}, {...body, postedDt: null}, {...body, postedDt: '2024-02-30'}, {...body, postedDt: '2024-03-01T00:00:00'}]) {
    assert.throws(() => buildLaborRequest(state, {}, bad), e => e.exitCode === 6);
  }
  for (const field of ['opnBusDt', 'clsdBusDt', 'rvcNum', 'clsdGuestChecksOnly', 'transSinceUTC', 'PostedDt']) {
    assert.throws(() => buildLaborRequest(state, {}, {...body, [field]: null}), /not supported/);
  }
  assert.throws(() => buildLaborRequest(state, {allLocations: true}, body), /explicit location/);
});
test('labor employee selectors exclusive, exact integer validation, explicit boolean and no default injection', () => {
  for (const value of [7, -1, parseJson('9007199254740993'), parseJson('1.00'), parseJson('1e20')]) {
    assert.equal(JSON.stringify(buildLaborRequest(state, {empNum: value}, body).body.empNum), JSON.stringify(value));
  }
  for (const value of [null, '7', true, 1.5, parseJson('9007199254740993.1')]) assert.throws(() => buildLaborRequest(state, {}, {...body, empNum: value}), /integer JSON number/);
  assert.throws(() => buildLaborRequest(state, {empNum: 1}, {...body, extPayrollID: '000X'}), /at most one/);
  assert.throws(() => buildLaborRequest(state, {extPayrollId: '000X'}, {...body, empNum: 1}), /at most one/);
  for (const value of [true, false]) assert.equal(buildLaborRequest(state, {includeAdjustments: value, extPayrollId: '000X'}, body).body.includeAdjustments, value);
  for (const value of [null, 'false', 0]) assert.throws(() => buildLaborRequest(state, {}, {...body, includeAdjustments: value}), /JSON boolean/);
  assert.deepEqual(buildLaborRequest(state, {}, body).body, body);
});
test('labor cursor validation preserves fractions/Z and does not convert offsets', () => {
  for (const cursor of ['2024-02-29T00:00:00', '2024-02-29T23:59:59.1234567Z']) {
    assert.equal(buildLaborRequest(state, {changedSinceUtc: cursor}, body).body.changedSinceUTC, cursor);
  }
  for (const cursor of [null, '', 1, '2023-02-29T00:00:00', '2024-02-29T24:00:00', '2024-02-29T23:59:60', '2024-02-29T10:00:00+00:00']) {
    assert.throws(() => buildLaborRequest(state, {}, {...body, changedSinceUTC: cursor}), e => e.exitCode === 6);
  }
});
test('labor one ID-token read POST, offline help/dry-run, verbatim response without payroll computation or field normalization', async t => {
  const s = await setup(t, async (req, res) => {
    assert.equal(req.url, '/bi/v1/test-enterprise/getTimeCardDetails'); assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.equal(req.headers['content-type'], 'application/json');
    const chunks = []; for await (const c of req) chunks.push(c);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), body); res.end(raw);
  });
  const preview = await s.run([...args, '--dry-run']); assert.equal(preview.code, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted, true);
  const help = await s.run([...base, '--help']); assert.equal(help.code, 0);
  assert.match(help.stdout, /AND, not OR/); assert.match(help.stdout, /payroll preprocessing/);
  assert.equal(s.calls.length, 0);
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8'); const result = await s.run(args);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw); assert.equal(s.calls.length, 1);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('labor CLI flags preserve date AND, exact employee number and leading-zero payroll ID in offline preview', async t => {
  const s = await setup(t);
  const r = await s.run([...args, '--posted-date', '2024-03-01', '--emp-num', '9007199254740993', '--include-adjustments', 'false', '--dry-run']);
  assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /9007199254740993/);
  assert.equal(JSON.parse(r.stdout).data.body.postedDt, '2024-03-01'); assert.equal(JSON.parse(r.stdout).data.body.includeAdjustments, false);
  const other = await s.run([...base, '--loc-ref', 'L', '--posted-date', '2024-03-01', '--ext-payroll-id', '000Synthetic', '--dry-run']);
  assert.equal(other.code, 0); assert.equal(JSON.parse(other.stdout).data.body.extPayrollID, '000Synthetic');
  assert.equal(JSON.parse(other.stdout).data.body.busDt, undefined); assert.equal(s.calls.length, 0);
});
test('labor invalid input rejects before due renewal; no clock or adjustment writes', async t => {
  const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const before = await readFile(s.store.file, 'utf8');
  for (const extra of [['--rvc-num', '7'], ['--all-locations'], ['--open-business-date', body.busDt], ['--trans-since-utc', '2024-02-29T00:00:00'], ['--emp-num', '1.5'], ['--emp-num', '1', '--ext-payroll-id', '000X'], ['--include-adjustments', 'yes'], ['--json', '{bad'], ['--json', '[]'], ['--file', 'missing', '--json', '{}'], ['--timeout', '0'], ['--timeout', '301'], ['--json', '{"PostedDt":"2024-03-01"}']]) {
    const r = await s.run([...args, ...extra]); assert.equal(r.code, 6, r.stderr); assert.equal(r.stdout, '');
  }
  assert.equal((await s.run(base)).code, 6);
  for (const verb of ['clock-in', 'clock-out', 'adjust', 'approve', 'delete']) assert.equal((await s.run(['labor', 'time-cards', verb])).code, 6);
  assert.equal((await s.run(['labor'])).code, 0); assert.equal((await s.run(['labor', 'time-cards'])).code, 0);
  assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('labor JSON/file/stdin all fields survive one input read across renewal', async t => {
  const input = '{"locRef":"L-1","busDt":"2024-02-29","postedDt":"2024-03-01","changedSinceUTC":"2024-03-01T10:00:00.1234567","searchCriteria":"where equals(businessDates.timeCardDetails.rvcNum,7)","include":"locRef,businessDates.busDt","applicationName":"Synthetic","includeAdjustments":true,"extPayrollID":"000Synthetic","extension":9007199254740993}';
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
    const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...base, '--file', '-']); let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', code => resolve({code, stdout, stderr})); child.stdin.end(input);
  });
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw);
  const file = path.join(s.directory, 'labor.json'); await writeFile(file, input);
  for (const source of [['--file', file], ['--json', input]]) assert.equal((await s.run([...base, ...source])).stdout, raw);
  assert.equal(refreshes, 1); assert.equal(queries, 3); assert.equal((await s.store.load()).tokens.refreshToken, 'rotated');
});
for (const status of [200, 400, 401, 403, 503, 302]) test(`labor HTTP ${status}: complete export, exit code, no retry/redirect`, async t => {
  const response = 'x'.repeat(16385), s = await setup(t, (req, res) => { req.resume(); res.writeHead(status, {Location: '/never-follow'}); res.end(response); });
  await s.store.mutate(async current => { current.tokens = tokens(); }); const r = await s.run(args);
  assert.equal(r.code, status === 200 ? 0 : status === 401 ? 9 : 11, r.stderr);
  const receipt = JSON.parse(r.stdout); assert.equal(receipt.httpStatus, status);
  assert.equal(await readFile(receipt.path, 'utf8'), response); assert.equal(s.calls.length, 1);
});
test('labor company stays pinned and update notices follow only successful non-quiet delivery', async t => {
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
  assert.equal(await executeLabor(new Switching(s.directory), options, s.directory, notify), 0);
  assert.equal(out, raw); assert.equal(notices, 1); assert.equal((await s.store.loadCompanies()).activeCompany, other);
  await s.store.mutateCompanies(async r => { r.activeCompany = original; }); out = '';
  assert.equal(await executeLabor(s.store, {...options, quiet: true}, s.directory, notify), 0);
  assert.equal(out, raw); assert.equal(notices, 1);
});
