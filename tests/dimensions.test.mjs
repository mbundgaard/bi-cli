import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { dimensionEndpoints } from '../dist/areas/pos-dimensions.js';
import { buildDimensionRequest } from '../dist/requests.js';
import { setup, tokens } from './helpers.mjs';
const contract = JSON.parse(await readFile('tests/fixtures/pos-dimensions-contract.json', 'utf8'));
const locations = dimensionEndpoints.find(endpoint => endpoint.noun === 'locations');
const prices = dimensionEndpoints.find(endpoint => endpoint.noun === 'menu-item-prices');
const state = { schemaVersion: 1, auth: { orgName: 'Synthetic /& org', apiUrl: 'https://api.example.invalid/gateway' } };
const command = endpoint => ['pos-dimensions', endpoint.noun, endpoint.verb];

test('all 16 endpoint paths and request capabilities match the Oracle Swagger contract', () => {
  assert.equal(dimensionEndpoints.length, 16);
  assert.equal(contract.endpoints.length, 16);
  assert.equal(new Set(dimensionEndpoints.map(endpoint => endpoint.noun)).size, 16);
  for (const endpoint of dimensionEndpoints) {
    const reference = contract.endpoints.find(item => item.path.endsWith('/' + endpoint.operation));
    assert.ok(reference, endpoint.operation); assert.equal(reference.method, 'POST');
    assert.equal(!reference.required.includes('locRef'), !!endpoint.allLocations);
    assert.equal('effFrDt' in reference.properties, !!endpoint.priceDates);
    assert.equal(reference.properties.applicationName.maxLength, 128);
    assert.equal(reference.properties.locRef.type, 'string');
  }
});
for (const endpoint of dimensionEndpoints) test(`wire contract: ${endpoint.operation}`, async t => {
  const expectedBody = { locRef: '0007', searchCriteria: "where equals(active,'Y')", include: 'locRef', applicationName: 'Synthetic Test', extension: { arbitrary: true } };
  const response = Buffer.from('{ "unknown": 9007199254740993, "precise": 0.1234567890123456789 }\r\n');
  const s = await setup(t, async (req, res) => {
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/bi/v1/test-enterprise/' + endpoint.operation);
    assert.equal(req.headers.authorization, 'Bearer synthetic-id');
    assert.equal(req.headers.accept, 'application/json'); assert.equal(req.headers['content-type'], 'application/json');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), expectedBody);
    res.end(response);
  });
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const original = await readFile(s.store.file, 'utf8');
  const result = await s.run([...command(endpoint), '--json', JSON.stringify({ ...expectedBody, locRef: 'overridden' }), '--loc-ref', '0007']);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stdout, response.toString());
  assert.equal(s.calls.length, 1); assert.equal(await readFile(s.store.file, 'utf8'), original);
});
test('request URL preserves base path and encodes enterprise as one segment', () => {
  const built = buildDimensionRequest(locations, state, { locRef: 'L-1' });
  assert.equal(built.url, 'https://api.example.invalid/gateway/bi/v1/Synthetic%20%2F%26%20org/getLocationDimensions');
  assert.throws(() => buildDimensionRequest(locations, { ...state, auth: { ...state.auth, orgName: '..' } }, { locRef: 'L-1' }));
});
test('organization-wide discovery always requires explicit opt-in, including JSON bodies', async t => {
  const s = await setup(t);
  for (const args of [command(locations), [...command(locations), '--json', '{}'], [...command(locations), '--loc-ref', ''], [...command(locations), '--json', '{"locRef":null}'], [...command(locations), '--all-locations', '--loc-ref', 'L-1'], [...command(locations), '--all-locations', '--json', '{"locRef":"L-1"}']]) {
    const result = await s.run(args); assert.equal(result.code, 6, result.stderr); assert.equal(result.stdout, '');
  }
  const preview = await s.run([...command(locations), '--all-locations', '--dry-run']);
  assert.equal(preview.code, 0, preview.stderr); const data = JSON.parse(preview.stdout).data;
  assert.equal(data.scope, 'organization-wide'); assert.deepEqual(data.body, {}); assert.equal(s.calls.length, 0);
});
test('dry-run requires configuration but no tokens or network, and omits authorization', async t => {
  const s = await setup(t);
  const result = await s.run([...command(prices), '--loc-ref', '0007', '--effective-from', '2024-02-29', '--effective-to', '2024-03-01', '--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  const data = JSON.parse(result.stdout).data;
  assert.equal(data.body.effFrDt, '2024-02-29'); assert.equal(data.body.effToDt, '2024-03-01');
  assert.equal(data.headers.Authorization, undefined); assert.equal(data.authorizationOmitted, true); assert.equal(data.readOnly, true);
  assert.equal(s.calls.length, 0);
});
test('all optional flags are explicit overrides; unknown fields survive untouched', () => {
  const built = buildDimensionRequest(prices, state, { locRef: 'new', searchCriteria: "where equals(name,'A')", include: 'menuItemPrices', applicationName: 'new-app', effectiveFrom: '2025-01-01' },
    { locRef: 'old', searchCriteria: 'old', include: 'old', applicationName: 'old', effFrDt: '2024-01-01', extra: ['future', { key: true }] });
  assert.deepEqual(built.body, { locRef: 'new', searchCriteria: "where equals(name,'A')", include: 'menuItemPrices', applicationName: 'new-app', effFrDt: '2025-01-01', extra: ['future', { key: true }] });
});
test('invalid body types, dates, projections, flags and oversized application names fail before network', async t => {
  const s = await setup(t);
  for (const args of [
    ['--json', '[]'], ['--json', '1e9999'], ['--json', '{secret-malformed}'], ['--json', '{"locRef":7}'],
    ['--json', '{"locRef":"L-1","include":[]}'], ['--loc-ref', 'L-1', '--include', ''],
    ['--loc-ref', 'L-1', '--search-criteria', ''], ['--loc-ref', 'L-1', '--application-name', 'a'.repeat(129)],
    ['--loc-ref', 'L-1', '--effective-from', '2025-02-29'], ['--loc-ref', 'L-1', '--effective-to', '2025-02-30'],
    ['--loc-ref', 'L-1', '--effective-from', '2025-03-02', '--effective-to', '2025-03-01'],
    ['--loc-ref', 'L-1', '--effective-from', '2025-03-02T00:00:00Z'],
    ['--loc-ref', 'L-1', '--json', '{}', '--file', '-'], ['--loc-ref', 'L-1', '--all-locations'],
  ]) { const result = await s.run([...command(prices), ...args, '--dry-run']); assert.equal(result.code, 6, JSON.stringify(args)); assert.equal(result.stdout, ''); assert.doesNotMatch(result.stderr, /secret-malformed/); }
  assert.equal((await s.run([...command(locations), '--loc-ref', 'L-1', '--json', '{"effFrDt":"2025-01-01"}'])).code, 6);
  assert.equal(s.calls.length, 0);
});
test('inline/file/stdin bodies preserve exact JSON numbers; dry-run does too', async t => {
  const raw = '{"locRef":"0007","large":9007199254740993,"precise":0.1234567890123456789,"negzero":-0,"huge":1e9999}';
  const s = await setup(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), raw); res.end('OK');
  });
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const file = path.join(s.directory, 'request.json'); await writeFile(file, raw);
  for (const args of [['--json', raw], ['--file', file]]) {
    const result = await s.run([...command(prices), ...args]); assert.equal(result.code, 0, result.stderr);
  }
  const stdin = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/cli-runner.mjs', s.directory, ...command(prices), '--file', '-']);
    const out = [], err = []; child.stdout.on('data', b => out.push(b)); child.stderr.on('data', b => err.push(b));
    child.on('error', reject); child.on('close', code => resolve({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() })); child.stdin.end(raw);
  });
  assert.equal(stdin.code, 0, stdin.stderr); assert.equal(s.calls.length, 3);
  const preview = await s.run([...command(prices), '--json', raw, '--dry-run']); assert.equal(preview.code, 0, preview.stderr);
  for (const value of ['9007199254740993', '0.1234567890123456789', '-0', '1e9999']) assert.ok(preview.stdout.includes(value));
  assert.equal(s.calls.length, 3);
});
for (const [status, expectedExit, body] of [[200, 0, 'not JSON\r\n'], [204, 0, ''], [302, 11, 'redirect'], [400, 11, '{ "error": "synthetic" }'], [401, 9, 'unauthorized'], [403, 11, 'forbidden'], [500, 11, '<html>synthetic</html>']]) {
  test(`HTTP ${status} preserves raw response and exit code ${expectedExit} without retries`, async t => {
    const s = await setup(t, (_, res) => { res.writeHead(status, { Location: '/never-follow' }); res.end(body); });
    await s.store.mutate(async state => { state.tokens = tokens(); });
    const result = await s.run([...command(locations), '--loc-ref', 'L-1', '--quiet']);
    assert.equal(result.code, expectedExit); assert.equal(result.stdout, body); assert.equal(result.stderr, ''); assert.equal(s.calls.length, 1);
  });
}
test('compressed API bytes are decoded without reformatting JSON', async t => {
  const body = '{ "value" : 9007199254740993 }\n';
  const s = await setup(t, (_, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end(gzipSync(body)); });
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const result = await s.run([...command(locations), '--loc-ref', 'L-1']); assert.equal(result.code, 0); assert.equal(result.stdout, body);
});
test('missing BI tokens fail locally; expired sets are removed without refresh', async t => {
  const s = await setup(t);
  assert.equal((await s.run([...command(locations), '--loc-ref', 'L-1'])).code, 8);
  await s.store.mutate(async state => { state.tokens = { ...tokens(), obtainedAt: '2000-01-01T00:00:00.000Z' }; });
  assert.equal((await s.run([...command(locations), '--loc-ref', 'L-1'])).code, 8); assert.equal(s.calls.length, 0);
  assert.equal((await s.store.load()).tokens, undefined);
});
test('interrupted data responses produce no partial stdout and no retry', async t => {
  const s = await setup(t, (_, res) => { res.writeHead(200, { 'Content-Length': '1000' }); res.write('partial'); setTimeout(() => res.destroy(), 10); });
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const result = await s.run([...command(locations), '--loc-ref', 'L-1']); assert.equal(result.code, 10); assert.equal(result.stdout, ''); assert.equal(s.calls.length, 1);
});
