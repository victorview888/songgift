import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fixture, userId, otherId } from './helpers/customer-fixture.mjs';

let f, keys, jwk, modules;
const sha='a'.repeat(40), audience='https://www.songforalways.com/api/internal/radar/reports';
const body=(id='100')=>({schemaVersion:1,runId:id,runAttempt:1,commitSha:sha,generatedAt:new Date().toISOString(),sources:[{id:'hf',name:'Hugging Face',status:'baseline',count:200,newCount:0,note:'Initial baseline'},{id:'gsc',name:'GSC',status:'off',count:0,newCount:0,note:'Not authorized'}],items:[]});
async function token(overrides={},header={}) {
 const now=Math.floor(Date.now()/1000);
 const claims={iss:'https://token.actions.githubusercontent.com',aud:audience,sub:'repo:victorview888@261133674/songgift@1432492683:ref:refs/heads/master',repository:'victorview888/songgift',repository_id:'1432492683',repository_owner_id:'261133674',ref:'refs/heads/master',ref_type:'branch',workflow_ref:'victorview888/songgift/.github/workflows/radar-free.yml@refs/heads/master',workflow_sha:sha,sha,event_name:'workflow_dispatch',runner_environment:'github-hosted',run_id:'100',run_attempt:'1',iat:now,nbf:now-1,exp:now+300,...overrides};
 const prefix=[{alg:'RS256',typ:'JWT',kid:'isolated-key',...header},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(prefix));
 return prefix+'.'+Buffer.from(sig).toString('base64url');
}
async function post(report,jwt) {
 const request=new Request(audience,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+jwt},body:JSON.stringify(report)});
 return f.load('src/app/api/internal/radar/reports/route.ts').POST(request);
}
before(async()=>{
 keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'isolated-key',alg:'RS256',use:'sig'};
 f=await fixture({oidcJwks:{keys:[jwk]}});
 modules=f.load('src/lib/radar/report.ts');
 await f.db.query('insert into public.admin_members(user_id,active) values ($1,true)',[userId]);
});
after(async()=>{await f?.close();});

test('signed GitHub identity stores an immutable idempotent report; source failures stay visible',async()=>{
 const report=body(),jwt=await token();
 const first=await post(report,jwt);assert.equal(first.status,201);assert.equal((await first.json()).id,'100-1');
 const again=await post(report,jwt);assert.equal(again.status,200);assert.equal((await again.json()).duplicate,true);
 const conflict=await post({...report,items:[{kind:'term',sourceId:'hf',title:'audio model',url:null,detail:''}]},jwt);assert.equal(conflict.status,409);
 const partial={...body('101'),sources:[...body().sources,{id:'sitemap:x',name:'Site',status:'error',count:0,newCount:0,note:'Unavailable'}]};
 assert.equal((await post(partial,await token({run_id:'101'}))).status,201);
 assert.equal((await f.db.query("select status from public.radar_reports where id='101-1'")).rows[0].status,'partial');
});
for (const [name,claims,header] of [
 ['wrong audience',{aud:'https://attacker.invalid'}],['wrong repository id',{repository_id:'999'}],['wrong owner',{repository_owner_id:'999'}],['wrong branch',{ref:'refs/heads/preview'}],['wrong workflow',{workflow_ref:'victorview888/songgift/.github/workflows/other.yml@refs/heads/master'}],['pull request',{event_name:'pull_request'}],['self hosted',{runner_environment:'self-hosted'}],['unbound workflow commit',{workflow_sha:'b'.repeat(40)}],['expired',{exp:1}],['future token',{iat:Math.floor(Date.now()/1000)+600}],['unknown key',{}, {kid:'unknown-key'}],['algorithm confusion',{}, {alg:'HS256'}],['issuer',{iss:'https://attacker.invalid'}],['untrusted subject',{sub:'repo:other/songgift:ref:refs/heads/master'}]
])test('rejects '+name+' before database writes',async()=>{
 const count=f.calls.length;assert.equal((await post(body(),await token(claims,header))).status,401);
 assert.ok(f.calls.slice(count).every(c=>!c.url.includes('supabase')));
});
test('rejects forged signature and missing token',async()=>{
 const jwt=await token();const parts=jwt.split('.');parts[2]=Buffer.alloc(256,0).toString('base64url');
 assert.equal((await post(body(),parts.join('.'))).status,401);
 assert.equal((await post(body(),'')).status,401);
});
test('binds body to signed run metadata and enforces freshness',async()=>{
 assert.equal((await post(body('999'),await token())).status,403);
 assert.equal((await post({...body(),generatedAt:'2026-01-01T00:00:00Z'},await token())).status,400);
});
test('normalizes only typed fields and rejects unsafe links, duplicate sources and oversized item arrays',()=>{
 const report=body();assert.equal(modules.validateRadarReport({...report,privateToken:'discard me'}).privateToken,undefined);
 for(const bad of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>modules.validateRadarReport({...report,items:[{kind:'term',sourceId:'hf',title:'song',detail:'',url:bad}]}));
 assert.throws(()=>modules.validateRadarReport({...report,sources:[...report.sources,report.sources[0]]}));
 assert.throws(()=>modules.validateRadarReport({...report,items:Array(61).fill({})}));
});
test('bounds body size without relying on Content-Length; rejects malformed JSON and media types',async()=>{
 await assert.rejects(modules.readRadarBody(new Request(audience,{method:'POST',headers:{'Content-Type':'application/json'},body:' '.repeat(128*1024+1)})),e=>e.status===413);
 await assert.rejects(modules.readRadarBody(new Request(audience,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})),e=>e.status===400);
 await assert.rejects(modules.readRadarBody(new Request(audience,{method:'POST',body:'{}'})),e=>e.status===415);
});
test('admin APIs deny guests and customers before reading report data; revoked Owner loses access',async()=>{
 const file='src/app/api/admin/radar/reports/route.ts';
 for(const id of [null,otherId]){const start=f.calls.length;assert.equal((await f.request(file,'GET',null,id,{},'/api/admin/radar/reports')).status,id?403:401);assert.ok(f.calls.slice(start).every(c=>!c.url.includes('/radar_reports')));}
 const response=await f.request(file,'GET',null,userId,{},'/api/admin/radar/reports');assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,2);assert.equal(data.reports[0].report,undefined);
 assert.equal((await f.request('src/app/api/admin/radar/reports/[id]/route.ts','GET',null,userId,{id:'100-1'},'/api/admin/radar/reports/100-1')).status,200);
 assert.equal((await f.request(file,'GET',null,userId,{},'/api/admin/radar/reports?page=1&page=2')).status,400);
 await f.db.query('update public.admin_members set active=false where user_id=$1',[userId]);
 assert.equal((await f.request(file,'GET',null,userId,{},'/api/admin/radar/reports')).status,403);
});
test('database grants and RLS isolate radar reports from anonymous and authenticated roles',async()=>{
 await f.db.exec('reset role;set role anon');
 await assert.rejects(f.db.query('select * from public.radar_reports'),/permission denied/);
 await assert.rejects(f.db.query("select public.store_songgift_radar_report('{}'::jsonb,repeat('a',64))"),/permission denied/);
 await f.db.exec('reset role;set role authenticated');
 await assert.rejects(f.db.query('select * from public.radar_reports'),/permission denied/);
 await f.db.exec('reset role;set role service_role');
});
test('retention deletes only reports older than 30 days and keeps at most 60',async()=>{
 await f.db.exec("reset role;update public.radar_reports set created_at=now()-interval '31 days' where id='100-1';set role service_role");
 for(let i=200;i<263;i++)await f.load('src/lib/radar/store.ts').saveRadarReport(body(String(i)));
 const rows=(await f.db.query('select id from public.radar_reports')).rows;assert.equal(rows.length,60);assert.ok(!rows.some(r=>r.id==='100-1'));
 assert.equal((await f.db.query('select count(*)::int n from public.admin_members')).rows[0].n,1);
 assert.equal((await f.db.query('select count(*)::int n from public.song_orders')).rows[0].n,0);
 const page=await f.load('src/lib/radar/store.ts').listRadarReports(2);assert.equal(page.reports.length,10);assert.equal(page.totalPages,6);
});
