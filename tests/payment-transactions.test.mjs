import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildPaymentTransactionRequest, executePaymentTransaction } from '../dist/payment-transactions.js';
import { paymentTransactionEndpoints as endpoints } from '../dist/areas/payment-transactions.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const body = e => ({[e.accountScoped ? 'acctCode' : 'locRef']: e.accountScoped ? '000Synthetic' : 'L-1', [e.dateField]: '2024-02-29'});
const options = e => ({[e.accountScoped ? 'accountCode' : 'locRef']: e.accountScoped ? '000Synthetic' : 'L-1', [e.dateOption]: '2024-02-29'});
const base = e => ['payment-transactions', e.noun, 'list'];
const args = e => [...base(e), e.accountScoped ? '--account-code' : '--loc-ref', e.accountScoped ? '000Synthetic' : 'L-1', e.dateFlag, '2024-02-29'];
const raw = '{ "accounts":[{"acctCode":"000Synthetic","unknown":9007199254740993,"amount":1.234567890123456789,"payoutAmt":"001.20","pmntType":"PAY","cardPresentFlag":false,"curStatus":"UNKNOWN","busDt":"2024-02-28","pymtID":"Synthetic","pymtDtlID":"Synthetic-detail","cardAlias":null}] }\r\n';
test('five payment transaction contracts have distinct required date/scope and only two cursor endpoints', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/payment-transactions-contract.json', 'utf8'));
  assert.equal(fixture.version, '2025.09.22'); assert.equal(fixture.method, 'POST'); assert.equal(fixture.endpoints.length, 5);
  for (const e of endpoints) {
    const f = fixture.endpoints.find(f => f.operation === e.operation);
    assert.deepEqual(new Set(f.required), new Set(Object.keys(body(e))));
    assert.equal(f.properties[e.dateField].format, 'date'); assert.equal(!!f.properties.changedSinceUTC, !!e.cursor);
    for (const [field, max] of [...(e.accountScoped ? [] : [['locRef', 99]]), ['include', 2000], ['searchCriteria', 2000], ['applicationName', 128]]) {
      assert.equal((f.properties[field] ?? fixture.commonProperties[field]).maxLength, max);
      assert.doesNotThrow(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), [field]: 'x'.repeat(max)}));
      for (const bad of [null, 1, '', ' ', 'x\n', 'x'.repeat(max + 1)]) assert.throws(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), [field]: bad}), err => err.exitCode === 6);
    }
    const input = parseJson(JSON.stringify(body(e)).slice(0, -1) + ',"extension":9007199254740993,"amount":1.234567890123456789}');
    assert.equal(JSON.stringify(buildPaymentTransactionRequest(e, state, {}, input).body), JSON.stringify(input));
    assert.equal(buildPaymentTransactionRequest(e, state, options(e)).scope, e.accountScoped ? 'account/date-scoped' : 'location/date-scoped');
  }
});
for (const e of endpoints) {
  test(`${e.noun}: exact scope/date, incompatible selectors rejected, no implicit date or cursor`, () => {
    assert.deepEqual(buildPaymentTransactionRequest(e, state, options(e)).body, body(e));
    for (const key of Object.keys(body(e))) {
      const missing = {...body(e)}; delete missing[key];
      assert.throws(() => buildPaymentTransactionRequest(e, state, {}, missing), err => err.exitCode === 6);
      for (const value of [null, '', 1]) assert.throws(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), [key]: value}));
    }
    for (const date of ['2023-02-29', '2024-02-30', '2024-02-29T00:00:00']) assert.throws(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), [e.dateField]: date}));
    for (const field of ['busDt', 'stlmtDt', 'bookingDt', 'payoutDt', 'recordDt', 'postedDt', 'opnBusDt', 'clsdBusDt', 'rvcNum', 'transSinceUTC', e.accountScoped ? 'locRef' : 'acctCode']) {
      if (field !== e.dateField) assert.throws(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), [field]: null}), /not supported/);
    }
    assert.throws(() => buildPaymentTransactionRequest(e, state, {...options(e), allLocations: true}), /no all-location mode/);
    assert.equal(buildPaymentTransactionRequest(e, state, {...options(e), include: 'new'}, {...body(e), include: 'old'}).body.include, 'new');
    if (e.cursor) {
      for (const cursor of ['2024-02-29T00:00:00', '2024-02-29T23:59:59.1234567Z']) assert.equal(buildPaymentTransactionRequest(e, state, {...options(e), changedSinceUtc: cursor}).body.changedSinceUTC, cursor);
      for (const cursor of [null, 1, '', '2023-02-29T00:00:00', '2024-02-29T24:00:00', '2024-02-29T23:59:60', '2024-02-29T10:00:00+00:00']) assert.throws(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), changedSinceUTC: cursor}));
    } else assert.throws(() => buildPaymentTransactionRequest(e, state, {}, {...body(e), changedSinceUTC: '2024-02-29T00:00:00'}), /not supported/);
  });
  test(`${e.noun}: authorized POST, offline help/dry-run and untouched response type/date/amount discrepancies`, async t => {
    const s = await setup(t, async (req, res) => {
      assert.equal(req.url, '/bi/v1/test-enterprise/' + e.operation); assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.equal(req.headers['content-type'], 'application/json');
      const chunks = []; for await (const c of req) chunks.push(c); assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), body(e)); res.end(raw);
    });
    const p = await s.run([...args(e), '--dry-run']); assert.equal(p.code, 0, p.stderr); assert.equal(JSON.parse(p.stdout).data.authorizationOmitted, true);
    const help = await s.run([...base(e), '--help']); assert.equal(help.code, 0); assert.ok(help.stdout.includes(e.dateFlag)); assert.match(help.stdout, /16 KiB AND 500 lines/); assert.equal(s.calls.length, 0);
    await s.store.mutate(async current => { current.tokens = tokens(); });
    const r = await s.run(args(e)); assert.equal(r.code, 0, r.stderr); assert.equal(r.stdout, raw); assert.equal(s.calls.length, 1);
  });
  test(`${e.noun}: invalid flags/body before renewal, no refund/settlement/dispute mutations`, async t => {
    const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
    await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
    const before = await readFile(s.store.file, 'utf8');
    for (const extra of [['--all-locations'], ['--organization-wide'], ['--rvc-num', '7'], ['--json', '{bad'], ['--json', '[]'], ['--json', '{"postedDt":"2024-02-29"}'], ['--file', 'missing', '--json', '{}'], ['--timeout', '0'], ['--timeout', '301'], e.accountScoped ? ['--loc-ref', 'L'] : ['--account-code', 'X']]) {
      const r = await s.run([...args(e), ...extra]); assert.equal(r.code, 6, r.stderr); assert.equal(r.stdout, '');
    }
    assert.equal((await s.run(base(e))).code, 6);
    for (const verb of ['create', 'refund', 'settle', 'cancel', 'dispute']) assert.equal((await s.run(['payment-transactions', e.noun, verb])).code, 6);
    assert.equal((await s.run(['payment-transactions', e.noun])).code, 0);
    assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
  });
  test(`${e.noun}: all fields JSON/file/stdin one input read across renewal`, async t => {
    const input = JSON.stringify({...body(e), ...(e.cursor ? {changedSinceUTC: '2024-02-29T10:00:00.1234567'} : {}), include: e.accountScoped ? 'payouts.payoutUTC' : 'accounts.acctCode', searchCriteria: 'where equals(synthetic,1)', applicationName: 'Synthetic'}).slice(0, -1) + ',"extension":9007199254740993}';
    let refreshes = 0, queries = 0;
    const s = await setup(t, async (req, res) => {
      if (req.url.endsWith('/token')) { assert.equal((await form(req)).get('grant_type'), 'refresh_token'); refreshes++; res.end(JSON.stringify({id_token: 'renewed', refresh_token: 'rotated', expires_in: 1209600})); return; }
      assert.equal(req.headers.authorization, 'Bearer renewed'); const chunks = []; for await (const c of req) chunks.push(c); assert.equal(Buffer.concat(chunks).toString(), input); queries++; res.end(raw);
    });
    await s.store.mutate(async current => { current.tokens = tokens(); });
    await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...base(e), '--file', '-']); let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; }); child.on('error', reject); child.on('close', code => resolve({code, stdout, stderr})); child.stdin.end(input);
    });
    assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw);
    const file = path.join(s.directory, 'payment.json'); await writeFile(file, input);
    for (const source of [['--file', file], ['--json', input]]) assert.equal((await s.run([...base(e), ...source])).stdout, raw);
    assert.equal(refreshes, 1); assert.equal(queries, 3); assert.equal((await s.store.load()).tokens.refreshToken, 'rotated');
  });
  for (const status of [200, 400, 401, 403, 503, 302]) test(`${e.noun} HTTP ${status}: complete export, preserved exit, no retries/redirects`, async t => {
    const response = 'x'.repeat(16385), s = await setup(t, (req, res) => { req.resume(); res.writeHead(status, {Location: '/never-follow'}); res.end(response); });
    await s.store.mutate(async current => { current.tokens = tokens(); }); const r = await s.run(args(e));
    assert.equal(r.code, status === 200 ? 0 : status === 401 ? 9 : 11, r.stderr);
    const receipt = JSON.parse(r.stdout); assert.equal(receipt.httpStatus, status); assert.equal(await readFile(receipt.path, 'utf8'), response); assert.equal(s.calls.length, 1);
  });
  test(`${e.noun}: identity pinned and notices only after successful non-quiet delivery`, async t => {
    const s = await setup(t, (req, res) => { req.resume(); assert.match(req.url, /test-enterprise/); assert.equal(req.headers.authorization, 'Bearer synthetic-id'); res.end(raw); });
    await s.store.mutate(async current => { current.tokens = tokens(); });
    const original = (await s.store.loadCompanies()).activeCompany, other = 'OTHER@127.0.0.1';
    await s.store.mutateCompanies(async r => { r.companies[other] = {...r.companies[original], auth: {...r.companies[original].auth, orgName: 'OTHER'}, tokens: {...tokens(), idToken: 'other-id'}, refreshAfter: new Date(Date.now() + DAY).toISOString()}; });
    class Switching extends StateStore { count = 0; async loadCompanies() { if (++this.count === 2) await s.store.mutateCompanies(async r => { r.activeCompany = other; }); return super.loadCompanies(); } }
    let out = '', notices = 0; t.mock.method(process.stdout, 'write', (chunk, cb) => { out += chunk; if (typeof cb === 'function') cb(); return true; });
    const notify = async () => { assert.equal(out, raw); notices++; };
    assert.equal(await executePaymentTransaction(e, new Switching(s.directory), options(e), s.directory, notify), 0);
    assert.equal(out, raw); assert.equal(notices, 1); assert.equal((await s.store.loadCompanies()).activeCompany, other);
    await s.store.mutateCompanies(async r => { r.activeCompany = original; }); out = '';
    assert.equal(await executePaymentTransaction(e, s.store, {...options(e), quiet: true}, s.directory, notify), 0); assert.equal(out, raw); assert.equal(notices, 1);
  });
}
