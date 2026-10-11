import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { quarterHourEndpoints } from '../dist/areas/aggregations.js';
import { buildDailyRequest, executeDaily } from '../dist/daily-requests.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const body = { locRef: 'L-1', busDt: '2024-02-29' };
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const endpoint = quarterHourEndpoints[0];
const base = noun => ['aggregations', 'quarter-hour', noun, 'list'];
const args = e => [...base(e.noun), '--loc-ref', body.locRef, '--business-date', body.busDt];
const raw = '{ "locRef":"L-1", "busDt":"2024-02-29", "revenueCenters":[{"rvcNum":7,"quarterHours":[{"qtrHrNum":1,"busHrNum":1,"dpName":"Synthetic-A","amount":1.234567890123456789},{"qtrHrNum":1,"busHrNum":25,"dpName":"Synthetic-B","id":9007199254740993},{"qtrHrNum":96,"busHrNum":240,"dpName":"Synthetic-C"}]}] }\r\n';
test('all eight quarter-hour contracts share the five-field request schema', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/quarter-hour-contract.json', 'utf8'));
  assert.equal(fixture.version, '2025.09.22'); assert.equal(fixture.endpoints.length, 8); assert.equal(quarterHourEndpoints.length, 8);
  assert.equal(new Set(quarterHourEndpoints.map(e => e.operation)).size, 8);
  for (const e of quarterHourEndpoints) {
    const contract = fixture.endpoints.find(c => c.path.endsWith('/' + e.operation)); assert.ok(contract);
    assert.equal(contract.method, 'POST'); assert.deepEqual(contract.required, ['locRef', 'busDt']);
    assert.deepEqual(Object.keys(contract.properties), ['locRef', 'busDt', 'searchCriteria', 'include', 'applicationName']);
    assert.equal(contract.properties.busDt.format, 'date'); assert.equal(contract.properties.locRef.maxLength, 99);
    assert.equal(contract.properties.include.maxLength, 2000); assert.equal(contract.properties.searchCriteria.maxLength, 2000);
    assert.equal(contract.properties.applicationName.maxLength, 128);
  }
});
for (const e of quarterHourEndpoints) test(`${e.operation}: exact single POST, ID token, verbatim slots and tokenless preview`, async t => {
  const s = await setup(t, async (req, res) => {
    assert.equal(req.url, '/bi/v1/test-enterprise/' + e.operation); assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, 'Bearer synthetic-id'); assert.equal(req.headers.accept, 'application/json');
    assert.equal(req.headers['content-type'], 'application/json');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), body); res.end(raw);
  });
  const preview = await s.run([...args(e), '--dry-run']); assert.equal(preview.code, 0, preview.stderr);
  assert.deepEqual(JSON.parse(preview.stdout).data.body, body); assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted, true);
  const help = await s.run([...base(e.noun), '--help']); assert.equal(help.code, 0); assert.match(help.stdout, /20\.1\.16/);
  assert.match(help.stdout, /No native time-window/); assert.match(help.stdout, /Do not assume 96 returned rows/); assert.equal(s.calls.length, 0);
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const before = await readFile(s.store.file, 'utf8'), r = await s.run(args(e));
  assert.equal(r.code, 0, r.stderr); assert.equal(r.stdout, raw); assert.equal(s.calls.length, 1);
  assert.equal(await readFile(s.store.file, 'utf8'), before);
});
test('quarter-hour scope/date/field limits and exact unknown request numbers use shared validation', () => {
  for (const e of quarterHourEndpoints) {
    for (const invalid of [{}, {locRef:'L'}, {busDt:body.busDt}, {...body,busDt:'2023-02-29'}, {...body,busDt:null}, {...body,busDt:'2024-02-29T00:00:00'}]) {
      assert.throws(() => buildDailyRequest(e, state, {}, invalid), error => error.exitCode === 6);
    }
    for (const field of ['rvcNum','opnBusDt','clsdBusDt','clsdGuestChecksOnly','changedSinceUTC','transSinceUTC']) assert.throws(() => buildDailyRequest(e,state,{}, {...body,[field]:null}), /not supported/);
    assert.throws(() => buildDailyRequest(e,state,{allLocations:true},body), /explicit location/);
    const input = parseJson('{"locRef":"L-1","busDt":"2024-02-29","extension":{"id":9007199254740993,"decimal":1.234567890123456789}}');
    assert.equal(JSON.stringify(buildDailyRequest(e,state,{},input).body),JSON.stringify(input));
    for (const [field, max] of [['locRef',99],['searchCriteria',2000],['include',2000],['applicationName',128]]) {
      assert.doesNotThrow(() => buildDailyRequest(e,state,{}, {...body,[field]:'x'.repeat(max)}));
      for (const invalid of ['', ' ', 'x\n', null, 1, 'x'.repeat(max+1)]) assert.throws(() => buildDailyRequest(e,state,{}, {...body,[field]:invalid}));
    }
  }
});
test('quarter-hour unknown flags and malformed input stop before due renewal, without slot/time defaults', async t => {
  const s = await setup(t); await s.store.mutate(async current => { current.tokens = tokens(); });
  await s.store.mutateCompanies(async r => { r.companies[r.activeCompany].refreshAfter = '2000-01-01T00:00:00.000Z'; });
  const before = await readFile(s.store.file, 'utf8');
  for (const extra of [['--rvc-num','7'],['--quarter-hour','1'],['--from','00:00'],['--all-locations'],['--open-business-date',body.busDt],['--timeout','0'],['--timeout','301'],['--json','{bad'],['--json','[]'],['--file','missing','--json','{}']]) {
    const r = await s.run([...args(endpoint), ...extra]); assert.equal(r.code,6,r.stderr); assert.equal(r.stdout,'');
  }
  for (const noun of ['taxes','employees','order-channels','control']) assert.equal((await s.run(base(noun))).code,6);
  assert.equal(s.calls.length,0); assert.equal(await readFile(s.store.file,'utf8'),before);
});
test('quarter-hour JSON/file/stdin read once across renewal, preserving explicit filters/projection and numbers', async t => {
  const input = '{"locRef":"L-1","busDt":"2024-02-29","searchCriteria":"where equals(revenueCenters.rvcNum,7) AND equals(revenueCenters.quarterHours.qtrHrNum,1)","include":"locRef,busDt,revenueCenters.rvcNum,revenueCenters.quarterHours.qtrHrNum","applicationName":"Synthetic","extension":9007199254740993}';
  let refreshes=0,queries=0;
  const s = await setup(t,async(req,res)=>{
    if(req.url.endsWith('/token')){assert.equal((await form(req)).get('grant_type'),'refresh_token');refreshes++;res.end(JSON.stringify({id_token:'renewed',refresh_token:'rotated',expires_in:1209600}));return;}
    assert.equal(req.headers.authorization,'Bearer renewed');const chunks=[];for await(const c of req)chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(),input);queries++;res.end(raw);
  });
  await s.store.mutate(async current=>{current.tokens=tokens();});
  await s.store.mutateCompanies(async r=>{r.companies[r.activeCompany].refreshAfter='2000-01-01T00:00:00.000Z';});
  const r=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tests/cli-runner.mjs',s.directory,...base(endpoint.noun),'--file','-']);let stdout='',stderr='';
    child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});child.on('error',reject);
    child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input);
  });
  assert.equal(r.code,0,r.stderr);assert.equal(r.stdout,raw);
  const file=path.join(s.directory,'quarter.json');await writeFile(file,input);
  for(const source of [['--file',file],['--json',input]])assert.equal((await s.run([...base(endpoint.noun),...source])).stdout,raw);
  assert.equal(refreshes,1);assert.equal(queries,3);assert.equal((await s.store.load()).tokens.refreshToken,'rotated');
});
for (const status of [200,400,401,403,503,302]) test(`quarter-hour HTTP ${status}: complete file and correct exit, never retry/redirect`, async t => {
  const response='x'.repeat(16385),s=await setup(t,(req,res)=>{req.resume();res.writeHead(status,{Location:'/never-follow'});res.end(response);});
  await s.store.mutate(async current=>{current.tokens=tokens();});
  const r=await s.run(args(endpoint));assert.equal(r.code,status===200?0:status===401?9:11,r.stderr);
  const receipt=JSON.parse(r.stdout);assert.equal(receipt.httpStatus,status);assert.equal(await readFile(receipt.path,'utf8'),response);assert.equal(s.calls.length,1);
});
test('quarter-hour selection stays pinned; only successful non-quiet delivery triggers notice', async t => {
  const s=await setup(t,(req,res)=>{req.resume();assert.match(req.url,/test-enterprise/);assert.equal(req.headers.authorization,'Bearer synthetic-id');res.end(raw);});
  await s.store.mutate(async current=>{current.tokens=tokens();});
  const original=(await s.store.loadCompanies()).activeCompany,other='OTHER@127.0.0.1';
  await s.store.mutateCompanies(async r=>{r.companies[other]={...r.companies[original],auth:{...r.companies[original].auth,orgName:'OTHER'},tokens:{...tokens(),idToken:'other-id'},refreshAfter:new Date(Date.now()+DAY).toISOString()};});
  class Switching extends StateStore {count=0;async loadCompanies(){if(++this.count===2)await s.store.mutateCompanies(async r=>{r.activeCompany=other;});return super.loadCompanies();}}
  let out='',notices=0;t.mock.method(process.stdout,'write',(chunk,cb)=>{out+=chunk;if(typeof cb==='function')cb();return true;});
  const options={locRef:body.locRef,businessDate:body.busDt},notify=async()=>{assert.equal(out,raw);notices++;};
  assert.equal(await executeDaily(endpoint,new Switching(s.directory),options,s.directory,notify),0);assert.equal(out,raw);assert.equal(notices,1);
  assert.equal((await s.store.loadCompanies()).activeCompany,other);
  await s.store.mutateCompanies(async r=>{r.activeCompany=original;});out='';
  assert.equal(await executeDaily(endpoint,s.store,{...options,quiet:true},s.directory,notify),0);assert.equal(out,raw);assert.equal(notices,1);
});
