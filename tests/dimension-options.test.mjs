import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setup, tokens } from './helpers.mjs';

const menu = ['pos-dimensions', 'menu-items', 'list'];
const latest = ['pos-dimensions', 'latest-business-date', 'get'];

test('help distinguishes observed endpoint and date/filter compatibility differences', async t => {
  const s = await setup(t);
  const date = await s.run([...latest, '--help']);
  assert.equal(date.code, 0); assert.match(date.stdout, /rejects include and searchCriteria/);
  const price = await s.run(['pos-dimensions', 'menu-item-prices', 'list', '--help']);
  assert.equal(price.code, 0); assert.match(price.stdout, /as-of snapshot/);
  assert.match(price.stdout, /where !equals/); assert.equal(s.calls.length, 0);
});

test('query timeout is an absolute deadline even during a trickling response; no partial stdout or retry', { timeout: 15000 }, async t => {
  const s = await setup(t, (_, res) => {
    res.writeHead(200); res.write('partial');
    const timer = setInterval(() => res.write('more'), 20);
    res.on('close', () => clearInterval(timer));
  });
  await s.store.mutate(async state => { state.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8');
  const result = await s.run([...menu, '--loc-ref', 'synthetic', '--timeout', '0.15', '--quiet']);
  assert.equal(result.code, 10, result.stderr); assert.equal(result.stdout, '');
  assert.match(result.stderr, /no retry/i); assert.equal(s.calls.length, 1);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
});

test('invalid timeout values fail locally, including quiet and dry-run', async t => {
  const s = await setup(t);
  for (const value of ['0', '-1', '301', 'Infinity', 'NaN', 'not-a-number']) {
    const result = await s.run([...menu, '--loc-ref', 'synthetic', '--timeout', value, '--dry-run', '--quiet']);
    assert.equal(result.code, 6, value); assert.equal(result.stdout, ''); assert.match(result.stderr, /timeout/);
  }
  assert.equal(s.calls.length, 0);
});

test('application-name boundary and control characters are validated without network', async t => {
  const s = await setup(t);
  for (const length of [1, 128]) {
    const result = await s.run([...menu, '--loc-ref', 'synthetic', '--application-name', 'x'.repeat(length), '--dry-run']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).data.body.applicationName.length, length);
  }
  for (const body of [{ applicationName: 'x'.repeat(129) }, { applicationName: '' }, { applicationName: 'line\nbreak' }, { locRef: 'line\nbreak' }, { include: 1 }, { searchCriteria: false }]) {
    const result = await s.run([...menu, '--json', JSON.stringify({ locRef: 'synthetic', ...body }), '--dry-run']);
    assert.equal(result.code, 6); assert.equal(result.stdout, '');
  }
  assert.equal(s.calls.length, 0);
});

test('explicit flag overrides replace invalid owned JSON values without dropping unknown fields', async t => {
  const s = await setup(t);
  const result = await s.run([...menu, '--json', '{"locRef":null,"include":[],"applicationName":false,"custom":9007199254740993}',
    '--loc-ref', 'synthetic', '--include', 'locRef', '--application-name', 'Synthetic', '--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  const body = JSON.parse(result.stdout).data.body;
  assert.equal(body.locRef, 'synthetic'); assert.equal(body.include, 'locRef'); assert.equal(body.applicationName, 'Synthetic');
  assert.match(result.stdout, /9007199254740993/); assert.equal(s.calls.length, 0);
});

test('UTF-8 BOM input works; unreadable files and malformed JSON remain local and private', async t => {
  const s = await setup(t);
  const file = path.join(s.directory, 'request.json');
  await writeFile(file, '\uFEFF{"locRef":"synthetic","custom":"Unicode æøå"}');
  const result = await s.run([...menu, '--file', file, '--dry-run']);
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).data.body.custom, 'Unicode æøå');
  for (const args of [['--file', path.join(s.directory, 'missing.json')], ['--json', '{"private-marker":']]) {
    const failure = await s.run([...menu, ...args, '--dry-run', '--quiet']);
    assert.equal(failure.code, 6); assert.equal(failure.stdout, ''); assert.doesNotMatch(failure.stderr, /private-marker/);
  }
  assert.equal(s.calls.length, 0);
});

test('filter spelling and unsupported-field errors are never repaired, dropped or retried', async t => {
  const expressions = ["where !equals(items.num,7)", "where !(equals(items.num,7))", "equals(items.num,7)"];
  const raw = '{ "status":400, "detail":"Synthetic unsupported field" }\r\n';
  let index = 0;
  const s = await setup(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.searchCriteria, expressions[index++]); assert.equal(body.include, 'locRef');
    res.writeHead(400); res.end(raw);
  });
  await s.store.mutate(async state => { state.tokens = tokens(); });
  for (const expression of expressions) {
    const result = await s.run([...latest, '--loc-ref', 'synthetic', '--search-criteria', expression, '--include', 'locRef']);
    assert.equal(result.code, 11); assert.equal(result.stdout, raw);
  }
  assert.equal(s.calls.length, expressions.length);
});
