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
  const allow = new Set(['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', 'bin/bi.js', 'docs/CLI.md', 'docs/AUTHENTICATION.md', 'docs/DEVELOPMENT.md', 'docs/POS-DIMENSIONS.md', 'docs/POS-TRANSACTIONS.md', 'docs/DAILY-TOTALS.md', 'docs/RESPONSES.md']);
  for (const file of packed.files) assert.ok(allow.has(file.path) || /^dist\/(?:areas\/)?[a-z-]+\.(?:js|d\.ts)$/.test(file.path), `Unexpected package file: ${file.path}`);
  npmCommand(['install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', path.join(temp, packed.filename)]);
  const shim = path.join(temp, 'node_modules', '.bin', process.platform === 'win32' ? 'bi.cmd' : 'bi');
  const execute = args => process.platform === 'win32'
    ? spawnSync(`"${shim}" ${args.join(' ')}`, { encoding: 'utf8', shell: true })
    : spawnSync(shim, args, { encoding: 'utf8' });
  const version = execute(['--version']); assert.equal(version.status, 0, version.stderr); assert.equal(version.stdout.trim(), pkg.version);
  const help = execute(['auth', 'login', '--help']); assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /--password/);
  const rootHelp = execute(['--help']); assert.equal(rootHelp.status, 0); assert.doesNotMatch(rootHelp.stdout, /--state-dir|--insecure/);
  const dimensionsHelp = execute(['pos-dimensions', 'locations', 'list', '--help']);
  assert.equal(dimensionsHelp.status, 0, dimensionsHelp.stderr);
  assert.match(dimensionsHelp.stdout, /--all-locations/); assert.match(dimensionsHelp.stdout, /--dry-run/);
  assert.match(dimensionsHelp.stdout, /check npm daily/);
  const companyHelp = execute(['company', '--help']); assert.equal(companyHelp.status, 0); assert.match(companyHelp.stdout, /select/);
  const updateHelp = execute(['version', '--help']); assert.equal(updateHelp.status, 0); assert.match(updateHelp.stdout, /--check/);
  const transactionHelp = execute(['pos-transactions', 'guest-checks', 'list', '--help']);
  assert.equal(transactionHelp.status, 0, transactionHelp.stderr); assert.match(transactionHelp.stdout, /--closed-only/);
  assert.match(transactionHelp.stdout, /--changed-since-utc/); assert.match(transactionHelp.stdout, /exactly one/);
  const dailyHelp = execute(['aggregations', 'daily', 'operations', 'list', '--help']);
  assert.equal(dailyHelp.status, 0, dailyHelp.stderr); assert.match(dailyHelp.stdout, /--business-date/);
  assert.match(dailyHelp.stdout, /getOperationsDailyTotals/); assert.match(dailyHelp.stdout, /no retries/i);
  const invalid = execute(['invalid-command']); assert.equal(invalid.status, 6); assert.equal(invalid.stdout, '');
  // State checks use installed modules and an isolated store, never real user data.
  const module = name => pathToFileURL(path.join(temp, 'node_modules/@muneris/bi-cli/dist', name)).href;
  const status = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { main } from ${JSON.stringify(module('cli.js'))};
     import { StateStore } from ${JSON.stringify(module('state.js'))};
     process.exitCode = await main(['node','bi','auth','status'], new StateStore(${JSON.stringify(path.join(temp, 'state'))}));`
  ], { encoding: 'utf8' });
  assert.equal(status.status, 0, status.stderr); assert.equal(JSON.parse(status.stdout).data.state, 'no-tokens');
  const preview = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { main } from ${JSON.stringify(module('cli.js'))};
     import { StateStore } from ${JSON.stringify(module('state.js'))};
     const store = new StateStore(${JSON.stringify(path.join(temp, 'preview-state'))});
     await store.save({schemaVersion:1,auth:{orgName:'synthetic',apiUrl:'https://reports.example.invalid'}});
     process.exitCode = await main(['node','bi','pos-dimensions','locations','list','--all-locations','--dry-run'], store);`
  ], { encoding: 'utf8' });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted, true);
  assert.equal(JSON.parse(preview.stdout).data.scope, 'organization-wide');
  const transactionPreview = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { main } from ${JSON.stringify(module('cli.js'))};
     import { StateStore } from ${JSON.stringify(module('state.js'))};
     const store = new StateStore(${JSON.stringify(path.join(temp, 'transaction-state'))});
     await store.save({schemaVersion:1,auth:{orgName:'synthetic',apiUrl:'https://reports.example.invalid'}});
     process.exitCode = await main(['node','bi','pos-transactions','guest-checks','list','--loc-ref','synthetic','--business-date','2024-02-29','--closed-only','false','--rvc-num','9007199254740993','--dry-run'],store);`
  ], { encoding: 'utf8' });
  assert.equal(transactionPreview.status, 0, transactionPreview.stderr);
  assert.match(transactionPreview.stdout, /9007199254740993/);
  assert.equal(JSON.parse(transactionPreview.stdout).data.body.clsdGuestChecksOnly, false);
  assert.equal(JSON.parse(transactionPreview.stdout).data.authorizationOmitted, true);
  const dailyPreview = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { main } from ${JSON.stringify(module('cli.js'))};
     import { StateStore } from ${JSON.stringify(module('state.js'))};
     const store = new StateStore(${JSON.stringify(path.join(temp, 'daily-state'))});
     await store.save({schemaVersion:1,auth:{orgName:'synthetic',apiUrl:'https://reports.example.invalid'}});
     process.exitCode = await main(['node','bi','aggregations','daily','menu-items','list','--loc-ref','synthetic','--business-date','2024-02-29','--include','locRef,busDt,revenueCenters.rvcNum','--dry-run'],store);`
  ], { encoding: 'utf8' });
  assert.equal(dailyPreview.status, 0, dailyPreview.stderr);
  assert.deepEqual(JSON.parse(dailyPreview.stdout).data.body, { locRef: 'synthetic', busDt: '2024-02-29', include: 'locRef,busDt,revenueCenters.rvcNum' });
  assert.equal(JSON.parse(dailyPreview.stdout).data.authorizationOmitted, true);
  const delivery = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import http from 'node:http';
     import { main } from ${JSON.stringify(module('cli.js'))};
     import { StateStore } from ${JSON.stringify(module('state.js'))};
     const server = http.createServer((req,res) => { req.resume(); res.end(Buffer.alloc(20000,120)); });
     await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
     try {
       const store = new StateStore(${JSON.stringify(path.join(temp, 'delivery-state'))});
       await store.save({schemaVersion:1,auth:{orgName:'synthetic',apiUrl:'http://127.0.0.1:'+server.address().port,authUrl:'http://127.0.0.1:'+server.address().port,clientId:'opaque-synthetic',username:'Synthetic_User'},
         tokens:{idToken:'synthetic-id',refreshToken:'synthetic-refresh',codeVerifier:'a'.repeat(43),obtainedAt:new Date().toISOString(),expiresIn:3600}});
       process.exitCode = await main(['node','bi','pos-dimensions','menu-items','list','--loc-ref','synthetic','--quiet'],store);
     } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }`
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(delivery.status, 0, delivery.stderr);
  const receipt = JSON.parse(delivery.stdout);
  assert.equal(receipt.delivery, 'file'); assert.equal(receipt.bytes, 20000);
  assert.ok(receipt.path.startsWith(path.join(temp, 'delivery-state') + path.sep));
  assert.deepEqual(readFileSync(receipt.path), Buffer.alloc(20000, 120));
  const notice = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { notifyForUpdates } from ${JSON.stringify(module('updates.js'))};
     const directory = ${JSON.stringify(path.join(temp, 'update-state'))};
     let calls = 0;
     const check = async () => { calls++; return { updateAvailable: true, latestVersion: '99.0.0' }; };
     await notifyForUpdates(directory, ${JSON.stringify(pkg.version)}, check);
     await notifyForUpdates(directory, ${JSON.stringify(pkg.version)}, check);
     if (calls !== 1) throw Error('Expected one daily lookup');`
  ], { encoding: 'utf8', timeout: 10000 });
  assert.equal(notice.status, 0, notice.stderr); assert.equal(notice.stdout, '');
  assert.match(notice.stderr, /99\.0\.0 is available/);
  console.log(`${packed.filename}: ${packed.files.length} allowlisted files; installed shim/help/version/parser, isolated state, dimension/transaction/daily dry-run, automatic file delivery and daily update notice verified.`);
} finally { rmSync(temp, { recursive: true, force: true }); }
