import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildCashRequest, executeCash } from '../dist/cash-management.js';
import { cashManagementEndpoint } from '../dist/areas/cash-management.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state = { schemaVersion: 1, auth: { orgName: 'synthetic', apiUrl: 'https://reports.example.invalid' } };
const body = { locRef: 'L-1', busDt: '2024-02-29' };
const base = ['cash-management', 'details', 'list'];
const args = [...base, '--loc-ref', body.locRef, '--business-date', body.busDt];
const raw = '{ "locRef":"L-1", "busDt":"2024-02-29", "revenueCenters":[{"rvcNum":7,"cmDetails":[{"cmItemNum":9007199254740993,"transAmt":1.234567890123456789,"transType":99,"receptacleType":99,"notes":"Synthetic note","actBusDate":"2024-02-28","sessionNum":3,"targetSessionNum":4}]}] }\r\n';
test('cash management matches public five-field request schema; strict scope/date with unknown numeric fields preserved', async () => {
  const f = JSON.parse(await readFile('tests/fixtures/cash-management-contract.json', 'utf8'));
  assert.equal(f.version, '2025.09.22'); assert.equal(f.path, '/bi/v1/{orgIdentifier}/' + cashManagementEndpoint.operation); assert.equal(f.method, 'POST');
  assert.deepEqual(f.request.required, ['locRef', 'busDt']); assert.deepEqual(Object.keys(f.request.properties), ['locRef', 'busDt', 'searchCriteria', 'include', 'applicationName']);
  assert.equal(f.request.properties.busDt.format, 'date');
  for (const [field,max] of [['locRef',99],['searchCriteria',2000],['include',2000],['applicationName',128]]) {
    assert.equal(f.request.properties[field].maxLength,max);
    assert.doesNotThrow(() => buildCashRequest(state,{}, {...body,[field]:'x'.repeat(max)}));
    for (const bad of [null,1,'',' ','x\n','x'.repeat(max+1)]) assert.throws(() => buildCashRequest(state,{}, {...body,[field]:bad}));
  }
  for (const bad of [{},{locRef:'L'},{busDt:body.busDt},{...body,busDt:'2023-02-29'},{...body,busDt:'2024-02-30'},{...body,busDt:null},{...body,busDt:'2024-02-29T00:00:00'}]) assert.throws(() => buildCashRequest(state,{},bad), e=>e.exitCode===6);
  for (const field of ['opnBusDt','clsdBusDt','rvcNum','clsdGuestChecksOnly','changedSinceUTC','transSinceUTC']) assert.throws(() => buildCashRequest(state,{}, {...body,[field]:null}), /not supported/);
  assert.throws(() => buildCashRequest(state,{allLocations:true},body), /explicit location/);
  const input=parseJson('{"locRef":"L-1","busDt":"2024-02-29","extension":9007199254740993,"amount":1.234567890123456789}');
  assert.equal(JSON.stringify(buildCashRequest(state,{},input).body),JSON.stringify(input));
  assert.deepEqual(buildCashRequest(state,{locRef:'L-2',businessDate:'2024-03-01',include:'new'},{...body,include:'old'}).body,{locRef:'L-2',busDt:'2024-03-01',include:'new'});
});
test('cash read is one authorized POST, tokenless dry-run, verbatim response including unknown codes/actual dates', async t=>{
  const s=await setup(t,async(req,res)=>{
    assert.equal(req.url,'/bi/v1/test-enterprise/getCashManagementDetails');assert.equal(req.method,'POST');
    assert.equal(req.headers.authorization,'Bearer synthetic-id');assert.equal(req.headers.accept,'application/json');assert.equal(req.headers['content-type'],'application/json');
    const chunks=[];for await(const c of req)chunks.push(c);assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()),body);res.end(raw);
  });
  const preview=await s.run([...args,'--dry-run']);assert.equal(preview.code,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted,true);
  const help=await s.run([...base,'--help']);assert.equal(help.code,0);assert.match(help.stdout,/16 KiB AND 500 lines/);assert.match(help.stdout,/actBusDate is returned data/);assert.equal(s.calls.length,0);
  await s.store.mutate(async current=>{current.tokens=tokens();});const before=await readFile(s.store.file,'utf8');
  const result=await s.run(args);assert.equal(result.code,0,result.stderr);assert.equal(result.stdout,raw);assert.equal(s.calls.length,1);assert.equal(await readFile(s.store.file,'utf8'),before);
});
test('cash invalid input rejects before due renewal, with no business writes or implicit filters', async t=>{
  const s=await setup(t);await s.store.mutate(async current=>{current.tokens=tokens();});
  await s.store.mutateCompanies(async r=>{r.companies[r.activeCompany].refreshAfter='2000-01-01T00:00:00.000Z';});
  const before=await readFile(s.store.file,'utf8');
  for(const extra of [['--rvc-num','7'],['--receptacle-num','7'],['--employee','7'],['--trans-type','8'],['--all-locations'],['--open-business-date',body.busDt],['--changed-since-utc','2024-02-29T00:00:00'],['--json','{bad'],['--json','[]'],['--json','{"rvcNum":7}'],['--file','missing','--json','{}'],['--timeout','0'],['--timeout','301']]){
    const r=await s.run([...args,...extra]);assert.equal(r.code,6,r.stderr);assert.equal(r.stdout,'');
  }
  assert.equal((await s.run(base)).code,6);
  for(const verb of ['add','delete','transfer','deposit'])assert.equal((await s.run(['cash-management','details',verb])).code,6);
  assert.equal((await s.run(['cash-management'])).code,0);assert.equal((await s.run(['cash-management','details'])).code,0);
  assert.equal(s.calls.length,0);assert.equal(await readFile(s.store.file,'utf8'),before);
});
test('cash filters/projections and JSON/file/stdin survive one input read across token renewal', async t=>{
  const input='{"locRef":"L-1","busDt":"2024-02-29","searchCriteria":"where equals(revenueCenters.cmDetails.transType,8)","include":"locRef,busDt,revenueCenters.cmDetails.cmItemNum","applicationName":"Synthetic","extension":9007199254740993}';
  let refreshes=0,queries=0;
  const s=await setup(t,async(req,res)=>{
    if(req.url.endsWith('/token')){assert.equal((await form(req)).get('grant_type'),'refresh_token');refreshes++;res.end(JSON.stringify({id_token:'renewed',refresh_token:'rotated',expires_in:1209600}));return;}
    assert.equal(req.headers.authorization,'Bearer renewed');const chunks=[];for await(const c of req)chunks.push(c);
    assert.equal(Buffer.concat(chunks).toString(),input);queries++;res.end(raw);
  });
  await s.store.mutate(async current=>{current.tokens=tokens();});await s.store.mutateCompanies(async r=>{r.companies[r.activeCompany].refreshAfter='2000-01-01T00:00:00.000Z';});
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['tests/cli-runner.mjs',s.directory,...base,'--file','-']);let stdout='',stderr='';
    child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input);
  });
  assert.equal(result.code,0,result.stderr);assert.equal(result.stdout,raw);
  const file=path.join(s.directory,'cash.json');await writeFile(file,input);
  for(const source of [['--file',file],['--json',input]])assert.equal((await s.run([...base,...source])).stdout,raw);
  assert.equal(refreshes,1);assert.equal(queries,3);assert.equal((await s.store.load()).tokens.refreshToken,'rotated');
});
for(const status of [200,400,401,403,503,302])test(`cash HTTP ${status}: complete exported body and correct exit, never retry/redirect`,async t=>{
  const response='x'.repeat(16385),s=await setup(t,(req,res)=>{req.resume();res.writeHead(status,{Location:'/never-follow'});res.end(response);});
  await s.store.mutate(async current=>{current.tokens=tokens();});const r=await s.run(args);
  assert.equal(r.code,status===200?0:status===401?9:11,r.stderr);const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.httpStatus,status);assert.equal(await readFile(receipt.path,'utf8'),response);assert.equal(s.calls.length,1);
});
test('cash calls keep company identity pinned and notify only after non-quiet successful delivery',async t=>{
  const s=await setup(t,(req,res)=>{req.resume();assert.match(req.url,/test-enterprise/);assert.equal(req.headers.authorization,'Bearer synthetic-id');res.end(raw);});
  await s.store.mutate(async current=>{current.tokens=tokens();});const original=(await s.store.loadCompanies()).activeCompany,other='OTHER@127.0.0.1';
  await s.store.mutateCompanies(async r=>{r.companies[other]={...r.companies[original],auth:{...r.companies[original].auth,orgName:'OTHER'},tokens:{...tokens(),idToken:'other-id'},refreshAfter:new Date(Date.now()+DAY).toISOString()};});
  class Switching extends StateStore {count=0;async loadCompanies(){if(++this.count===2)await s.store.mutateCompanies(async r=>{r.activeCompany=other;});return super.loadCompanies();}}
  let out='',notices=0;t.mock.method(process.stdout,'write',(chunk,cb)=>{out+=chunk;if(typeof cb==='function')cb();return true;});
  const options={locRef:body.locRef,businessDate:body.busDt},notify=async()=>{assert.equal(out,raw);notices++;};
  assert.equal(await executeCash(new Switching(s.directory),options,s.directory,notify),0);assert.equal(out,raw);assert.equal(notices,1);
  assert.equal((await s.store.loadCompanies()).activeCompany,other);await s.store.mutateCompanies(async r=>{r.activeCompany=original;});out='';
  assert.equal(await executeCash(s.store,{...options,quiet:true},s.directory,notify),0);assert.equal(out,raw);assert.equal(notices,1);
});
