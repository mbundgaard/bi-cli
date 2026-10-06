import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const temp = mkdtempSync(path.join(tmpdir(), 'bi-package-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run test:package');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
function npmCommand(args) {
  const result = spawnSync(process.execPath, [npm, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  return result.stdout;
}
try {
  const [packed] = JSON.parse(npmCommand(['pack', '--ignore-scripts', '--json', '--pack-destination', temp]));
  const allow = new Set(['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', 'bin/bi.js', 'docs/CLI.md', 'docs/AUTHENTICATION.md', 'docs/DEVELOPMENT.md']);
  for (const file of packed.files) assert.ok(allow.has(file.path) || /^dist\/(?:areas\/)?[a-z-]+\.(?:js|d\.ts)$/.test(file.path), `Unexpected package file: ${file.path}`);
  npmCommand(['install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, packed.filename)]);
  const shim = path.join(temp, 'node_modules', '.bin', process.platform === 'win32' ? 'bi.cmd' : 'bi');
  const execute = args => process.platform === 'win32'
    ? spawnSync(`"${shim}" ${args.join(' ')}`, { encoding: 'utf8', shell: true })
    : spawnSync(shim, args, { encoding: 'utf8' });
  const version = execute(['--version']); assert.equal(version.status, 0, version.stderr); assert.equal(version.stdout.trim(), pkg.version);
  const help = execute(['auth', 'login', '--help']); assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /--password/);
  const rootHelp = execute(['--help']); assert.equal(rootHelp.status, 0); assert.doesNotMatch(rootHelp.stdout, /--state-dir|--insecure/);
  const invalid = execute(['invalid-command']); assert.equal(invalid.status, 6); assert.equal(invalid.stdout, '');
  // State checks use installed modules and an isolated store, never real user data.
  const module = name => pathToFileURL(path.join(temp, 'node_modules/@muneris/bi-cli/dist', name)).href;
  const status = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { main } from ${JSON.stringify(module('cli.js'))};
     import { StateStore } from ${JSON.stringify(module('state.js'))};
     process.exitCode = await main(['node','bi','auth','status'], new StateStore(${JSON.stringify(path.join(temp, 'state'))}));`
  ], { encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr); assert.equal(JSON.parse(status.stdout).data.state, 'no-tokens');
  console.log(`${packed.filename}: ${packed.files.length} allowlisted files; installed shim/help/version/parser and isolated state verified.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
