import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildPaymentDimensionRequest, executePaymentDimension } from '../dist/payment-dimensions.js';
import { paymentDimensionEndpoints as endpoints } from '../dist/areas/payment-dimensions.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const options = e => e.organizationWide ? {organizationWide: true} : {locRef: 'L-1'};
const base = e => ['payment-dimensions', e.noun, 'list'];
const args = e => [...base(e), ...(e.organizationWide ? ['--organization-wide'] : ['--loc-ref', 'L-1'])];
const raw = e => `{ "${e.responseArray}":[{"acctHldrCode":"000Synthetic","acctCode":"000Example","acctStatus":999,"verification":null,"unknown":9007199254740993,"amount":1.234567890123456789}] }\r\n`;
test('payment dimension public schemas have distinct organization/location scope and no dates', async () => {
  const f = JSON.parse(await readFile('tests/fixtures/payment-dimensions-contract.json', 'utf8'));
  assert.equal(f.version, '2025.09.22'); assert.equal(f.endpoints.length, endpoints.length);
  for (const [i, e] of endpoints.entries()) {
    const contract = f.endpoints[i]; assert.equal(contract.path, '/bi/v1/{orgIdentifier}/' + e.operation);
    assert.equal(contract.method, 'POST'); assert.deepEqual(contract.required, e.organizationWide ? [] : ['locRef']);
    assert.deepEqual(Object.keys(contract.properties), [...(e.organizationWide ? [] : ['locRef']), 'include', 'searchCriteria', 'applicationName']);
    for (const [field, max] of [...(e.organizationWide ? [] : [['locRef', 99]]), ['include', 2000], ['searchCriteria', 2000], ['applicationName', 128]]) {
      assert.equal(contract.properties[field].maxLength, max);
      const opts = e.organizationWide ? options(e) : {};
      assert.doesNotThrow(() => buildPaymentDimensionRequest(e, state, opts, {locRef: 'L-1', ...(!e.organizationWide ? {} : {locRef: undefined}), [field]: 'x'.repeat(max)}));
      for (const bad of [null, 1, '', ' ', 'x\n', 'x'.repeat(max + 1)]) {
        assert.throws(() => buildPaymentDimensionRequest(e, state, opts, {...(e.organizationWide ? {} : {locRef: 'L-1'}), [field]: bad}), err => err.exitCode === 6);
      }
    }
    const input = parseJson('{"extension":9007199254740993,"amount":1.234567890123456789}');
    const b = buildPaymentDimensionRequest(e, state, options(e), input);
    assert.match(JSON.stringify(b.body), /9007199254740993/); assert.match(JSON.stringify(b.body), /1\.234567890123456789/);
    assert.equal(b.scope, e.organizationWide ? 'organization-wide' : 'location-scoped');
    assert.equal(b.body.organizationWide, undefined);
    for (const field of ['busDt', 'postedDt', 'opnBusDt', 'clsdBusDt', 'rvcNum', 'changedSinceUTC', 'transSinceUTC', 'effFrDt', 'effToDt']) {
      assert.throws(() => buildPaymentDimensionRequest(e, state, options(e), {[field]: null}), /not supported/);
    }
    assert.throws(() => buildPaymentDimensionRequest(e, state, {...options(e), allLocations: true}), /not supported/);
  }
});
test('payment dimensions cannot silently widen scope; org acknowledgement is not an API field or JSON bypass', () => {
  const [holder, account] = endpoints;
  for (const input of [{}, {organizationWide: true}, {searchCriteria: 'where equals(accountHolders.acctHldrStatus,1)'}]) {
    assert.throws(() => buildPaymentDimensionRequest(holder, state, {}, input), /explicit --organization-wide/);
  }
  for (const locRef of ['L', null, 1]) assert.throws(() => buildPaymentDimensionRequest(holder, state, {organizationWide: true}, {locRef}), /no locRef selector/);
  assert.throws(() => buildPaymentDimensionRequest(holder, state, {organizationWide: true, locRef: 'L'}), /no locRef selector/);
  assert.throws(() => buildPaymentDimensionRequest(account, state, {}), /Supply --loc-ref/);
  assert.throws(() => buildPaymentDimensionRequest(account, state, {organizationWide: true, locRef: 'L'}), /explicit location/);
  assert.deepEqual(buildPaymentDimensionRequest(holder, state, {organizationWide: true}).body, {});
  assert.deepEqual(buildPaymentDimensionRequest(account, state, {locRef: 'new', include: 'new'}, {locRef: 'old', include: 'old', applicationName: 'Synthetic'}).body, {locRef: 'new', include: 'new', applicationName: 'Synthetic'});
});
for (const e of endpoints) {
  test(`${e.noun}: authorized POST, tokenless offline preview/help, verbatim sensitive synthetic fields`, async t => {
    const s = await setup(t, async (req, res) => {
      assert.equal(req.url, '/bi/v1/test-enterprise/' + e.operation); assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.equal(req.headers['content-type'], 'application/json');
      const chunks = []; for await (const c of req) chunks.push(c);
      assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), e.organizationWide ? {} : {locRef: 'L-1'}); res.end(raw(e));
    });
    const preview = await s.run([...args(e), '--dry-run']); assert.equal(preview.code, 0, preview.stderr);
    assert.equal(JSON.parse(preview.stdout).data.scope, e.organizationWide ? 'organization-wide' : 'location-scoped');
    assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted, true);
    const help = await s.run([...base(e), '--help']); assert.equal(help.code, 0); assert.match(help.stdout, /Payment Cloud Service/);
    assert.match(help.stdout, /16 KiB AND 500 lines/); assert.equal(s.calls.length, 0);
    await s.store.mutate(async current => { current.tokens = tokens(); });
    const r = await s.run(args(e)); assert.equal(r.code, 0, r.stderr); assert.equal(r.stdout, raw(e)); assert.equal(s.calls.length, 1);
  });
  test(`${e.noun}: invalid scope/selectors reject before due renewal; no payment writes`, async t => {
    const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
    await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
    const before = await readFile(s.store.file, 'utf8');
    for (const extra of [['--all-locations'], ['--business-date', '2024-02-29'], ['--changed-since-utc', '2024-02-29T00:00:00'], ['--rvc-num', '7'], ['--json', '{bad'], ['--json', '[]'], ['--json', '{"busDt":"2024-02-29"}'], ['--file', 'missing', '--json', '{}'], ['--timeout', '0'], ['--timeout', '301'], e.organizationWide ? ['--loc-ref', 'L'] : ['--organization-wide']]) {
      const r = await s.run([...args(e), ...extra]); assert.equal(r.code, 6, r.stderr); assert.equal(r.stdout, '');
    }
    assert.equal((await s.run(base(e))).code, 6);
    for (const verb of ['create', 'activate', 'verify', 'settle', 'delete']) assert.equal((await s.run(['payment-dimensions', e.noun, verb])).code, 6);
    assert.equal((await s.run(['payment-dimensions', e.noun])).code, 0);
    assert.equal(s.calls.length, 0); assert.equal(await readFile(s.store.file, 'utf8'), before);
  });
  test(`${e.noun}: JSON/file/stdin filters/projections preserved with one input read across renewal`, async t => {
    const input = JSON.stringify({...(!e.organizationWide ? {locRef: 'L-1'} : {}), include: e.responseArray, searchCriteria: `where equals(${e.responseArray}.acctHldrCode,"000Synthetic")`, applicationName: 'Synthetic'}).slice(0, -1) + ',"extension":9007199254740993}';
    let refreshes = 0, queries = 0;
    const s = await setup(t, async (req, res) => {
      if (req.url.endsWith('/token')) {
        assert.equal((await form(req)).get('grant_type'), 'refresh_token'); refreshes++;
        res.end(JSON.stringify({id_token: 'renewed', refresh_token: 'rotated', expires_in: 1209600})); return;
      }
      assert.equal(req.headers.authorization, 'Bearer renewed');
      const chunks = []; for await (const c of req) chunks.push(c); assert.equal(Buffer.concat(chunks).toString(), input); queries++; res.end(raw(e));
    });
    await s.store.mutate(async current => { current.tokens = tokens(); });
    await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
    const cmd = [...base(e), ...(e.organizationWide ? ['--organization-wide'] : [])];
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...cmd, '--file', '-']); let stdout = '', stderr = '';
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', reject); child.on('close', code => resolve({code, stdout, stderr})); child.stdin.end(input);
    });
    assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, raw(e));
    const file = path.join(s.directory, 'payment.json'); await writeFile(file, input);
    for (const source of [['--file', file], ['--json', input]]) assert.equal((await s.run([...cmd, ...source])).stdout, raw(e));
    assert.equal(refreshes, 1); assert.equal(queries, 3); assert.equal((await s.store.load()).tokens.refreshToken, 'rotated');
  });
  for (const status of [200, 400, 401, 403, 503, 302]) test(`${e.noun} HTTP ${status}: complete exports/exit, no retries or redirects`, async t => {
    const response = 'x'.repeat(16385), s = await setup(t, (req, res) => { req.resume(); res.writeHead(status, {Location: '/never-follow'}); res.end(response); });
    await s.store.mutate(async current => { current.tokens = tokens(); }); const r = await s.run(args(e));
    assert.equal(r.code, status === 200 ? 0 : status === 401 ? 9 : 11, r.stderr);
    const receipt = JSON.parse(r.stdout); assert.equal(receipt.httpStatus, status); assert.equal(await readFile(receipt.path, 'utf8'), response); assert.equal(s.calls.length, 1);
  });
  test(`${e.noun}: Oracle 33108 retains actual HTTP 400 and exit 11, no guessed 403 or retry`, async t => {
    const error = '{ "o:errorCode":33108,"detail":"Synthetic permission denial","status":400 }';
    const s = await setup(t, (req, res) => { req.resume(); res.writeHead(400); res.end(error); });
    await s.store.mutate(async current => { current.tokens = tokens(); });
    const before = await readFile(s.store.file, 'utf8');
    const r = await s.run(args(e));
    assert.equal(r.code, 11); assert.equal(r.stdout, error); assert.match(r.stderr, /HTTP 400/);
    assert.equal(s.calls.length, 1); assert.equal(await readFile(s.store.file, 'utf8'), before);
  });
  test(`${e.noun}: company pinned even across selection change; notice only after non-quiet success`, async t => {
    const s = await setup(t, (req, res) => { req.resume(); assert.match(req.url, /test-enterprise/); assert.equal(req.headers.authorization, 'Bearer synthetic-id'); res.end(raw(e)); });
    await s.store.mutate(async current => { current.tokens = tokens(); });
    const original = (await s.store.loadCompanies()).activeCompany, other = 'OTHER@127.0.0.1';
    await s.store.mutateCompanies(async r => { r.companies[other] = {...r.companies[original], auth: {...r.companies[original].auth, orgName: 'OTHER'}, tokens: {...tokens(), idToken: 'other-id'}, refreshAfter: new Date(Date.now() + DAY).toISOString()}; });
    class Switching extends StateStore {
      count = 0;
      async loadCompanies() { if (++this.count === 2) await s.store.mutateCompanies(async r => { r.activeCompany = other; }); return super.loadCompanies(); }
    }
    let out = '', notices = 0;
    t.mock.method(process.stdout, 'write', (chunk, cb) => { out += chunk; if (typeof cb === 'function') cb(); return true; });
    const notify = async () => { assert.equal(out, raw(e)); notices++; };
    assert.equal(await executePaymentDimension(e, new Switching(s.directory), options(e), s.directory, notify), 0);
    assert.equal(out, raw(e)); assert.equal(notices, 1); assert.equal((await s.store.loadCompanies()).activeCompany, other);
    await s.store.mutateCompanies(async r => { r.activeCompany = original; }); out = '';
    assert.equal(await executePaymentDimension(e, s.store, {...options(e), quiet: true}, s.directory, notify), 0);
    assert.equal(out, raw(e)); assert.equal(notices, 1);
  });
}
