import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fiscalEndpoints } from '../dist/areas/fiscal-transactions.js';
import { buildFiscalRequest, executeFiscal } from '../dist/fiscal-transactions.js';
import { StateStore, DAY } from '../dist/state.js';
import { parseJson } from '../dist/json.js';
import { setup, tokens, form } from './helpers.mjs';
const state={schemaVersion:1,auth:{orgName:'synthetic',apiUrl:'https://reports.example.invalid'}};
const body={locRef:'L-1',busDt:'2024-02-29'};
const base=e=>['fiscal-transactions',e.noun,'list'];
const args=e=>[...base(e),'--loc-ref',body.locRef,'--business-date',body.busDt];
const raw=['{ "invoiceData":[{"guestCheckId":9007199254740993,"taxTotal1":1.234567890123456789,"invoiceType":999,"fcrBusinessDate":"2024-02-28","json":{"unknown":[1,2]}}] }\r\n','{ "totalData":[{"fcrBusDt":"2024-02-28","json":"[not reinterpreted]","fcrInfo1":"Synthetic"}] }\r\n','{ "invoiceControlData":[{"currInvNum":9007199254740993,"lockedBy":999,"resolutionDt":"2024-02-28","json":null}] }\r\n'];
test('three fiscal endpoints match all public request properties and strict shared date/scope rules',async()=>{
  const fixture=JSON.parse(await readFile('tests/fixtures/fiscal-contract.json','utf8'));assert.equal(fixture.version,'2025.09.22');assert.equal(fixture.endpoints.length,3);assert.equal(fiscalEndpoints.length,3);
  for(const e of fiscalEndpoints){
    const f=fixture.endpoints.find(x=>x.path.endsWith('/'+e.operation));assert.ok(f);assert.equal(f.method,'POST');assert.deepEqual(f.required,['locRef','busDt']);
    assert.deepEqual(Object.keys(f.properties),['locRef','busDt','searchCriteria','include','applicationName']);assert.equal(f.properties.busDt.format,'date');
    for(const [field,max]of[['locRef',99],['searchCriteria',2000],['include',2000],['applicationName',128]]){
      assert.equal(f.properties[field].maxLength,max);assert.doesNotThrow(()=>buildFiscalRequest(e,state,{}, {...body,[field]:'x'.repeat(max)}));
      for(const bad of [null,1,'',' ','x\n','x'.repeat(max+1)])assert.throws(()=>buildFiscalRequest(e,state,{}, {...body,[field]:bad}));
    }
    for(const bad of [{},{locRef:'L'},{busDt:body.busDt},{...body,busDt:'2023-02-29'},{...body,busDt:'2024-02-30'},{...body,busDt:null}])assert.throws(()=>buildFiscalRequest(e,state,{},bad),x=>x.exitCode===6);
    for(const field of ['opnBusDt','clsdBusDt','rvcNum','clsdGuestChecksOnly','changedSinceUTC','transSinceUTC'])assert.throws(()=>buildFiscalRequest(e,state,{}, {...body,[field]:null}),/not supported/);
    assert.throws(()=>buildFiscalRequest(e,state,{allLocations:true},body),/explicit location/);
    const precise=parseJson('{"locRef":"L-1","busDt":"2024-02-29","extension":9007199254740993,"amount":1.234567890123456789}');
    assert.equal(JSON.stringify(buildFiscalRequest(e,state,{},precise).body),JSON.stringify(precise));
    assert.deepEqual(buildFiscalRequest(e,state,{locRef:'NEW',businessDate:'2024-03-01',include:'new'},{...body,include:'old'}).body,{locRef:'NEW',busDt:'2024-03-01',include:'new'});
  }
});
for(const [index,e]of fiscalEndpoints.entries())test(`${e.operation}: exact ID-authorized POST, all request flags and unmodified fiscal blobs/codes/dates`,async t=>{
  let count=0;
  const optional={searchCriteria:'where equals(revenueCenters.rvcNum,7)',include:'locRef,busDt,revenueCenters.rvcNum',applicationName:'Synthetic'};
  const s=await setup(t,async(req,res)=>{
    assert.equal(req.url,'/bi/v1/test-enterprise/'+e.operation);assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer synthetic-id');assert.equal(req.headers.accept,'application/json');
    const chunks=[];for await(const c of req)chunks.push(c);assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()),count++?{...body,...optional}:body);res.end(raw[index]);
  });
  const preview=await s.run([...args(e),'--dry-run']);assert.equal(preview.code,0,preview.stderr);assert.equal(JSON.parse(preview.stdout).data.authorizationOmitted,true);
  const help=await s.run([...base(e),'--help']);assert.equal(help.code,0);assert.match(help.stdout,/No native RVC/);assert.match(help.stdout,/16 KiB AND 500 lines/);assert.match(help.stdout,/Never decode an embedded JSON string/);assert.equal(s.calls.length,0);
  await s.store.mutate(async current=>{current.tokens=tokens();});const before=await readFile(s.store.file,'utf8');
  for(const extra of [[],['--search-criteria',optional.searchCriteria,'--include',optional.include,'--application-name',optional.applicationName]]){
    const r=await s.run([...args(e),...extra]);assert.equal(r.code,0,r.stderr);assert.equal(r.stdout,raw[index]);
  }
  assert.equal(s.calls.length,2);assert.equal(await readFile(s.store.file,'utf8'),before);
});
test('invalid fiscal requests fail before due renewal; no write verbs or fiscal-date defaults',async t=>{
  const s=await setup(t);await s.store.mutate(async c=>{c.tokens=tokens();});await s.store.mutateCompanies(async r=>{r.companies[r.activeCompany].refreshAfter='2000-01-01T00:00:00.000Z';});const before=await readFile(s.store.file,'utf8');
  for(const e of fiscalEndpoints){
    for(const extra of [['--rvc-num','7'],['--invoice-number','1'],['--fiscal-date',body.busDt],['--all-locations'],['--open-business-date',body.busDt],['--json','[]'],['--json','{bad'],['--json','{"changedSinceUTC":"2024-02-29T00:00:00"}'],['--file','missing','--json','{}'],['--timeout','0'],['--timeout','301']]){const r=await s.run([...args(e),...extra]);assert.equal(r.code,6,r.stderr);assert.equal(r.stdout,'');}
    assert.equal((await s.run(base(e))).code,6);for(const verb of ['issue','cancel','lock','delete'])assert.equal((await s.run(['fiscal-transactions',e.noun,verb])).code,6);
  }
  assert.equal(s.calls.length,0);assert.equal(await readFile(s.store.file,'utf8'),before);
});
test('fiscal input read once across renewal, exact file/stdin/JSON content and rotated token persistence',async t=>{
  const e=fiscalEndpoints[0],input='{"locRef":"L-1","busDt":"2024-02-29","extension":9007199254740993}';let refreshes=0,queries=0;
  const s=await setup(t,async(req,res)=>{
    if(req.url.endsWith('/token')){assert.equal((await form(req)).get('grant_type'),'refresh_token');refreshes++;res.end(JSON.stringify({id_token:'renewed',refresh_token:'rotated',expires_in:1209600}));return;}
    assert.equal(req.headers.authorization,'Bearer renewed');const chunks=[];for await(const c of req)chunks.push(c);assert.equal(Buffer.concat(chunks).toString(),input);queries++;res.end(raw[0]);
  });
  await s.store.mutate(async c=>{c.tokens=tokens();});await s.store.mutateCompanies(async r=>{r.companies[r.activeCompany].refreshAfter='2000-01-01T00:00:00.000Z';});
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/cli-runner.mjs',s.directory,...base(e),'--file','-']);let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input);});
  assert.equal(result.code,0,result.stderr);assert.equal(result.stdout,raw[0]);const file=path.join(s.directory,'fiscal.json');await writeFile(file,input);
  for(const source of [['--file',file],['--json',input]])assert.equal((await s.run([...base(e),...source])).stdout,raw[0]);
  assert.equal(refreshes,1);assert.equal(queries,3);assert.equal((await s.store.load()).tokens.refreshToken,'rotated');
});
for(const e of fiscalEndpoints)for(const status of [200,400,401,302])test(`${e.noun} HTTP ${status}: complete export and preserved exit, no retry/redirect`,async t=>{
  const response='x'.repeat(16385),s=await setup(t,(req,res)=>{req.resume();res.writeHead(status,{Location:'/never-follow'});res.end(response);});await s.store.mutate(async c=>{c.tokens=tokens();});
  const r=await s.run(args(e));assert.equal(r.code,status===200?0:status===401?9:11,r.stderr);const receipt=JSON.parse(r.stdout);assert.equal(receipt.httpStatus,status);assert.equal(await readFile(receipt.path,'utf8'),response);assert.equal(s.calls.length,1);
});
test('fiscal identity pinned across selection changes and quiet/notifier lifecycle retained',async t=>{
  const s=await setup(t,(req,res)=>{req.resume();assert.match(req.url,/test-enterprise/);assert.equal(req.headers.authorization,'Bearer synthetic-id');res.end(raw[0]);});await s.store.mutate(async c=>{c.tokens=tokens();});
  const original=(await s.store.loadCompanies()).activeCompany,other='OTHER@127.0.0.1';await s.store.mutateCompanies(async r=>{r.companies[other]={...r.companies[original],auth:{...r.companies[original].auth,orgName:'OTHER'},tokens:{...tokens(),idToken:'other-id'},refreshAfter:new Date(Date.now()+DAY).toISOString()};});
  class Switching extends StateStore{count=0;async loadCompanies(){if(++this.count===2)await s.store.mutateCompanies(async r=>{r.activeCompany=other;});return super.loadCompanies();}}
  let out='',notices=0;t.mock.method(process.stdout,'write',(chunk,cb)=>{out+=chunk;if(typeof cb==='function')cb();return true;});const options={locRef:body.locRef,businessDate:body.busDt},notify=async()=>{assert.equal(out,raw[0]);notices++;};
  assert.equal(await executeFiscal(fiscalEndpoints[0],new Switching(s.directory),options,s.directory,notify),0);assert.equal(notices,1);assert.equal(out,raw[0]);assert.equal((await s.store.loadCompanies()).activeCompany,other);
  await s.store.mutateCompanies(async r=>{r.activeCompany=original;});out='';assert.equal(await executeFiscal(fiscalEndpoints[0],s.store,{...options,quiet:true},s.directory,notify),0);assert.equal(out,raw[0]);assert.equal(notices,1);
});
