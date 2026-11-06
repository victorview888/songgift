import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db=new PGlite();
const user="a3f10454-1234-4234-8234-012345678901",other="b3f10454-1234-4234-8234-012345678902";
const migration=readFileSync("supabase/migrations/20261105_order_operations.sql","utf8");
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean);
    grant usage on schema public to anon,authenticated,service_role;`);
  const schema=readFileSync("supabase/schema.sql","utf8").split("-- Order operations foundation.")[0].replace("create extension if not exists pgcrypto;","");
  await db.exec(schema);
  await db.query("insert into auth.users values ($1,'owner@isolated.example',now()),($2,'customer@isolated.example',now())",[user,other]);
  await db.query("insert into public.admin_members(user_id) values ($1)",[user]);
  await db.exec("grant select,insert,update on public.song_orders,public.song_assets to service_role; alter default privileges grant all on tables to anon,authenticated,service_role;");
  await db.exec(migration);
});
after(()=>db.close());
async function asRole(role,fn){assert.ok(["anon","authenticated","service_role"].includes(role));await db.exec("set role "+role);try{return await fn();}finally{await db.exec("reset role");}}
async function rpc(name,args){assert.match(name,/^[a-z_]+$/);return asRole("service_role",async()=>{const r=await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as result`,args);return r.rows[0].result;});}
async function order(extra={}){
  const id=crypto.randomUUID();await db.query("insert into public.song_orders(id,user_id,status,recipient_name,occasion,story,lyrics_text,paid_at,provider_job_id) values ($1,$2,$3,'Friend','birthday','Isolated story','Isolated lyrics',$4,$5)",[id,extra.userId||user,extra.status||"lyrics_ready",extra.paid?"2026-11-05T00:00:00Z":null,extra.providerJobId||null]);return id;
}
async function quote(id,amount=999,env="live"){return rpc("prepare_songgift_checkout",[id,user,amount,env,"test-price-v1"]);}
async function reserve(id,requestId=crypto.randomUUID()){return rpc("reserve_songgift_generation",[id,user,requestId,"fal","fal-ai/lyria3/pro","production"]);}
async function asset(orderId,jobId=null){const id=crypto.randomUUID();await asRole("service_role",()=>db.query("insert into public.song_assets(id,order_id,storage_path,mime_type,provider,model_id,is_final,generation_job_id) values ($1,$2,$3,'audio/mpeg','fal','isolated-model',true,$4)",[id,orderId,'legacy/'+id+'.mp3',jobId]));return id;}

test("migration repeats without assigning historical quotes or moving existing assets",async()=>{
  const id=await order({paid:true});const saved=await asset(id);
  await db.exec(migration);
  const row=(await db.query("select quoted_amount_minor,currency,payment_environment,price_version,quoted_at from public.song_orders where id=$1",[id])).rows[0];
  assert.ok(Object.values(row).every(v=>v===null));
  assert.equal((await db.query("select storage_path from public.song_assets where id=$1",[saved])).rows[0].storage_path,'legacy/'+saved+'.mp3');
});

test("quotes freeze the first server price/environment and refuse legacy payment inference",async()=>{
  const id=await order();const first=await quote(id,100,"sandbox");const second=await quote(id,999,"live");
  assert.equal(second.quoted_amount_minor,100);assert.equal(second.payment_environment,"sandbox");assert.equal(second.quoted_at,first.quoted_at);
  await assert.rejects(db.query("update public.song_orders set quoted_amount_minor=999 where id=$1",[id]),/quote_immutable/);
  const legacy=await order({paid:true});await assert.rejects(quote(legacy),/legacy_payment_needs_review/);
  const pending=await order();await db.query("update public.song_orders set paypal_order_id='OLD-CHECKOUT' where id=$1",[pending]);await assert.rejects(quote(pending),/legacy_payment_needs_review/);
  const foreign=await order({userId:other});await assert.rejects(quote(foreign),/order_not_found/);
  assert.equal((await db.query("select count(*)::int n from public.order_events where order_id=$1 and event_type='quote.created'",[id])).rows[0].n,1);
});

test("capture recording is atomic, owner/quote-bound, idempotent and preserves later generation state",async()=>{
  const id=await order();await quote(id);await db.query("update public.song_orders set paypal_order_id='CHECKOUT-A' where id=$1",[id]);
  const args=[id,user,"CHECKOUT-A","CAPTURE-A","live",999,"USD","2026-11-05T01:00:00Z"];
  await assert.rejects(rpc("record_songgift_capture",[...args.slice(0,5),100,"USD",args[7]]),/payment_mismatch/);
  assert.equal((await db.query("select paid_at from public.song_orders where id=$1",[id])).rows[0].paid_at,null);
  const recorded=await rpc("record_songgift_capture",args);await db.query("update public.song_orders set status='generating' where id=$1",[id]);
  const replay=await rpc("record_songgift_capture",args);assert.equal(replay.id,recorded.id);
  assert.equal((await db.query("select status from public.song_orders where id=$1",[id])).rows[0].status,"generating");
  assert.equal((await db.query("select count(*)::int n from public.payment_transactions where order_id=$1",[id])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from public.order_events where order_id=$1 and event_type='payment.captured'",[id])).rows[0].n,1);
  const delivered=await order();await quote(delivered);await db.query("update public.song_orders set paypal_order_id='DELIVERED',status='completed' where id=$1",[delivered]);
  await rpc("record_songgift_capture",[delivered,user,"DELIVERED","CAPTURE-DELIVERED","live",999,"USD",args[7]]);
  assert.equal((await db.query("select status from public.song_orders where id=$1",[delivered])).rows[0].status,"completed");
  const second=await order();await quote(second);await db.query("update public.song_orders set paypal_order_id='CHECKOUT-A' where id=$1",[second]);
  await assert.rejects(rpc("record_songgift_capture",[second,...args.slice(1)]),/capture_conflict/);
  assert.equal((await db.query("select paid_at from public.song_orders where id=$1",[second])).rows[0].paid_at,null);
});

test("invalid amounts and partial quotes are rejected; no missing price becomes zero",async()=>{
  const id=await order();await assert.rejects(quote(id,0));await assert.rejects(quote(id,-1));
  await assert.rejects(db.query("update public.song_orders set currency='USD' where id=$1",[id]));
  const row=(await db.query("select quoted_at,quoted_amount_minor from public.song_orders where id=$1",[id])).rows[0];assert.equal(row.quoted_at,null);assert.equal(row.quoted_amount_minor,null);
});

test("generation reservation grants a one-time submission permission and prevents replacement of unknown/legacy work",async()=>{
  const unpaid=await order();await assert.rejects(reserve(unpaid),/payment_required/);
  const id=await order({paid:true}),requestId=crypto.randomUUID();
  const first=await reserve(id,requestId);assert.equal(first.created,true);assert.ok(first.job.lease_token);
  const replay=await reserve(id,requestId);assert.equal(replay.created,false);assert.equal(replay.job.lease_token,undefined);
  await assert.rejects(reserve(id),/generation_needs_review/);
  await assert.rejects(rpc("reserve_songgift_generation",[id,user,requestId,"musicapi","another-model","production"]),/submission_conflict/);
  const old=await order({paid:true,providerJobId:"legacy-task"});await assert.rejects(reserve(old),/generation_needs_review/);
  const lost=await order({paid:true,status:"generating"});await assert.rejects(reserve(lost),/generation_needs_review/);
  await db.query("update public.generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[first.job.id]);
  const unknown=await rpc("claim_songgift_job",[first.job.id]);assert.equal(unknown.state,"needs_review");assert.equal(unknown.error_code,"submission_unknown");assert.equal(unknown.lease_token,null);
  await assert.rejects(reserve(id),/generation_needs_review/);await assert.rejects(rpc("claim_songgift_job",[first.job.id]),/job_not_recoverable/);
});

test("lease claims exclude concurrent handlers and freeze original provider/model references",async()=>{
  const id=await order({paid:true});const {job}=await reserve(id);
  await assert.rejects(rpc("claim_songgift_job",[job.id]),/job_busy/);
  await rpc("bind_songgift_generation",[job.id,job.lease_token,"external-task-1","queued"]);
  await assert.rejects(db.query("update public.generation_jobs set model='changed' where id=$1",[job.id]),/job_identity_immutable/);
  await assert.rejects(db.query("update public.generation_jobs set provider_job_id='changed' where id=$1",[job.id]),/job_identity_immutable/);
  const claim=await rpc("claim_songgift_job",[job.id]);assert.ok(claim.lease_token);
  await assert.rejects(rpc("claim_songgift_job",[job.id]),/job_busy/);
  await assert.rejects(rpc("settle_songgift_job",[job.id,job.lease_token,"processing",null]),/stale_lease/);
  await rpc("settle_songgift_job",[job.id,claim.lease_token,"storing","storage_failed"]);
  const store=await rpc("claim_songgift_job",[job.id]);
  await assert.rejects(rpc("settle_songgift_job",[job.id,store.lease_token,"failed","provider_failed"]),/storage_must_resume/);
});

test("only matching durable final assets complete jobs; duplicate finishes and stale leases are safe",async()=>{
  const id=await order({paid:true}),{job}=await reserve(id);
  await rpc("bind_songgift_generation",[job.id,job.lease_token,"external-store-task","storing"]);
  const wrong=await asset(await order({paid:true}));
  await assert.rejects(rpc("finish_songgift_generation",[job.id,job.lease_token,wrong]),/asset_mismatch/);
  await assert.rejects(asset(await order({paid:true}),job.id),/asset_mismatch/);
  const saved=await asset(id,job.id);await assert.rejects(asset(id,job.id),e=>e.code==="23505");
  const finished=await rpc("finish_songgift_generation",[job.id,job.lease_token,saved]);assert.equal(finished.state,"completed");
  assert.equal((await rpc("finish_songgift_generation",[job.id,job.lease_token,saved])).id,job.id);
  assert.equal((await db.query("select status from public.song_orders where id=$1",[id])).rows[0].status,"completed");
  assert.equal((await db.query("select count(*)::int n from public.order_events where order_id=$1 and event_type='generation.completed'",[id])).rows[0].n,1);
  const second=await order({paid:true}),reserved=await reserve(second);await rpc("bind_songgift_generation",[reserved.job.id,reserved.job.lease_token,"expired-store-task","storing"]);
  const secondAsset=await asset(second,reserved.job.id);await db.query("update public.generation_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[reserved.job.id]);
  const recovered=await rpc("claim_songgift_job",[reserved.job.id]);
  await assert.rejects(rpc("finish_songgift_generation",[reserved.job.id,reserved.job.lease_token,secondAsset]),/stale_lease/);
  assert.equal((await rpc("finish_songgift_generation",[reserved.job.id,recovered.lease_token,secondAsset])).state,"completed");
});

test("audit requests are durable and once-only, conflict-safe and immediately reject revoked Owners",async()=>{
  const id=await order(),request=crypto.randomUUID();const args=[request,user,"payment.reconcile",id,id,"manual_check"];
  const start=await rpc("begin_songgift_admin_operation",args);assert.equal(start.created,true);
  assert.equal((await rpc("begin_songgift_admin_operation",args)).created,false);
  await assert.rejects(rpc("begin_songgift_admin_operation",[request,user,"generation.sync",id,id,"manual_check"]),/target_mismatch/);
  await assert.rejects(rpc("begin_songgift_admin_operation",[request,user,"payment.reconcile",id,id,"recover_delivery"]),/operation_conflict/);
  await rpc("finish_songgift_admin_operation",[request,user,"succeeded",null]);
  await rpc("finish_songgift_admin_operation",[request,user,"succeeded",null]);
  await assert.rejects(rpc("finish_songgift_admin_operation",[request,user,"failed","unavailable"]),/operation_already_finished/);
  await db.query("update public.admin_members set active=false where user_id=$1",[user]);
  await assert.rejects(rpc("begin_songgift_admin_operation",[crypto.randomUUID(),user,"payment.reconcile",id,id,"manual_check"]),/admin_denied/);
  await db.query("update public.admin_members set active=true where user_id=$1",[user]);
  const events=(await db.query("select event_type from public.order_events where order_id=$1 order by created_at",[id])).rows;
  assert.equal(events.filter(e=>e.event_type==="admin.requested").length,1);assert.equal(events.filter(e=>e.event_type==="admin.finished").length,1);
});

test("customer roles cannot access new tables or execute privileged operations; customer order RLS remains scoped",async()=>{
  const a=await order(),b=await order({userId:other});
  for(const role of ["anon","authenticated"])await asRole(role,async()=>{
    for(const table of ["payment_transactions","generation_jobs","order_events"]){
      for(const sql of [`select * from public.${table}`,`delete from public.${table}`])await assert.rejects(db.exec(sql),e=>e.code==="42501");
    }
    await assert.rejects(db.query("select public.prepare_songgift_checkout($1,$2,999,'live','v1')",[a,user]),e=>e.code==="42501");
    await assert.rejects(db.query("select public.claim_songgift_job($1)",[crypto.randomUUID()]),e=>e.code==="42501");
  });
  await asRole("authenticated",async()=>{
    await db.query("select set_config('test.user_id',$1,false)",[user]);
    assert.equal((await db.query("select id from public.song_orders where id=$1",[b])).rows.length,0);
    assert.equal((await db.query("select id from public.song_orders where id=$1",[a])).rows.length,1);
  });
  await asRole("service_role",async()=>{
    await assert.rejects(db.exec("update public.payment_transactions set amount_minor=1"),e=>e.code==="42501");
    await assert.rejects(db.exec("delete from public.order_events"),e=>e.code==="42501");
  });
});


test("provider references and active attempts stay unique across independently reserved orders",async()=>{
  const first=await order({paid:true}),second=await order({paid:true});
  const a=await reserve(first),b=await reserve(second);
  await rpc("bind_songgift_generation",[a.job.id,a.job.lease_token,"one-provider-reference","queued"]);
  await assert.rejects(rpc("bind_songgift_generation",[b.job.id,b.job.lease_token,"one-provider-reference","queued"]),e=>e.code==="23505");
  assert.equal((await db.query("select provider_job_id from public.song_orders where id=$1",[second])).rows[0].provider_job_id,null);
  await asRole("service_role",async()=>{
    await assert.rejects(db.query("insert into public.generation_jobs(order_id,submission_key,attempt_no,environment,provider,model,state) values ($1,$2,2,'production','fal','another','submitting')",[first,crypto.randomUUID()]),e=>e.code==="23505");
  });
});

test("fresh-install schema creates the same empty operations structures with service-only RPCs",async()=>{
  const fresh=new PGlite();
  try {
    await fresh.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean);`);
    await fresh.exec(readFileSync("supabase/schema.sql","utf8").replace("create extension if not exists pgcrypto;",""));
    assert.equal((await fresh.query("select count(*)::int n from public.generation_jobs")).rows[0].n,0);
    assert.equal((await fresh.query("select has_function_privilege('authenticated','public.claim_songgift_job(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
    assert.equal((await fresh.query("select has_table_privilege('authenticated','public.payment_transactions','select') allowed")).rows[0].allowed,false);
  } finally {await fresh.close();}
});

// Upgrade an existing installation, rather than relying only on fresh schema.
test('customer integration upgrade preserves legacy facts and requires verified payment for new production jobs',async()=>{
  const legacy=await order({paid:true}),oldAsset=await asset(legacy);
  const next=readFileSync('supabase/migrations/20261106_customer_order_operations.sql','utf8');await db.exec(next);await db.exec(next);
  const original=(await db.query('select active_generation_job_id,quoted_at from public.song_orders where id=$1',[legacy])).rows[0];assert.equal(original.active_generation_job_id,null);assert.equal(original.quoted_at,null);
  assert.equal((await db.query('select generation_job_id from public.song_assets where id=$1',[oldAsset])).rows[0].generation_job_id,null);
  const unverified=await order({paid:true});await assert.rejects(reserve(unverified),/legacy_payment_needs_review/);
  const current=await order();await quote(current);await db.query("update public.song_orders set paypal_order_id='UPGRADE-CHECKOUT' where id=$1",[current]);
  await rpc('record_songgift_capture',[current,user,'UPGRADE-CHECKOUT','UPGRADE-CAPTURE','live',999,'USD','2026-11-06T00:00:00Z']);
  const {job}=await reserve(current);assert.equal(job.input_snapshot.lyricsText,'Isolated lyrics');assert.equal((await db.query('select active_generation_job_id from public.song_orders where id=$1',[current])).rows[0].active_generation_job_id,job.id);
});

test('delivery upgrade preserves existing jobs/assets and never queues historical completions',async()=>{
 const before=(await db.query('select id,provider_job_id,state from public.generation_jobs order by id')).rows;
 const assets=(await db.query('select id,storage_path from public.song_assets order by id')).rows;
 const next=readFileSync('supabase/migrations/20261106_delivery_operations.sql','utf8');await db.exec(next);
 assert.deepEqual((await db.query('select id,provider_job_id,state from public.generation_jobs order by id')).rows,before);
 assert.deepEqual((await db.query('select id,storage_path from public.song_assets order by id')).rows,assets);
 const candidates=await rpc('list_songgift_notification_candidates',[20]);assert.deepEqual(candidates,[]);
 const cutoff=(await db.query('select notification_cutoff from public.songgift_maintenance')).rows[0].notification_cutoff;await db.exec(next);
 assert.equal(String((await db.query('select notification_cutoff from public.songgift_maintenance')).rows[0].notification_cutoff),String(cutoff));
 for(const role of ['anon','authenticated'])await asRole(role,async()=>{
  await assert.rejects(db.exec('select * from public.song_notification_outbox'),e=>e.code==='42501');
  await assert.rejects(db.exec('select public.begin_songgift_maintenance()'),e=>e.code==='42501');
 });
});
