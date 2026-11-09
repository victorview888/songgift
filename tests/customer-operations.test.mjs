import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test,{before,after,beforeEach} from 'node:test';
import {fixture,userId,otherId} from './helpers/customer-fixture.mjs';
let f;before(async()=>{f=await fixture();});after(()=>f?.close());beforeEach(()=>{f.setFail({});f.setMode('queued');f.env.SONG_PRICE_USD='9.99';f.env.PAYPAL_ENVIRONMENT='sandbox';f.identity.provider='fal';f.identity.model='fal-ai/lyria3/pro';});
const create='src/app/api/paypal/create-order/route.ts',capture='src/app/api/paypal/capture-order/route.ts',quote='src/app/api/paypal/quote/route.ts',music='src/app/api/music/route.ts',status='src/app/api/music/status/[jobId]/route.ts';
async function start(id){const response=await f.request(music,'POST',{orderId:id});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return response.json();}
async function check(id,job){return f.request(status,'GET',null,userId,{jobId:job},'?orderId='+id);}
async function row(id){return (await f.db.query('select * from public.song_orders where id=$1',[id])).rows[0];}

test('checkout freezes the displayed quote, reuses PayPal checkout and records one verified capture',async()=>{
 const id=await f.order();let r=await f.request(quote,'POST',{orderId:id,amount:'0.01',environment:'live'});assert.equal(r.status,200);assert.equal((await r.json()).checkoutPrice.value,'9.99');
 f.env.SONG_PRICE_USD='29.99';f.env.PAYPAL_ENVIRONMENT='live';
 const first=await f.request(create,'POST',{orderId:id});assert.equal(first.status,200,JSON.stringify(await first.clone().json()));const checkout=await first.json();
 assert.equal(checkout.checkoutPrice.value,'9.99');
 const again=await f.request(create,'POST',{orderId:id});assert.equal((await again.json()).id,checkout.id);
 const creates=f.calls.filter(c=>c.method==='POST'&&c.url?.endsWith('/v2/checkout/orders')&&c.body.purchase_units[0].custom_id===id);
 assert.equal(creates.length,1);assert.match(creates[0].url,/sandbox/);assert.equal(creates[0].headers['PayPal-Request-Id'],'sg-create-'+id);
 let paid=await f.request(capture,'POST',{paypalOrderId:checkout.id});assert.equal(paid.status,200,JSON.stringify(await paid.clone().json()));
 paid=await f.request(capture,'POST',{paypalOrderId:checkout.id});assert.equal(paid.status,200);
 assert.equal((await f.db.query('select count(*)::int n from public.payment_transactions where order_id=$1',[id])).rows[0].n,1);
 assert.equal((await row(id)).status,'paid');
 await start(id);await f.request(capture,'POST',{paypalOrderId:checkout.id});assert.equal((await row(id)).status,'generating');
});

test('checkout association cannot be replaced; historical unknown amounts and other accounts are rejected before external calls',async()=>{
 const id=await f.order();await f.request(create,'POST',{orderId:id});const calls=f.calls.length;
 const foreign=await f.request(create,'POST',{orderId:id},otherId);assert.equal(foreign.status,404);
 const beforeProvider=f.calls.filter(c=>c.url?.includes('paypal.com')).length;
 const legacy=await f.order({legacy:true});await f.db.query('update public.song_orders set paid_at=null where id=$1',[legacy]);const rejected=await f.request(create,'POST',{orderId:legacy});assert.equal(rejected.status,409);
 assert.equal(f.calls.filter(c=>c.url?.includes('paypal.com')).length,beforeProvider);
 await assert.rejects(f.rpc('bind_songgift_checkout',{p_order_id:id,p_user_id:userId,p_paypal_order_id:'DIFFERENT'}),/payment_mismatch/);
 assert.ok(f.calls.length>calls);
});

test('parallel generation and replay submit one request with a frozen input snapshot',async()=>{
 const id=await f.order({paid:true});const before=f.generateCalls;
 const results=await Promise.all([f.request(music,'POST',{orderId:id,lyricsText:'INJECTED'}),f.request(music,'POST',{orderId:id})]);
 assert.ok(results.every(r=>r.status===200));assert.equal(f.generateCalls-before,1);
 const job=(await f.db.query('select * from public.generation_jobs where order_id=$1',[id])).rows[0];
 assert.equal(job.input_snapshot.recipientName,'Emma');assert.match(job.input_snapshot.lyricsText,/confirmed/);assert.equal(job.model,'fal-ai/lyria3/pro');assert.equal((await row(id)).active_generation_job_id,job.id);
 const visible=await results[0].json();assert.equal(visible.lease_token,undefined);assert.equal(visible.input_snapshot,undefined);
 await assert.rejects(f.db.query("update public.song_orders set lyrics_text='Changed after submit' where id=$1",[id]),/generation_input_immutable/);
 await assert.rejects(f.db.query("update public.generation_jobs set input_snapshot='{}'::jsonb where id=$1",[job.id]),/job_identity_immutable/);
 const patch=await f.request('src/app/api/orders/[id]/route.ts','PATCH',{lyricsText:'[Verse] A different approved lyric that must be rejected.'},userId,{id});assert.equal(patch.status,409);
});

test('status uses the saved provider/model after defaults change and completes one durable audio asset',async()=>{
 const id=await f.order({paid:true}),job=await start(id);f.env.MUSIC_PROVIDER='musicapi';f.identity.model='changed-default';
 const response=await check(id,job.generationJobId);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const complete=await response.json();assert.equal(complete.status,'completed');
 assert.equal(complete.audioUrl,'/api/orders/'+id+'/audio');assert.equal(complete.storagePath,undefined);assert.equal(complete.audioBase64,undefined);
 const polling=f.calls.filter(c=>c.pollJob===job.providerJobId).at(-1);assert.equal(polling.pinned.model,'fal-ai/lyria3/pro');
 const assets=(await f.db.query('select * from public.song_assets where order_id=$1',[id])).rows;assert.equal(assets.length,1);assert.equal(assets[0].storage_path,id+'/'+job.generationJobId+'/final.wav');
 assert.ok(f.objects.has('songs/'+assets[0].storage_path));assert.equal((await row(id)).status,'completed');
 const before=f.pollCalls;assert.equal((await (await check(id,job.generationJobId)).json()).status,'completed');assert.equal(f.pollCalls,before);
 assert.equal((await f.db.query('select count(*)::int n from public.generation_job_outputs where job_id=$1',[job.generationJobId])).rows[0].n,0);
});

test('upload failure retains output, and recovery never submits another song',async()=>{
 const id=await f.order({paid:true}),job=await start(id),before=f.generateCalls;f.setFail({upload:true});assert.equal((await check(id,job.generationJobId)).status,503);
 let saved=(await f.db.query('select * from public.generation_jobs where id=$1',[job.generationJobId])).rows[0];assert.equal(saved.state,'storing');assert.equal(saved.error_code,'storage_failed');assert.equal(saved.lease_token,null);
 assert.ok((await row(id)).generation_error);
 f.setFail({});assert.equal((await (await check(id,job.generationJobId)).json()).status,'completed');assert.equal(f.generateCalls,before);assert.equal((await row(id)).generation_error,null);
});

test('upload success followed by metadata failure reuses the same object without deleting or duplicating it',async()=>{
 const id=await f.order({paid:true}),job=await start(id),before=f.generateCalls;f.setFail({insert:true});assert.equal((await check(id,job.generationJobId)).status,503);
 const key='songs/'+id+'/'+job.generationJobId+'/final.wav';assert.ok(f.objects.has(key));
 f.setFail({});const complete=await check(id,job.generationJobId);assert.equal(complete.status,200,JSON.stringify(await complete.clone().json()));assert.equal((await complete.json()).status,'completed');
 assert.equal([...f.objects.keys()].filter(p=>p===key).length,1);assert.equal(f.generateCalls,before);
});

test('asset registration and completion failures leave no partial customer asset and remain recoverable',async()=>{
 const id=await f.order({paid:true}),job=await start(id);f.setFail({finish:true});assert.equal((await check(id,job.generationJobId)).status,503);
 assert.equal((await row(id)).status,'generating');assert.equal((await f.db.query('select count(*)::int n from public.song_assets where order_id=$1',[id])).rows[0].n,0);
 f.setFail({});assert.equal((await (await check(id,job.generationJobId)).json()).status,'completed');
 assert.equal((await f.db.query("select count(*)::int n from public.order_events where order_id=$1 and event_type='generation.completed'",[id])).rows[0].n,1);
});

test('synchronous base64 outputs survive storage failure and resume using an internal task identifier',async()=>{
 const id=await f.order({paid:true});f.setMode('sync');f.setFail({upload:true});const before=f.generateCalls;
 const response=await f.request(music,'POST',{orderId:id});assert.equal(response.status,503);
 const job=(await f.db.query('select * from public.generation_jobs where order_id=$1',[id])).rows[0];assert.equal(job.provider_job_id,null);assert.equal(job.state,'storing');
 f.setFail({});assert.equal((await (await check(id,job.id)).json()).status,'completed');assert.equal(f.generateCalls-before,1);
});

test('unknown submissions, unpaid orders, failed tasks and foreign task IDs never trigger a second generation',async()=>{
 const unpaid=await f.order();assert.equal((await f.request(music,'POST',{orderId:unpaid})).status,402);
 const legacy=await f.order({legacy:true});assert.equal((await f.request(music,'POST',{orderId:legacy})).status,409);
 const id=await f.order({paid:true});f.setMode('unknown');const before=f.generateCalls;assert.equal((await f.request(music,'POST',{orderId:id})).status,502);
 const replay=await start(id);assert.equal(replay.status,'needs_review');assert.equal(f.generateCalls-before,1);
 f.setMode('queued');const a=await f.order({paid:true}),b=await f.order({paid:true}),job=await start(a);const polls=f.pollCalls;
 assert.equal((await check(b,job.generationJobId)).status,404);assert.equal((await f.request(status,'GET',null,otherId,{jobId:job.generationJobId},'?orderId='+a)).status,404);assert.equal(f.pollCalls,polls);
 f.setMode('failed');const failed=await start(await f.order({paid:true}));assert.equal(failed.status,'failed');
});

test('expired submissions become reviewable and invalid audio never completes an order',async()=>{
 const id=await f.order({paid:true});const reserved=await f.rpc('reserve_songgift_generation',{p_order_id:id,p_user_id:userId,p_request_id:id,p_provider:'fal',p_model:'fal-ai/lyria3/pro',p_environment:'production'});
 await f.db.query("update public.generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[reserved.job.id]);const before=f.generateCalls;
 assert.equal((await (await check(id,reserved.job.id)).json()).status,'needs_review');assert.equal(f.generateCalls,before);
 const invalid=await f.order({paid:true}),job=await start(invalid);f.setFail({invalidAudio:true});assert.equal((await check(invalid,job.generationJobId)).status,503);assert.equal((await row(invalid)).status,'generating');
 assert.equal((await f.db.query('select count(*)::int n from public.song_assets where order_id=$1',[invalid])).rows[0].n,0);
});

test('new migration is repeatable and temporary outputs stay unavailable to customer roles',async()=>{
 await f.db.exec('reset role');try {
  await f.db.exec(readFileSync('supabase/migrations/20261106_customer_order_operations.sql','utf8'));
  for(const role of ['anon','authenticated']) {
   assert.equal((await f.db.query("select has_table_privilege($1,'public.generation_job_outputs','select') ok",[role])).rows[0].ok,false);
   assert.equal((await f.db.query("select has_function_privilege($1,'public.cache_songgift_job_output(uuid,uuid,text,text,text)','EXECUTE') ok",[role])).rows[0].ok,false);
  }
 } finally {await f.db.exec('set role service_role');}
});

test('concurrent status requests complete once and stale leases cannot register an asset',async()=>{
 const id=await f.order({paid:true}),job=await start(id),before=f.pollCalls;
 const responses=await Promise.all([check(id,job.generationJobId),check(id,job.generationJobId)]);assert.ok(responses.every(r=>r.status===200));assert.equal(f.pollCalls-before,1);
 assert.equal((await f.db.query('select count(*)::int n from public.song_assets where order_id=$1',[id])).rows[0].n,1);
 const second=await f.order({paid:true}),other=await start(second);
 const lease=await f.rpc('claim_songgift_job',{p_job_id:other.generationJobId});
 await f.rpc('cache_songgift_job_output',{p_job_id:lease.id,p_lease_token:lease.lease_token,p_audio_url:'https://audio.isolated.example/song.wav',p_audio_base64:null,p_mime_type:'audio/wav'});
 await f.db.query("update public.generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[lease.id]);
 await assert.rejects(f.rpc('complete_songgift_audio',{p_job_id:lease.id,p_lease_token:lease.lease_token,p_asset_id:crypto.randomUUID(),p_storage_bucket:'songs',p_storage_path:second+'/'+lease.id+'/final.wav',p_mime_type:'audio/wav'}),/stale_lease/);
 assert.equal((await f.db.query('select count(*)::int n from public.song_assets where order_id=$1',[second])).rows[0].n,0);
});

test('cached result URLs can be renewed from the same task after storage failure',async()=>{
 const id=await f.order({paid:true}),job=await start(id);f.setFail({upload:true});assert.equal((await check(id,job.generationJobId)).status,503);
 await f.db.query("update public.generation_job_outputs set audio_url='https://audio.isolated.example/expired.wav' where job_id=$1",[job.generationJobId]);
 const before=f.pollCalls;f.setFail({});assert.equal((await (await check(id,job.generationJobId)).json()).status,'completed');assert.equal(f.pollCalls-before,1);
});

test('a synchronous result whose durable cache cannot be saved is held for review without resubmission',async()=>{
 const id=await f.order({paid:true});f.setMode('sync');f.setFail({cache:true});const before=f.generateCalls;
 assert.equal((await f.request(music,'POST',{orderId:id})).status,503);
 f.setFail({});assert.equal((await start(id)).status,'needs_review');assert.equal(f.generateCalls-before,1);
});
