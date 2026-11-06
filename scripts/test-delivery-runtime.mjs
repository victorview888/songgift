import assert from 'node:assert/strict';

// Exercise actual application routes + the separately scheduled local Worker.
// Only loopback addresses and in-memory fixtures are accepted. No .env reads.
const origin='http://127.0.0.1:54330';
const base=process.env.SONGGIFT_DELIVERY_TEST_URL||'http://localhost:3002';
const scheduler=process.env.SONGGIFT_SCHEDULER_TEST_URL||'http://127.0.0.1:8789';
for(const target of [base,scheduler])assert.ok(['localhost','127.0.0.1'].includes(new URL(target).hostname),'Only loopback targets are permitted');
const jar=new Map();let count=0;const ok=label=>{count++;console.log('PASS '+label);};
async function fixture(path,body){return (await fetch(origin+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})).json();}
async function request(path,method='GET',body,login=true){
 const response=await fetch(base+path,{method,headers:{...(login?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{}),...(method!=='GET'?{Origin:base,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});
 for(const cookie of response.headers.getSetCookie()){const [key,value]=cookie.split(';')[0].split('=');jar.set(key,value);}return response;
}
async function login(email){jar.clear();const r=await request('/api/auth/verify','POST',{email,code:'123456'});assert.equal(r.status,200,await r.clone().text());}
const endpoint=id=>'/api/admin/orders/'+id+'/operations';
const action=(jobId,kind='generation.sync',requestId=crypto.randomUUID())=>({action:kind,jobId,requestId,reasonCode:kind==='generation.resume_storage'?'recover_delivery':'manual_check'});
const health=await fixture('/__fixture__/health');assert.equal(health.fixture,'songgift-customer-loopback');
const seeded=await fixture('/__fixture__/seed',{admin:true});
assert.equal((await request(endpoint(seeded.paid),'POST',action(seeded.paid),false)).status,401);ok('Signed-out operation denied');
await login('other@isolated.example');assert.equal((await request(endpoint(seeded.paid),'POST',action(seeded.paid))).status,403);ok('Ordinary customer operation denied');
await login('owner@isolated.example');
const starting=await request('/api/music','POST',{orderId:seeded.paid});assert.equal(starting.status,200,await starting.clone().text());const job=await starting.json();
const input=action(job.generationJobId);const sync=await request(endpoint(seeded.paid),'POST',input);assert.equal(sync.status,200,await sync.clone().text());assert.equal((await sync.json()).result,'succeeded');ok('Owner synchronizes the original task');
const before=await fixture('/__fixture__/inspect?orderId='+seeded.paid);const replay=await request(endpoint(seeded.paid),'POST',input);assert.equal((await replay.json()).replayed,true);const after=await fixture('/__fixture__/inspect?orderId='+seeded.paid);assert.equal(after.queries,before.queries);assert.equal(after.audit.length,1);ok('Audit replay performs no repeated provider query');
const recovery=await fixture('/__fixture__/seed',{});const pending=await (await request('/api/music','POST',{orderId:recovery.paid})).json();
await fixture('/__fixture__/fault',{upload:true});const failed=await request(endpoint(recovery.paid),'POST',action(pending.generationJobId));assert.equal(failed.status,503);await fixture('/__fixture__/fault',{});
const recovered=await request(endpoint(recovery.paid),'POST',action(pending.generationJobId,'generation.resume_storage'));assert.equal(recovered.status,200,await recovered.clone().text());const saved=await fixture('/__fixture__/inspect?orderId='+recovery.paid);assert.equal(saved.order.status,'completed');assert.equal(saved.audit.length,2);ok('Owner recovers the stored result after an upload failure');
const auto=await fixture('/__fixture__/seed',{});const autoJob=await (await request('/api/music','POST',{orderId:auto.paid})).json();await fixture('/__fixture__/due',{jobId:autoJob.generationJobId});const initial=await fixture('/__fixture__/health');
assert.equal((await fetch(scheduler)).status,404);ok('Scheduled Worker exposes no public action endpoint');
const triggered=await fetch(scheduler+'/__scheduled?cron='+encodeURIComponent('* * * * *'));assert.ok(triggered.ok,await triggered.text());
let done;for(let i=0;i<40;i++){done=await fixture('/__fixture__/inspect?orderId='+auto.paid);if(done.order.status==='completed'&&done.notices.length)break;await new Promise(resolve=>setTimeout(resolve,200));}
assert.equal(done.order.status,'completed');assert.equal(done.submissions,initial.submissions);assert.equal(done.notices.length,1);assert.equal(done.notices[0].status,'pending');assert.equal(done.notices[0].attempts,0);ok('Real scheduled handler completes and queues a notice with no browser polling or new generation');
const detail=await request('/admin/orders/'+auto.paid);assert.equal(detail.status,200);const html=await detail.text();assert.match(html,/歌曲完成通知/);assert.match(html,/等待发送/);ok('Admin detail shows the queued notification');
console.log(count+' delivery runtime checks passed');
