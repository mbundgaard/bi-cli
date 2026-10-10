import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { controlEndpoint } from '../dist/areas/aggregations.js';
import { buildDailyRequest } from '../dist/daily-requests.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens } from './helpers.mjs';
const base = ['aggregations', 'daily', 'control', 'list'];
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const date = '2024-02-29';
const raw = '{ "eodStatus":1, "lastUpdatedUTC":"2024-03-01T01:02:03", "revenueCenters":[{"rvcNum":7,"clsdChkTtl":1.234567890123456789,"numClsdChks":9007199254740993}] }\r\n';
test('control request contract follows mutually exclusive descriptions, not contradictory required list', async () => {
  const fixture = JSON.parse(await readFile('tests/fixtures/control-totals-contract.json', 'utf8'));
  assert.equal(fixture.operation, controlEndpoint.operation);
  assert.deepEqual(fixture.request.required, ['locRef', 'busDt', 'clsdBusDt', 'opnBusDt']);
  assert.deepEqual(Object.keys(fixture.request.properties), ['locRef', 'busDt', 'opnBusDt', 'clsdBusDt', 'rvcNum', 'searchCriteria', 'include', 'applicationName']);
  for (const field of ['busDt', 'opnBusDt', 'clsdBusDt']) {
    assert.match(fixture.request.properties[field].description, /cannot be present/);
    const body = { locRef: 'L', [field]: date };
    assert.deepEqual(buildDailyRequest(controlEndpoint, state, {}, body).body, body);
  }
  for (const input of [{locRef:'L'}, {locRef:'L',busDt:date,opnBusDt:date}, {locRef:'L',clsdBusDt:date,opnBusDt:date}]) assert.throws(() => buildDailyRequest(controlEndpoint,state,{},input), /exactly one/);
  assert.throws(() => buildDailyRequest(controlEndpoint,state,{openBusinessDate:date},{locRef:'L',busDt:date}), /exactly one/);
  for (const field of ['changedSinceUTC','transSinceUTC','clsdGuestChecksOnly']) assert.throws(() => buildDailyRequest(controlEndpoint,state,{}, {locRef:'L',busDt:date,[field]:null}), /not supported/);
  for (const value of ['2023-02-29',null,'2024-02-29T00:00:00']) assert.throws(() => buildDailyRequest(controlEndpoint,state,{}, {locRef:'L',busDt:value}));
  for (const value of [null,'7',1.5,true]) assert.throws(() => buildDailyRequest(controlEndpoint,state,{}, {locRef:'L',busDt:date,rvcNum:value}), /integer/);
  const precise=parseJson('{"locRef":"L","busDt":"2024-02-29","rvcNum":9007199254740993,"extension":1.234567890123456789}');
  assert.equal(JSON.stringify(buildDailyRequest(controlEndpoint,state,{},precise).body),JSON.stringify(precise));
});
for (const [flag, field] of [['--business-date','busDt'],['--open-business-date','opnBusDt'],['--closed-business-date','clsdBusDt']]) test(`control ${field}: explicit POST and native RVC, filters/projections preserved, no response interpretation`, async t => {
  const s=await setup(t,async(req,res)=>{
    assert.equal(req.url,'/bi/v1/test-enterprise/getControlDailyTotals');assert.equal(req.method,'POST');
    assert.equal(req.headers.authorization,'Bearer synthetic-id');assert.equal(req.headers.accept,'application/json');
    const chunks=[];for await(const c of req)chunks.push(c);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()),{locRef:'L', [field]:date, searchCriteria:'where equals(revenueCenters.rvcNum,7)',include:'locRef,eodStatus,revenueCenters.rvcNum',applicationName:'Synthetic',rvcNum:7});res.end(raw);
  });
  const args=[...base,'--loc-ref','L',flag,date,'--rvc-num','7','--search-criteria','where equals(revenueCenters.rvcNum,7)','--include','locRef,eodStatus,revenueCenters.rvcNum','--application-name','Synthetic'];
  const preview=await s.run([...args,'--dry-run']);assert.equal(preview.code,0,preview.stderr);assert.equal(s.calls.length,0);
  assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted,true);
  await s.store.mutate(async current=>{current.tokens=tokens();});
  const r=await s.run(args);assert.equal(r.code,0,r.stderr);assert.equal(r.stdout,raw);assert.equal(s.calls.length,1);
});
test('control invalid selectors fail before due renewal and valid JSON file keeps exact integers', async t=>{
  const s=await setup(t);await s.store.mutate(async current=>{current.tokens=tokens();});
  await s.store.mutateCompanies(async r=>{r.companies[r.activeCompany].refreshAfter='2000-01-01T00:00:00.000Z';});
  const before=await readFile(s.store.file,'utf8');
  for(const extra of [[],['--business-date',date,'--open-business-date',date],['--business-date',date,'--rvc-num','1.2'],['--business-date',date,'--closed-only','true'],['--business-date',date,'--json','{"clsdBusDt":"2024-02-29"}']]){
    const r=await s.run([...base,'--loc-ref','L',...extra]);assert.equal(r.code,6,r.stderr);assert.equal(r.stdout,'');
  }
  const file=path.join(s.directory,'control.json');await writeFile(file,'{"locRef":"L","opnBusDt":"2024-02-29","rvcNum":9007199254740993}');
  const r=await s.run([...base,'--file',file,'--dry-run']);assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/9007199254740993/);
  assert.equal(s.calls.length,0);assert.equal(await readFile(s.store.file,'utf8'),before);
});
test('control projection rejection never rewrites documented field names or retries', async t => {
  const errorBody = '{ "o:errorCode": "33205", "detail": "Synthetic projection rejection", "status": 400 }\r\n';
  const s = await setup(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    assert.equal(JSON.parse(Buffer.concat(chunks).toString()).include, 'lastUpdatedUTC');
    res.writeHead(400); res.end(errorBody);
  });
  await s.store.mutate(async current => { current.tokens = tokens(); });
  const result = await s.run([...base, '--loc-ref', 'L', '--business-date', date, '--include', 'lastUpdatedUTC']);
  assert.equal(result.code, 11); assert.equal(result.stdout, errorBody); assert.equal(s.calls.length, 1);
});
for(const status of [200,400,401,302])test(`control HTTP ${status}: large body verbatim, no retry/redirect`,async t=>{
  const response='x'.repeat(16385),s=await setup(t,(req,res)=>{req.resume();res.writeHead(status,{Location:'/never-follow'});res.end(response);});
  await s.store.mutate(async current=>{current.tokens=tokens();});
  const r=await s.run([...base,'--loc-ref','L','--business-date',date]);assert.equal(r.code,status===200?0:status===401?9:11,r.stderr);
  const receipt=JSON.parse(r.stdout);assert.equal(receipt.httpStatus,status);assert.equal(await readFile(receipt.path,'utf8'),response);assert.equal(s.calls.length,1);
});
