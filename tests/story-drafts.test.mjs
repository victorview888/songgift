import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test,{before,after,beforeEach} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {fixture,userId,otherId} from './helpers/customer-fixture.mjs';
const api={};vm.runInNewContext('(function(exports){'+ts.transpileModule(readFileSync('src/lib/drafts/story.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'\n})',{crypto})(api);
const form={recipientName:'Emma',relationship:'Partner',occasion:'Birthday',story:'Our first walk in the woods became a favorite memory.',mood:'Warm and heartfelt',style:'Acoustic pop'};
const store=()=>{const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const stamp=Date.now();
test('partial draft, request and order resume pointer round-trip with a bounded lifetime',()=>{
 const s=store(),draft=api.newStoryDraft(userId,stamp);draft.form={...form};assert.equal(api.saveStoryDraft(draft,s),true);let loaded=api.loadStoryDraft(userId,s,stamp+1000);assert.deepEqual(JSON.parse(JSON.stringify(loaded.form)),form);assert.equal(loaded.requestId,draft.requestId);
 draft.orderId=crypto.randomUUID();draft.stage='ready';api.saveStoryDraft(draft,s);loaded=api.loadStoryDraft(userId,s,stamp+2000);assert.equal(loaded.orderId,draft.orderId);
 assert.equal(api.loadStoryDraft(userId,s,stamp+api.STORY_DRAFT_TTL+1),null);assert.equal(s.data.size,0);
});
test('guest drafts can join a verified login; another account cannot restore a private draft',()=>{
 const s=store(),guest={...api.newStoryDraft(null,stamp),form};api.saveStoryDraft(guest,s);const claimed=api.loadStoryDraft(userId,s,stamp);assert.equal(claimed.ownerId,userId);api.saveStoryDraft(claimed,s);
 assert.equal(api.loadStoryDraft(null,s,stamp),null);assert.ok(s.data.size);assert.equal(api.loadStoryDraft(otherId,s,stamp),null);assert.equal(s.data.size,0);
});
test('corrupt, future, oversized and unsupported draft records are discarded without execution',()=>{
 for(const raw of ['broken',JSON.stringify({...api.newStoryDraft(userId,stamp),version:2}),JSON.stringify({...api.newStoryDraft(userId,stamp),savedAt:stamp+120000}),JSON.stringify({...api.newStoryDraft(userId,stamp),form:{...form,story:'x'.repeat(8001)}}),JSON.stringify({...api.newStoryDraft(userId,stamp),orderId:'//evil.example',stage:'ready'})]){
  const s=store();s.setItem(api.STORY_DRAFT_KEY,raw);assert.equal(api.loadStoryDraft(userId,s,stamp),null);assert.equal(s.data.size,0);
 }
 const s=store();s.setItem(api.STORY_DRAFT_KEY,JSON.stringify({...api.newStoryDraft(userId,stamp),form:{...form,access_token:'DO NOT RESTORE'},secret:'DO NOT RESTORE'}));assert.doesNotMatch(JSON.stringify(api.loadStoryDraft(userId,s,stamp)),/DO NOT RESTORE/);
});
test('legacy guest format migrates once, while storage failure and logout clearing remain safe',()=>{
 const s=store();s.setItem('songgift-draft-story',JSON.stringify(form));assert.equal(api.loadStoryDraft(null,s,stamp).form.story,form.story);assert.equal(s.getItem('songgift-draft-story'),null);api.clearStoryDraft(s);assert.equal(s.data.size,0);
 s.setItem('songgift-draft-story',JSON.stringify(form));assert.equal(api.loadStoryDraft(userId,s,stamp),null);assert.equal(s.data.size,0);
 const blocked={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}};assert.equal(api.loadStoryDraft(userId,blocked),null);assert.equal(api.saveStoryDraft(api.newStoryDraft(userId),blocked),false);assert.doesNotThrow(()=>api.clearStoryDraft(blocked));
});
let f;before(async()=>{f=await fixture();});after(()=>f?.close());beforeEach(()=>f.setFail({}));
const route='src/app/api/lyrics/route.ts';
const write=(requestId,extra={},user=userId)=>f.request(route,'POST',{...form,clientRequestId:requestId,draftOwnerId:user,...extra},user);
test('parallel writing requests create one order and one lyric call; replay resumes stored lyrics',async()=>{
 const requestId=crypto.randomUUID(),before=f.lyricsCalls;const responses=await Promise.all([write(requestId),write(requestId)]);assert.ok(responses.every(r=>[200,202].includes(r.status)));const data=await Promise.all(responses.map(r=>r.json()));assert.equal(data[0].orderId,data[1].orderId);assert.equal(f.lyricsCalls-before,1);
 const replay=await write(requestId);assert.equal(replay.status,200);const saved=await replay.json();assert.equal(saved.orderId,data[0].orderId);assert.ok(saved.lyricsText.includes('Emma'));assert.equal(saved.leaseToken,undefined);assert.equal(f.lyricsCalls-before,1);
 assert.equal((await f.db.query('select count(*)::int n from public.song_story_requests where request_id=$1',[requestId])).rows[0].n,1);
});
test('changed input and other-account request IDs cannot overwrite or disclose the saved song',async()=>{
 const requestId=crypto.randomUUID();const created=await write(requestId);const original=await created.json();const before=f.lyricsCalls;
 assert.equal((await write(requestId,{story:'A different story that should use a fresh request.'})).status,409);const foreign=await write(requestId,{},otherId);assert.equal(foreign.status,404);assert.doesNotMatch(await foreign.text(),/Emma|woods/);assert.equal(f.lyricsCalls,before);
 const update=await f.request(route,'POST',{...form,orderId:original.orderId});assert.equal(update.status,409);assert.equal(f.lyricsCalls,before);
});
test('known failed writing retries retain the same order, while unknown expired writing does not restart automatically',async()=>{
 const requestId=crypto.randomUUID();f.setFail({lyrics:true});assert.equal((await write(requestId)).status,502);const first=(await f.db.query('select order_id from public.song_story_requests where request_id=$1',[requestId])).rows[0];
 f.setFail({});const retry=await write(requestId);assert.equal(retry.status,200);assert.equal((await retry.json()).orderId,first.order_id);
 const pendingId=crypto.randomUUID(),hash=createHash('sha256').update(JSON.stringify(form)).digest('hex');const reserved=await f.rpc('begin_songgift_story',{p_request_id:pendingId,p_user_id:userId,p_input_hash:hash,p_input:form,p_email:'owner@isolated.example'});const before=f.lyricsCalls;
 assert.equal((await write(pendingId)).status,202);await f.db.query("update public.song_story_requests set lease_expires_at=now()-interval '1 second' where request_id=$1",[pendingId]);assert.equal((await write(pendingId)).status,409);assert.equal(f.lyricsCalls,before);assert.equal((await f.db.query('select order_id,state from public.song_story_requests where request_id=$1',[pendingId])).rows[0].order_id,reserved.orderId);
});
test('checkout and paid-order recovery retain the original story and payment references',async()=>{
 const requestId=crypto.randomUUID(),created=await (await write(requestId)).json();const checkout=await f.request('src/app/api/paypal/create-order/route.ts','POST',{orderId:created.orderId});assert.equal(checkout.status,200);const payment=await checkout.json();
 const resumed=await write(requestId);assert.equal((await resumed.json()).orderId,created.orderId);const second=await f.request('src/app/api/paypal/create-order/route.ts','POST',{orderId:created.orderId});assert.equal((await second.json()).id,payment.id);
 await f.request('src/app/api/paypal/capture-order/route.ts','POST',{paypalOrderId:payment.id});const again=await write(requestId);assert.equal((await again.json()).orderId,created.orderId);assert.equal((await f.db.query('select paypal_order_id from public.song_orders where id=$1',[created.orderId])).rows[0].paypal_order_id,payment.id);
});
test('story migration repeats and keeps leases inaccessible to customer roles',async()=>{
 await f.db.exec('reset role');try{
  await f.db.exec(readFileSync('supabase/migrations/20261106_story_drafts.sql','utf8'));await f.db.exec(readFileSync('supabase/migrations/20261106_story_drafts.sql','utf8'));
  for(const role of ['anon','authenticated']){
   assert.equal((await f.db.query("select has_table_privilege($1,'public.song_story_requests','select') ok",[role])).rows[0].ok,false);
   assert.equal((await f.db.query("select has_function_privilege($1,'public.begin_songgift_story(uuid,uuid,text,jsonb,text)','EXECUTE') ok",[role])).rows[0].ok,false);
  }
 }finally{await f.db.exec('set role service_role');}
});


test('a changed sign-in cannot persist another account draft under the new identity',async()=>{
 const before=f.lyricsCalls;const result=await write(crypto.randomUUID(),{draftOwnerId:userId},otherId);assert.equal(result.status,409);assert.equal(f.lyricsCalls,before);
});
