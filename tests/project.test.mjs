import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
test('scaffold stays private and excludes test/runtime/private files from package allowlist', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.private, true); assert.equal(pkg.name, '@muneris/bi-cli'); assert.equal(pkg.bin.bi, 'bin/bi.js');
  assert.ok(!pkg.files.some(file => /tests|src|references|BiCli\.json|\.local/.test(file)));
});
test('local documentation links resolve', async () => {
  const files = ['README.md', ...((await readdir('docs')).filter(file => file.endsWith('.md')).map(file => 'docs/' + file))];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z]+:|#)/i.test(match[1])) continue;
      const target = path.resolve(path.dirname(file), match[1].split('#')[0]);
      await assert.doesNotReject(access(target), `${file}: ${match[1]}`);
    }
  }
});
