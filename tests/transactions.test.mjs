import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { transactionEndpoints } from '../dist/areas/pos-transactions.js';
import { buildTransactionRequest, utcCursor, integerOption, executeTransaction } from '../dist/transaction-requests.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const guest = transactionEndpoints.find(e => e.noun === 'guest-checks');
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const date = '2024-02-29';
const flags = { busDt: '--business-date', opnBusDt: '--open-business-date', clsdBusDt: '--closed-business-date' };
const bodyFor = endpoint => ({ locRef: 'L-1', [endpoint.dates[0]]: date });
const argsFor = endpoint => ['pos-transactions', endpoint.noun, 'list', '--loc-ref', 'L-1', flags[endpoint.dates[0]], date];
const raw = '{ "curUTC":"2024-03-01T01:02:03.1234567", "guestChecks":[{"guestCheckId":9007199254740993,"opnBusDt":"2024-02-28","clsdBusDt":"2024-02-29","reopnClsdChkFlag":true,"detailLines":[{"dtlId":1,"comboMealSeq":3},{"dtlId":2,"parDtlId":1,"comboSideSeq":4}]}] }\r\n';

test('seven transaction endpoints match public Swagger request schemas and required-date discrepancy', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/pos-transactions-contract.json', 'utf8'));
  assert.equal(fixture.version, '2025.09.22'); assert.equal(transactionEndpoints.length, 7);
  assert.equal(new Set(transactionEndpoints.map(e => e.operation)).size, 7);
  for (const endpoint of transactionEndpoints) {
    const contract = fixture.endpoints.find(e => e.path.endsWith('/' + endpoint.operation)); assert.ok(contract); assert.equal(contract.method, 'POST');
    assert.equal(contract.properties.locRef.maxLength, 99);
    assert.equal(contract.properties.include.maxLength, 2000); assert.equal(contract.properties.applicationName.maxLength, 128);
    for (const key of endpoint.dates) assert.equal(contract.properties[key].format, 'date');
    if (endpoint.cursor) assert.equal(contract.properties[endpoint.cursor].format, 'date-time');
    if (endpoint.guestSelectors) { assert.equal(contract.properties.rvcNum.type, 'integer'); assert.deepEqual(contract.required, ['locRef', 'opnBusDt', 'clsdBusDt', 'busDt']); }
    else assert.deepEqual(contract.required, ['locRef', endpoint.dates[0]]);
  }
});
for (const endpoint of transactionEndpoints) test(`${endpoint.operation}: exact POST/addressing, ID Bearer and response bytes; no default filters or extra requests`, async t => {
  const s = await setup(t, async (req, res) => {
    assert.equal(req.url, '/bi/v1/test-enterprise/' + endpoint.operation); assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.equal(req.headers.accept, 'application/json');
    assert.equal(req.headers['content-type'], 'application/json');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), bodyFor(endpoint)); res.end(raw);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8'), result = await s.run(argsFor(endpoint));
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw); assert.equal(s.calls.length, 1);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
});
for (const endpoint of transactionEndpoints) test(`${endpoint.noun}: tokenless dry-run and endpoint-specific options`, async t => {
  const s = await setup(t); const r = await s.run([...argsFor(endpoint), '--dry-run']);
  assert.equal(r.code, 0, r.stderr); const preview = JSON.parse(r.stdout).data;
  assert.equal(preview.authorizationOmitted, true); assert.equal(preview.readOnly, true);
  assert.equal(preview.headers.Authorization, undefined); assert.equal(preview.scope, 'location-scoped');
  assert.deepEqual(preview.body, bodyFor(endpoint)); assert.equal(s.calls.length, 0);
  const help = await s.run(['pos-transactions', endpoint.noun, 'list', '--help']);
  assert.match(help.stdout, /location\/date-scoped/); assert.match(help.stdout, /16 KiB/);
  assert.match(help.stdout, /rejected explicit Z with HTTP 400/);
  assert.match(help.stdout, /retained nonmatching sibling lines/);
  assert.equal(help.stdout.includes('--rvc-num'), !!endpoint.guestSelectors);
  assert.equal(help.stdout.includes('--changed-since-utc'), endpoint.cursor === 'changedSinceUTC');
  assert.equal(help.stdout.includes('--trans-since-utc'), endpoint.cursor === 'transSinceUTC');
});
test('guest checks require exactly one date, not all three Swagger-required dates', () => {
  for (const field of guest.dates) assert.equal(buildTransactionRequest(guest, state, {}, { locRef: 'L', [field]: date }).body[field], date);
  for (const input of [{ locRef: 'L' }, { locRef: 'L', busDt: date, opnBusDt: date }, { locRef: 'L', clsdBusDt: date, opnBusDt: date }, { locRef: 'L', changedSinceUTC: '2024-02-29T00:00:00' }]) {
    assert.throws(() => buildTransactionRequest(guest, state, {}, input), error => error.exitCode === 6);
  }
  assert.throws(() => buildTransactionRequest(guest, state, { openBusinessDate: date }, { locRef: 'L', busDt: date }), /exactly one/);
});
test('real dates, cursor syntax, fractional precision and UTC spelling are validated without conversion', () => {
  for (const valid of ['2024-02-29T01:02:03', '2024-02-29T01:02:03Z', '2024-02-29T01:02:03.123456789Z', '2024-03-31T02:30:00']) {
    assert.equal(buildTransactionRequest(guest, state, {}, { ...bodyFor(guest), changedSinceUTC: valid }).body.changedSinceUTC, valid);
  }
  for (const invalid of ['2023-02-29', '2024-02-30', '2024-2-29', '2024-02-29Z', '2024-02-29\n', null, 20240229]) {
    assert.throws(() => buildTransactionRequest(guest, state, {}, { locRef: 'L', busDt: invalid }), error => error.exitCode === 6);
  }
  for (const value of ['2023-02-29T01:00:00', '2024-02-29', '2024-02-29T24:00:00', '2024-02-29T01:60:00', '2024-02-29T01:00:60', '2024-02-29T01:00:00+00:00', '2024-02-29T01:00:00Z\n', '2024-02-29T01:00:00z', '2024-02-29 01:00:00', null]) {
    assert.throws(() => utcCursor(value, 'changedSinceUTC'), error => error.exitCode === 6);
  }
});
test('boolean and RVC fields are typed; integers survive without guessing a Swagger numeric maximum', () => {
  for (const literal of ['1', '-1', '10000000000', '9007199254740993', '1.0', '1e30', '100e-2']) {
    const input = parseJson(`{"locRef":"L","busDt":"${date}","rvcNum":${literal},"clsdGuestChecksOnly":false}`);
    assert.equal(JSON.stringify(buildTransactionRequest(guest, state, {}, input).body), JSON.stringify(input));
  }
  assert.equal(JSON.stringify(integerOption('9007199254740993')), '9007199254740993');
  for (const bad of ['1.2', '1e2', '1\n', 'Infinity', '']) assert.throws(() => integerOption(bad));
  for (const literal of ['"1"', 'null', 'true', '1.5', '9007199254740993.1', '1e-1000']) {
    const input = parseJson(`{"locRef":"L","busDt":"${date}","rvcNum":${literal}}`);
    assert.throws(() => buildTransactionRequest(guest, state, {}, input), /integer/);
  }
  for (const bad of ['false', 0, null]) assert.throws(() => buildTransactionRequest(guest, state, {}, { ...bodyFor(guest), clsdGuestChecksOnly: bad }), /boolean/);
});
test('known unsupported endpoint-specific fields fail, unknown fields and exact numbers survive', () => {
  for (const endpoint of transactionEndpoints) {
    const allowed = [...endpoint.dates, ...(endpoint.cursor ? [endpoint.cursor] : []), ...(endpoint.guestSelectors ? ['rvcNum', 'clsdGuestChecksOnly'] : [])];
    for (const field of ['busDt', 'opnBusDt', 'clsdBusDt', 'rvcNum', 'clsdGuestChecksOnly', 'changedSinceUTC', 'transSinceUTC'].filter(f => !allowed.includes(f))) {
      assert.throws(() => buildTransactionRequest(endpoint, state, {}, { ...bodyFor(endpoint), [field]: 'not-allowed' }), /not supported/);
    }
    const unknown = parseJson('{"extension":{"exact":9007199254740993,"amount":1.234567890123456789}}');
    const built = buildTransactionRequest(endpoint, state, {}, { ...bodyFor(endpoint), ...unknown });
    assert.equal(JSON.stringify(built.body.extension), JSON.stringify(unknown.extension));
  }
});
test('known string limits and flag overrides apply without broadening dates or locations', () => {
  for (const [field, length] of [['locRef', 99], ['searchCriteria', 2000], ['include', 2000], ['applicationName', 128]]) {
    assert.doesNotThrow(() => buildTransactionRequest(guest, state, {}, { ...bodyFor(guest), [field]: 'x'.repeat(length) }));
    assert.throws(() => buildTransactionRequest(guest, state, {}, { ...bodyFor(guest), [field]: 'x'.repeat(length + 1) }));
    for (const bad of ['', ' ', 'x\n', 1, null]) assert.throws(() => buildTransactionRequest(guest, state, {}, { ...bodyFor(guest), [field]: bad }));
  }
  const built = buildTransactionRequest(guest, state, { locRef: 'NEW', businessDate: date, closedOnly: false, rvcNum: 2, include: 'new' }, { locRef: 'OLD', busDt: 'bad', clsdGuestChecksOnly: true, rvcNum: 1, include: 'old' });
  assert.deepEqual(built.body, { locRef: 'NEW', busDt: date, clsdGuestChecksOnly: false, rvcNum: 2, include: 'new' });
  assert.throws(() => buildTransactionRequest(guest, state, { allLocations: true }, bodyFor(guest)), /explicit location/);
});
test('invalid CLI input is rejected before due renewal; no defaults or hidden date lookup', async t => {
  const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async registry => { registry.companies[registry.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const before = await readFile(s.store.file, 'utf8');
  for (const args of [
    ['pos-transactions', 'guest-checks', 'list'], [...argsFor(guest), '--closed-only', 'yes'], [...argsFor(guest), '--rvc-num', '1.5'],
    [...argsFor(guest), '--all-locations'], [...argsFor(guest), '--open-business-date', date], [...argsFor(guest), '--trans-since-utc', '2024-02-29T00:00:00'],
    [...argsFor(guest), '--json', '{bad'], [...argsFor(guest), '--file', 'missing', '--json', '{}'],
    [...argsFor(guest), '--timeout', '0'], [...argsFor(guest), '--timeout', '301'],
  ]) { const result = await s.run(args); assert.equal(result.code, 6, result.stderr); assert.equal(result.stdout, ''); }
  assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('JSON/file/stdin are exact and stdin is read once across scheduled renewal; CLI selectors map correctly', async t => {
  let renewals = 0, calls = 0;
  const input = `{"locRef":"L-1","busDt":"${date}","extension":9007199254740993}`;
  const s = await setup(t, async (req, res) => {
    if (req.url.endsWith('/token')) { const fields = await form(req); assert.equal(fields.get('grant_type'), 'refresh_token'); renewals++; res.end(JSON.stringify({ id_token: 'renewed-id', refresh_token: 'renewed-refresh', expires_in: 1209600 })); return; }
    assert.equal(req.headers.authorization, 'Bearer renewed-id');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), input); calls++; res.end(raw);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async registry => { registry.companies[registry.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const base = ['pos-transactions', 'guest-checks', 'list'];
  const stdin = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...base, '--file', '-']); let out = '', err = '';
    child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; }); child.on('error', reject); child.on('close', code => resolve({ code, out, err })); child.stdin.end(input);
  });
  assert.equal(stdin.code, 0, stdin.err); assert.equal(stdin.out, raw);
  const file = path.join(s.directory, 'input.json'); await writeFile(file, input);
  assert.equal((await s.run([...base, '--file', file])).code, 0); assert.equal((await s.run([...base, '--json', input])).code, 0);
  assert.equal(renewals, 1); assert.equal(calls, 3);
  const preview = await s.run([...argsFor(guest), '--rvc-num', '9007199254740993', '--closed-only', 'false', '--changed-since-utc', '2024-02-29T00:00:00.123Z', '--dry-run']);
  assert.equal(preview.code, 0); assert.match(preview.stdout, /9007199254740993/);
  assert.equal(JSON.parse(preview.stdout).data.body.clsdGuestChecksOnly, false);
  assert.equal(JSON.parse(preview.stdout).data.body.changedSinceUTC, '2024-02-29T00:00:00.123Z');
});
for (const status of [200, 400, 401, 503, 302]) test(`transaction HTTP ${status} preserves large response/error status without retries or redirects`, async t => {
  const body = 'x'.repeat(16385);
  const s = await setup(t, (req, res) => { req.resume(); res.writeHead(status, { Location: '/never-follow' }); res.end(body); });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const r = await s.run(argsFor(guest)); assert.equal(r.code, status === 200 ? 0 : status === 401 ? 9 : 11, r.stderr);
  const receipt = JSON.parse(r.stdout); assert.equal(receipt.delivery, 'file'); assert.equal(receipt.httpStatus, status);
  assert.equal(await readFile(receipt.path, 'utf8'), body); assert.equal(s.calls.length, 1);
});
for (const endpoint of transactionEndpoints.filter(e => e.cursor)) test(`${endpoint.noun}: rejected Z cursor remains exact, error stays verbatim, no cursor rewrite/retry/state change`, async t => {
  const cursor = '2024-02-29T01:02:03.1234567Z';
  const errorBody = '{ "o:errorCode": "99999", "detail": "Synthetic cursor rejection", "status": 400 }\r\n';
  const s = await setup(t, async (req, res) => {
    assert.equal(req.url, '/bi/v1/test-enterprise/' + endpoint.operation);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(body, { ...bodyFor(endpoint), [endpoint.cursor]: cursor });
    res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(errorBody);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8');
  const flag = endpoint.cursor === 'changedSinceUTC' ? '--changed-since-utc' : '--trans-since-utc';
  const result = await s.run([...argsFor(endpoint), flag, cursor]);
  assert.equal(result.code, 11, result.stderr); assert.equal(result.stdout, errorBody);
  assert.equal(s.calls.length, 1); assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('nested predicates do not cause local pruning or rewriting of returned sibling detail lines', async t => {
  const criteria = 'where equals(guestChecks.guestCheckId,123) AND equals(guestChecks.detailLines.lineNum,1)';
  const include = 'guestChecks.guestCheckId,guestChecks.detailLines.lineNum';
  const response = '{ "guestChecks": [{"guestCheckId":123,"detailLines":[{"lineNum":1},{"lineNum":2}]}] }\r\n';
  const s = await setup(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.searchCriteria, criteria); assert.equal(body.include, include);
    res.end(response);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const result = await s.run([...argsFor(guest), '--search-criteria', criteria, '--include', include]);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, response); assert.equal(s.calls.length, 1);
});
test('transaction call pins its company across selection changes and uses the shared post-delivery notifier', async t => {
  const s = await setup(t, async (req, res) => { req.resume(); assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.match(req.url, /test-enterprise/); res.end(raw); });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const registry = await s.store.loadCompanies(), original = registry.activeCompany, other = 'OTHER@127.0.0.1';
  await s.store.mutateCompanies(async current => { current.companies[other] = { ...current.companies[original], auth: { ...current.companies[original].auth, orgName: 'OTHER' }, tokens: { ...tokens(), idToken: 'other-id' }, refreshAfter: new Date(Date.now() + DAY).toISOString() }; });
  class Switching extends StateStore { count = 0; async loadCompanies() { if (++this.count === 2) await s.store.mutateCompanies(async current => { current.activeCompany = other; }); return super.loadCompanies(); } }
  let out = '', notified = false;
  t.mock.method(process.stdout, 'write', (chunk, callback) => { out += chunk; if (typeof callback === 'function') callback(); return true; });
  const code = await executeTransaction(guest, new Switching(s.directory), { locRef: 'L-1', businessDate: date }, s.directory, async () => { notified = out === raw; });
  assert.equal(code, 0); assert.equal(out, raw); assert.equal(notified, true); assert.equal((await s.store.loadCompanies()).activeCompany, other);
});
