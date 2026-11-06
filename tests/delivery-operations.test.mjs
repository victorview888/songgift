import assert from 'node:assert/strict';
import test,{before,after,beforeEach} from 'node:test';
import {readFileSync} from 'node:fs';
import {fixture,userId,otherId} from './helpers/customer-fixture.mjs';
let f;
before(async()=>{f=await fixture();await f.db.query('insert into public.admin_members(user_id) values($1)',[userId]);});
after(()=>f?.close());
beforeEach(async()=>{
 f.setFail({});f.setMode('queued');f.env.RESEND_API_KEY='isolated-resend-key';f.env.SONGGIFT_FROM_EMAIL='songs@isolated.example';f.env.SONGGIFT_SITE_URL='https://songgift.isolated.example';
 await f.db.query('update public.admin_members set active=true where user_id=$1',[userId]);
 await f.db.exec('update public.songgift_maintenance set lease_token=null,lease_expires_at=null');
});
const music='src/app/api/music/route.ts',status='src/app/api/music/status/[jobId]/route.ts',operations='src/app/api/admin/orders/[id]/operations/route.ts';
async function start(id){const r=await f.request(music,'POST',{orderId:id});assert.equal(r.status,200,await r.clone().text());return r.json();}
async function complete(id,job){const r=await f.request(status,'GET',null,userId,{jobId:job.generationJobId},'?orderId='+id);assert.equal(r.status,200,await r.clone().text());return r.json();}
async function act(order,action,jobId,requestId=crypto.randomUUID(),user=userId){return f.request(operations,'POST',{action,requestId,...(jobId?{jobId}:{}),reasonCode:action==='generation.resume_storage'?'recover_delivery':'manual_check'},user,{id:order});}
async function query(sql,values=[]){return (await f.db.query(sql,values)).rows;}
async function due(job){await f.db.query("update public.generation_jobs set next_check_at=now()-interval '1 second' where id=$1",[job.generationJobId]);}
const maintenance=()=>f.load('src/lib/services/maintenance.ts').runMaintenance();
const sendMail=()=>f.load('src/lib/services/notifications.ts').sendDueNotifications(Date.now()+90000);

test('admin reconciliation reads completed PayPal evidence without capture, and audit replay does not repeat external calls',async()=>{
 const id=await f.order();const checkout=await f.request('src/app/api/paypal/create-order/route.ts','POST',{orderId:id});const data=await checkout.json();
 const payment=f.paypal.get(data.id);payment.status='COMPLETED';payment.purchase_units[0].payments={captures:[{id:'CAP-RECONCILE-'+id,status:'COMPLETED',final_capture:true,create_time:'2026-11-06T00:00:00Z',amount:payment.purchase_units[0].amount}]};
 const requestId=crypto.randomUUID(),before=f.calls.length;const r=await act(id,'payment.reconcile',null,requestId);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).result,'succeeded');
 const provider=f.calls.slice(before).filter(c=>c.url?.includes('paypal.com'));assert.ok(provider.length>=2);assert.equal(provider.filter(c=>c.url.endsWith('/capture')).length,0);
 const audits=await query('select * from public.admin_audit_logs where request_id=$1',[requestId]);assert.equal(audits[0].result,'succeeded');
 const calls=f.calls.filter(c=>c.url?.includes('paypal.com')).length;const replay=await act(id,'payment.reconcile',null,requestId);assert.equal((await replay.json()).replayed,true);assert.equal(f.calls.filter(c=>c.url?.includes('paypal.com')).length,calls);
 assert.equal((await query('select count(*)::int n from public.payment_transactions where order_id=$1',[id]))[0].n,1);
});

test('unapproved and historical payments remain unverified; ordinary/revoked owners cannot execute actions',async()=>{
 const id=await f.order();await f.request('src/app/api/paypal/create-order/route.ts','POST',{orderId:id});const requestId=crypto.randomUUID();const r=await act(id,'payment.reconcile',null,requestId);assert.equal(r.status,409);
 assert.equal((await query('select result from public.admin_audit_logs where request_id=$1',[requestId]))[0].result,'needs_review');
 assert.equal(f.calls.filter(c=>c.url?.endsWith('/capture')).length,0);
 const legacy=await f.order({legacy:true});const before=f.calls.filter(c=>c.url?.includes('paypal.com')).length;assert.equal((await act(legacy,'payment.reconcile')).status,409);assert.equal(f.calls.filter(c=>c.url?.includes('paypal.com')).length,before);
 assert.equal((await act(id,'payment.reconcile',null,crypto.randomUUID(),otherId)).status,403);
 await f.db.query('update public.admin_members set active=false where user_id=$1',[userId]);assert.equal((await act(id,'payment.reconcile')).status,403);
});

test('admin sync and storage recovery use the original task, with one audit per request and no new generation',async()=>{
 const id=await f.order({paid:true}),job=await start(id),before=f.generateCalls;f.setFail({upload:true});
 const syncId=crypto.randomUUID();const failed=await act(id,'generation.sync',job.generationJobId,syncId);assert.equal(failed.status,503);const acknowledged=await failed.json();assert.equal(acknowledged.result,'failed');assert.equal(acknowledged.requestId,syncId);
 const queries=f.pollCalls;const failedReplay=await act(id,'generation.sync',job.generationJobId,syncId);assert.equal((await failedReplay.json()).replayed,true);assert.equal(f.pollCalls,queries);
 const row=(await query('select state from public.generation_jobs where id=$1',[job.generationJobId]))[0];assert.equal(row.state,'storing');
 f.setFail({});const requestId=crypto.randomUUID();const r=await act(id,'generation.resume_storage',job.generationJobId,requestId);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).result,'succeeded');assert.equal(f.generateCalls,before);
 const replay=await act(id,'generation.resume_storage',job.generationJobId,requestId);assert.equal((await replay.json()).replayed,true);
 assert.equal((await query('select count(*)::int n from public.admin_audit_logs where order_id=$1',[id]))[0].n,2);
});

test('audit failure stops processing; mismatched job targets are rejected before provider access',async()=>{
 const a=await f.order({paid:true}),b=await f.order({paid:true}),job=await start(a),before=f.pollCalls;
 assert.equal((await act(b,'generation.sync',job.generationJobId)).status,503);assert.equal(f.pollCalls,before);
 await f.db.exec('reset role;revoke insert on public.admin_audit_logs from service_role;set role service_role;');
 try{assert.equal((await act(a,'generation.sync',job.generationJobId)).status,503);assert.equal(f.pollCalls,before);}finally{await f.db.exec('reset role;grant insert on public.admin_audit_logs to service_role;set role service_role;');}
});

test('membership revoked after provider read stops the next audio operation and still records the outcome',async()=>{
 const id=await f.order({paid:true}),job=await start(id),requestId=crypto.randomUUID();f.setFail({revokeOnPoll:true});const r=await act(id,'generation.sync',job.generationJobId,requestId);assert.equal(r.status,403,await r.clone().text());
 assert.equal((await query('select result from public.admin_audit_logs where request_id=$1',[requestId]))[0].result,'failed');assert.equal([...f.objects.keys()].filter(key=>key.includes(job.generationJobId)).length,0);
});

test('Cron completes an unattended task and sends one deduplicated stable-link notification',async()=>{
 const id=await f.order({paid:true}),job=await start(id);await due(job);const before=f.generateCalls;const result=await maintenance();assert.equal(result.started,true);assert.ok(result.jobs>=1);assert.equal(f.generateCalls,before);
 assert.equal((await query('select status from public.song_orders where id=$1',[id]))[0].status,'completed');
 const notices=await query('select * from public.song_notification_outbox where order_id=$1',[id]);assert.equal(notices.length,1);assert.equal(notices[0].status,'sent');assert.equal(notices[0].attempts,1);
 const sent=f.sentEmails.get(notices[0].dedupe_key);assert.ok(sent.body.html.includes('https://songgift.isolated.example/song/'+id));assert.doesNotMatch(sent.body.html,/token=|object\/sign|Private story/);
 await maintenance();assert.equal((await query('select count(*)::int n from public.song_notification_outbox where order_id=$1',[id]))[0].n,1);
});

test('overlapping Cron runs are excluded; automatic query errors back off and exhausted jobs pause for review',async()=>{
 const id=await f.order({paid:true}),job=await start(id);await due(job);f.setFail({query:true});const before=f.generateCalls;
 const results=await Promise.all([maintenance(),maintenance()]);assert.equal(results.filter(r=>r.started).length,1);assert.equal(f.generateCalls,before);
 let row=(await query('select * from public.generation_jobs where id=$1',[job.generationJobId]))[0];assert.ok(row.recovery_failures>=1);assert.ok(Date.parse(row.next_check_at)>Date.now());
 await f.db.query("update public.generation_jobs set automatic_checks=90,next_check_at=now()-interval '1 second' where id=$1",[job.generationJobId]);f.setFail({});await maintenance();row=(await query('select * from public.generation_jobs where id=$1',[job.generationJobId]))[0];assert.equal(row.state,'needs_review');assert.ok(row.automatic_paused_at);assert.equal(row.lease_token,null);
});

test('unknown submission and concurrent customer polling never authorize another paid call',async()=>{
 const id=await f.order({paid:true});f.setMode('unknown');assert.equal((await f.request(music,'POST',{orderId:id})).status,502);const before=f.generateCalls;await maintenance();assert.equal(f.generateCalls,before);
 f.setMode('queued');const other=await f.order({paid:true}),job=await start(other);await due(job);const polls=f.pollCalls;
 const results=await Promise.all([maintenance(),complete(other,job)]);assert.ok(results.length);assert.equal(f.pollCalls-polls,1);
});

test('missing mail configuration preserves pending notices without spending retry attempts',async()=>{
 const id=await f.order({paid:true}),job=await start(id);await complete(id,job);delete f.env.RESEND_API_KEY;assert.equal(await sendMail(),0);const n=(await query('select * from public.song_notification_outbox where order_id=$1',[id]))[0];assert.equal(n.status,'pending');assert.equal(n.attempts,0);
});

test('lost email response retries with identical payload/key and does not add a second accepted message',async()=>{
 const id=await f.order({paid:true}),job=await start(id);await complete(id,job);f.setFail({emailTimeout:true});await sendMail();let n=(await query('select * from public.song_notification_outbox where order_id=$1',[id]))[0];assert.equal(n.status,'pending');const accepted=f.sentEmails.get(n.dedupe_key);assert.ok(accepted);
 await f.db.query("update public.song_notification_outbox set next_attempt_at=now()-interval '1 second' where id=$1",[n.id]);f.setFail({});f.env.SONGGIFT_FROM_EMAIL='changed@isolated.example';f.env.SONGGIFT_SITE_URL='https://changed.isolated.example';await sendMail();n=(await query('select * from public.song_notification_outbox where id=$1',[n.id]))[0];assert.equal(n.status,'sent');assert.equal(n.attempts,2);assert.equal(f.sentEmails.get(n.dedupe_key).id,accepted.id);
});

test('permanent rejection, recipient changes and delivery uncertainty stop further sends',async()=>{
 for(const mode of ['rejected','recipient','expired']) {
  f.setFail({});const id=await f.order({paid:true}),job=await start(id);await complete(id,job);const n=(await query('select * from public.song_notification_outbox where order_id=$1',[id]))[0];
  if(mode==='rejected')f.setFail({emailStatus:422});if(mode==='recipient')f.setFail({emailChanged:true});
  if(mode==='expired')await f.db.query("update public.song_notification_outbox set first_attempt_at=now()-interval '21 hours' where id=$1",[n.id]);
  await sendMail();const state=(await query('select * from public.song_notification_outbox where id=$1',[n.id]))[0];assert.equal(state.status,mode==='rejected'?'failed':mode==='recipient'?'skipped':'needs_review');
  if(mode!=='rejected')assert.equal(f.sentEmails.has(n.dedupe_key),false);
 }
});

test('completed notice enqueue failures never undo song delivery and can be swept later',async()=>{
 const id=await f.order({paid:true}),job=await start(id);f.setFail({authUnavailable:true});await complete(id,job);assert.equal((await query('select status from public.song_orders where id=$1',[id]))[0].status,'completed');
 assert.equal((await query('select count(*)::int n from public.song_notification_outbox where order_id=$1',[id]))[0].n,0);f.setFail({});await maintenance();assert.equal((await query('select status from public.song_notification_outbox where order_id=$1',[id]))[0].status,'sent');
});

test('migrations repeat without resetting notice cutoff; new tables/functions remain private to service role',async()=>{
 await f.db.exec('reset role');try {
  const cutoff=(await query('select notification_cutoff from public.songgift_maintenance'))[0].notification_cutoff;await f.db.exec(readFileSync('supabase/migrations/20261106_delivery_operations.sql','utf8'));assert.equal(String((await query('select notification_cutoff from public.songgift_maintenance'))[0].notification_cutoff),String(cutoff));
  for(const role of ['anon','authenticated']) {
   for(const table of ['song_notification_outbox','songgift_maintenance'])assert.equal((await query('select has_table_privilege($1,$2,\'select\') ok',[role,'public.'+table]))[0].ok,false);
   assert.equal((await query("select has_function_privilege($1,'public.begin_songgift_maintenance()','EXECUTE') ok",[role]))[0].ok,false);
  }
 }finally{await f.db.exec('set role service_role');}
});

test('storage-only recovery cannot query a provider when no cached result exists',async()=>{
 const id=await f.order({paid:true}),job=await start(id),polls=f.pollCalls;const r=await act(id,'generation.resume_storage',job.generationJobId);assert.equal(r.status,409);assert.equal(f.pollCalls,polls);
});

test('mail attempts and elapsed idempotency window are bounded; concurrent claims send only once',async()=>{
 const id=await f.order({paid:true}),job=await start(id);await complete(id,job);
 const before=f.calls.filter(c=>c.url==='https://api.resend.com/emails').length;await Promise.all([sendMail(),sendMail()]);assert.equal(f.calls.filter(c=>c.url==='https://api.resend.com/emails').length-before,1);
 const exhausted=await f.order({paid:true}),exJob=await start(exhausted);await complete(exhausted,exJob);await f.db.query("update public.song_notification_outbox set attempts=5,first_attempt_at=now(),next_attempt_at=now()-interval '1 second' where order_id=$1",[exhausted]);await sendMail();assert.equal((await query('select status from public.song_notification_outbox where order_id=$1',[exhausted]))[0].status,'needs_review');
});

test('pre-cutoff completions and unverified recipients never produce ready emails',async()=>{
 const id=await f.order({paid:true}),newJob=await start(id);f.setFail({authUnavailable:true});await complete(id,newJob);
 await f.db.query("update public.generation_jobs set completed_at='2020-01-01T00:00:00Z' where id=$1",[newJob.generationJobId]);f.setFail({});await maintenance();assert.equal((await query('select count(*)::int n from public.song_notification_outbox where order_id=$1',[id]))[0].n,0);
 const unverified=await f.order({paid:true}),uJob=await start(unverified);f.setFail({unverified:true});await complete(unverified,uJob);const notice=(await query('select * from public.song_notification_outbox where order_id=$1',[unverified]))[0];assert.equal(notice.status,'skipped');assert.equal(notice.to_email,null);
});
