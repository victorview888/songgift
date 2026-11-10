import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '@supabase/supabase-js';
import * as waffoSdk from '@waffo/pancake-ts';

export const userId='a3f10454-1234-4234-8234-012345678901';
export const otherId='b3f10454-1234-4234-8234-012345678902';
export function wav() {
  const b=Buffer.alloc(204);b.write('RIFF');b.writeUInt32LE(196,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(160,40);return b;
}
export async function fixture({legacyPayments=false}={}) {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean);`);
 const schema=readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists pgcrypto;','');
 await db.exec(legacyPayments ? schema.split('-- Apply after the six existing admin/customer/delivery/draft migrations.')[0] : schema);
 await db.query('insert into auth.users values ($1,\'owner@isolated.example\',now()),($2,\'other@isolated.example\',now())',[userId,otherId]);
 await db.exec('grant select,insert,update on public.song_orders,public.song_assets to service_role;set role service_role;');
 const env={SONG_PRICE_USD:'9.99',PAYPAL_CURRENCY:'USD',PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'test-id',PAYPAL_CLIENT_SECRET:'test-secret',PAYPAL_LIVE_CLIENT_ID:'live-test-id',PAYPAL_LIVE_CLIENT_SECRET:'live-test-secret',MUSIC_PROVIDER:'fal',SUPABASE_STORAGE_BUCKET:'songs'};
 const calls=[],objects=new Map(),paypal=new Map(),sentEmails=new Map(),waffoSessions=new Map();let generateCalls=0,pollCalls=0,mode='queued',fail={},lyricsCalls=0;
 const identity={provider:'fal',model:'fal-ai/lyria3/pro',environment:'production'};
 const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
 function matches(p) {
  const values=[],where=[];
  for(const [key,filter] of p) {
   if(['select','order','limit','offset'].includes(key)||/\.(order|limit)$/.test(key)||key==='final_assets.is_final')continue;
   if(key==='or'){assert.equal(filter,'(paid_at.not.is.null,quoted_at.not.is.null)');where.push('(paid_at is not null or quoted_at is not null)');continue;}
   assert.match(key,/^[a-z_]+$/);
   if(filter.startsWith('eq.')){values.push(filter.slice(3));where.push('"'+key+'"=$'+values.length);}
   else if(filter==='is.null')where.push('"'+key+'" is null');
   else if(filter.startsWith('in.(')){values.push(filter.slice(4,-1).split(','));where.push('"'+key+'"=any($'+values.length+'::text[])');}
   else throw new Error('Unsupported fixture filter: '+filter);
  }
  return {values,sql:where.length?' where '+where.join(' and '):''};
 }
 const transport=async(input,init={})=>{
  const url=new URL(input);const method=init.method||'GET';const body=typeof init.body==='string'&&init.body.startsWith('{')?JSON.parse(init.body):{};
  calls.push({url:url.toString(),method,body,headers:init.headers});
  if(url.hostname==='api.waffo.ai') {
   if(url.pathname==='/v1/graphql')return json({data:{onetimeProduct:fail.waffoSubscription?null:{id:env.WAFFO_PRODUCT_ID,status:'active'}}});
   assert.equal(url.pathname,'/v1/actions/checkout/create-session');
   if(fail.waffoCreate)return json({errors:[{message:'Isolated Waffo unavailable',layer:'checkout'}]},503);
   const headers=new Headers(init.headers),key=headers.get('X-Idempotency-Key');assert.ok(key);assert.ok(headers.get('X-Signature'));
   let session=waffoSessions.get(key);
   if(session)assert.deepEqual(session.body,body);
   else {session={body,sessionId:'cs_'+crypto.randomUUID(),checkoutUrl:'https://pancake.waffo.ai/store/isolated/checkout/cs_'+crypto.randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString()};waffoSessions.set(key,session);}
   if(fail.waffoTimeout)throw new Error('Isolated Waffo response lost');
   return json({data:session});
  }
  if(url.hostname==='audio.isolated.example')return fail.download?new Response('unavailable',{status:503}):new Response(fail.invalidAudio?'not an audio file':wav(),{headers:{'Content-Type':'audio/wav'}});
  if(url.hostname==='api.resend.com') {
   assert.equal(url.pathname,'/emails');assert.ok(body.to[0].endsWith('@isolated.example'));
   const key=init.headers['Idempotency-Key'];assert.ok(key);
   if(fail.emailStatus)return json({message:'isolated mail failure'},fail.emailStatus);
   const old=sentEmails.get(key);if(old&&JSON.stringify(old.body)!==JSON.stringify(body))return json({message:'idempotency conflict'},409);
   const accepted=old||{id:'mail-'+crypto.randomUUID(),body};sentEmails.set(key,accepted);
   if(fail.emailTimeout)throw new Error('isolated lost mail response');
   return json({id:accepted.id});
  }
  if(url.pathname.startsWith('/auth/v1/admin/users/')) {
   if(fail.authUnavailable)return json({message:'isolated auth failure'},503);
   const id=url.pathname.split('/').at(-1);
   if(![userId,otherId].includes(id))return json({message:'No fixture user'},404);
   return json({id,email:fail.emailChanged?'changed@isolated.example':id===userId?'owner@isolated.example':'other@isolated.example',email_confirmed_at:fail.unverified?null:'2026-11-06T00:00:00Z'});
  }
  if(url.hostname.endsWith('paypal.com')) {
   if(url.pathname.endsWith('/token'))return json({access_token:'test-token'});
   if(url.pathname==='/v2/checkout/orders'&&method==='POST') {
    const custom=body.purchase_units[0].custom_id;
    let item=[...paypal.values()].find(p=>p.purchase_units[0].custom_id===custom);
    if(!item){item={id:'PP-'+crypto.randomUUID(),status:'APPROVED',purchase_units:body.purchase_units,links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=test'}]};paypal.set(item.id,item);}
    return json(item,201);
   }
   const id=decodeURIComponent(url.pathname.split('/')[4]);const item=paypal.get(id);assert.ok(item,'Unknown fake payment');
   if(url.pathname.endsWith('/capture')) {
    item.status='COMPLETED';item.purchase_units[0].payments={captures:[{id:'CAP-'+item.id,status:'COMPLETED',final_capture:true,create_time:'2026-11-06T12:00:00Z',amount:item.purchase_units[0].amount}]};
   }
   return json(item);
  }
  assert.equal(url.hostname,'isolated.supabase.invalid','All requests must remain simulated');
  try {
   if(url.pathname.startsWith('/rest/v1/rpc/')) {
    const name=url.pathname.split('/').at(-1);assert.match(name,/^[a-z_]+$/);
    if(name==='record_songgift_waffo_event'&&fail.waffoRecord)return json({message:'isolated payment database unavailable',code:'08006'},503);
    if((name==='complete_songgift_audio'&&(fail.finish||fail.insert))||(name==='cache_songgift_job_output'&&fail.cache))return json({message:'fixture database unavailable',code:'08006'},503);
    const keys=Object.keys(body);keys.forEach(k=>assert.match(k,/^p_[a-z0-9_]+$/));
    const sql='select to_jsonb(public.'+name+'('+keys.map((key,i)=>key+'=>$'+(i+1)).join(',')+')) result';
    return json((await db.query(sql,Object.values(body))).rows[0].result);
   }
   if(url.pathname.startsWith('/storage/v1/object/')) {
    const key=decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?/,''));
    if(method==='POST') {
     if(fail.upload)return json({message:'fixture storage unavailable',statusCode:'503'},503);
     if(objects.has(key))return json({message:'The resource already exists',statusCode:'409'},409);
     objects.set(key,Buffer.from(init.body));return json({Key:key},200);
    }
    if(!objects.has(key))return json({message:'Object not found',statusCode:'404'},404);
    return new Response(objects.get(key),{headers:{'Content-Type':'audio/wav'}});
   }
   const table=url.pathname.split('/').at(-1);assert.ok(['song_orders','generation_jobs','generation_job_outputs','song_assets','admin_members','song_notification_outbox','songgift_maintenance','admin_audit_logs','song_story_requests','payment_transactions','waffo_checkouts'].includes(table),table);
   const cond=matches(url.searchParams);
   if(method==='GET') {
    if(fail.paymentHistory&&table==='song_orders'&&url.searchParams.get('select')?.includes('payment_transactions'))return json({message:'isolated history failure'},503);
    const order=url.searchParams.get('order');let suffix='';
    if(order){const parts=order.split(',');parts.forEach(part=>assert.match(part,/^[a-z_]+\.(asc|desc)$/));suffix=' order by '+parts.map(part=>part.replace('.',' ')).join(',');}
    const limit=url.searchParams.get('limit');if(limit){assert.match(limit,/^\d+$/);suffix+=' limit '+limit;}
    const offset=url.searchParams.get('offset');if(offset){assert.match(offset,/^\d+$/);suffix+=' offset '+offset;}
    const total=(await db.query('select count(*)::int n from public.'+table+cond.sql,cond.values)).rows[0].n;
    const rows=(await db.query('select * from public.'+table+cond.sql+suffix,cond.values)).rows;
    const select=url.searchParams.get('select')||'*';
    const split=columns=>{const parts=[];let depth=0,start=0;for(let i=0;i<columns.length;i++){if(columns[i]==='(')depth++;if(columns[i]===')')depth--;if(columns[i]===','&&depth===0){parts.push(columns.slice(start,i));start=i+1;}}parts.push(columns.slice(start));return parts;};
    const project=(row,columns)=>columns==='*'?row:Object.fromEntries(split(columns).map(column=>{const nested=column.match(/^([a-z_]+)(?::([a-z_]+))?\((.*)\)$/);return nested?[nested[1],(row[nested[1]]||[]).map(item=>project(item,nested[3]))]:[column,row[column]];}));
    const selected=[];
    for(const row of rows) {
     if(table==='song_orders') {
      if(select.includes('song_assets('))row.song_assets=(await db.query('select * from public.song_assets where order_id=$1',[row.id])).rows;
      if(select.includes('final_assets:'))row.final_assets=row.song_assets.filter(asset=>asset.is_final).slice(0,1);
      for(const relation of ['payment_transactions','generation_jobs','order_events'])if(select.includes(relation+'(')){
       const order=url.searchParams.get(relation+'.order');let sort='';if(order){const parts=order.split(',');parts.forEach(part=>assert.match(part,/^[a-z_]+\.(asc|desc)$/));sort=' order by '+parts.map(part=>part.replace('.',' ')).join(',');}
       const limit=url.searchParams.get(relation+'.limit')||'51';assert.match(limit,/^\d+$/);row[relation]=(await db.query('select * from public.'+relation+' where order_id=$1'+sort+' limit '+limit,[row.id])).rows;
      }
     }
     selected.push(project(row,select));
    }
    return json(selected,200,{'Content-Range':selected.length?(offset||0)+'-'+(Number(offset||0)+selected.length-1)+'/'+total:'*/'+total});
   }
   if(method==='POST') {
    if(table==='song_assets'&&fail.insert)return json({message:'fixture metadata unavailable',code:'08006'},503);
    const keys=Object.keys(body);keys.forEach(k=>assert.match(k,/^[a-z_]+$/));
    await db.query('insert into public.'+table+'('+keys.join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(body));return json(null,201);
   }
   if(method==='PATCH') {
    const keys=Object.keys(body);keys.forEach(k=>assert.match(k,/^[a-z_]+$/));
    const where=cond.sql.replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+keys.length));
    const result=await db.query('update public.'+table+' set '+keys.map((key,i)=>key+'=$'+(i+1)).join(',')+where+' returning id',[...Object.values(body),...cond.values]);return json(result.rows);
   }
   throw new Error('Unsupported fixture operation');
  } catch(error){return json({message:error.message,code:error.code||'XX000'},400);}
 };
 // Storage upload passes binary instead of JSON; preserve body for that branch.
 const fetcher=async(input,init={})=>{
  if(String(input).includes('/storage/v1/object/')&&init.body&&typeof init.body!=='string') {
   const original=init.body;const key=decodeURIComponent(new URL(input).pathname.replace('/storage/v1/object/',''));
   calls.push({url:String(input),method:init.method});
   if(fail.upload)return json({message:'fixture storage unavailable',statusCode:'503'},503);
   if(objects.has(key))return json({message:'The resource already exists',statusCode:'409'},409);
   objects.set(key,Buffer.from(original));return json({Key:key});
  }
  return transport(input,init);
 };
 const client=createClient('https://isolated.supabase.invalid','isolated-service-role',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}});
 class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
 const cache=new Map();
 const providerFactory={getLyricsProvider:()=>({async generateLyrics(input){lyricsCalls++;calls.push({lyricInput:input});await new Promise(resolve=>setTimeout(resolve,10));if(fail.lyrics)throw new Error('Isolated lyric failure');return {provider:'mock',model:'isolated-lyrics',status:'mock',title:'For '+input.recipientName,lyricsText:'[Verse] A private original song for '+input.recipientName+'. '+input.story,factsUsed:[],pronunciationNotes:[]};}}),getMusicIdentity:()=>({...identity}),getPinnedMusicProvider:(pinned)=>{
  assert.equal(pinned.provider,identity.provider==='fal'?'fal':pinned.provider);
  return {
   async generateSong(input){generateCalls++;calls.push({generationInput:input,pinned:{provider:pinned.provider,model:pinned.model}});if(mode==='unknown')throw new Error('private provider response');
    if(mode==='sync')return {provider:pinned.provider,model:pinned.model,status:'completed',audioBase64:wav().toString('base64'),mimeType:'audio/wav'};
    if(mode==='failed')return {provider:pinned.provider,model:pinned.model,status:'failed',providerJobId:'failed-'+crypto.randomUUID()};
    return {provider:pinned.provider,model:pinned.model,status:'queued',providerJobId:'fal-lyria3-pro:'+crypto.randomUUID()};},
   async getStatus(jobId){pollCalls++;if(fail.revokeOnPoll)await db.query('update public.admin_members set active=false where user_id=$1',[userId]);calls.push({pollJob:jobId,pinned:{provider:pinned.provider,model:pinned.model}});if(fail.query)throw new Error('private provider query error');return {provider:pinned.provider,model:pinned.model,status:'completed',providerJobId:jobId,audioUrl:'https://audio.isolated.example/song.wav',mimeType:'audio/wav'};}
  };
 }};
 function load(filename) {
  const full=path.resolve(filename);if(cache.has(full))return cache.get(full);
  const exports={};cache.set(full,exports);
  const compiled=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const globals={Buffer,process:{env},crypto,fetch:fetcher,URL,Response,Request,AbortSignal,console};
  const requireModule=name=>{
   if(name==='server-only')return {};
   if(name==='@waffo/pancake-ts')return waffoSdk;
   if(name==='node:crypto')return {createHash};
   if(name==='next/server')return {NextResponse:Response};
   if((name==='@/lib/auth/server' || name==='@/lib/http-error' || name==='./server'))return {HttpError,authRoute:async(request,handler)=>{
    const id=request.headers.get('x-fixture-user');if(!id)return json({error:'Please sign in.'},401);
    try{return await handler({user:{id,email:'owner@isolated.example',email_confirmed_at:'2026-11-06'},supabase:client});}catch(e){return json({error:e instanceof HttpError?e.message:'Request failed'},e instanceof HttpError?e.status:500);}
   }};
   if(name==='@/lib/supabase/admin'||name==='./admin')return {getSupabaseAdmin:()=>client};
   if(name==='@/lib/providers/factory')return providerFactory;
   if(name==='@/lib/admin/order-detail')return {assertAdminOrderId:id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(404,'missing');}};
   let next=name.startsWith('@/')?path.join(process.cwd(),'src',name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(full),name):null;
   if(next){if(!existsSync(next))next+='.ts';return load(next);}
   throw new Error('Unexpected import '+name);
  };
  vm.runInNewContext('(function(exports,require){'+compiled+'\n})',globals)(exports,requireModule);return exports;
 }
 async function order({owner=userId,paid=false,legacy=false}={}) {
  const id=crypto.randomUUID();await db.query("insert into public.song_orders(id,user_id,status,recipient_name,occasion,story,mood,style,lyrics_text) values ($1,$2,'lyrics_ready','Emma','Birthday','Private story','Warm','Acoustic','[Verse] This is the confirmed song for Emma.')",[id,owner]);
  if(paid){await rpc('prepare_songgift_checkout',{p_order_id:id,p_user_id:owner,p_amount_minor:999,p_environment:'sandbox',p_price_version:'v1'});await rpc('bind_songgift_checkout',{p_order_id:id,p_user_id:owner,p_paypal_order_id:'PP-'+id});await rpc('record_songgift_capture',{p_order_id:id,p_user_id:owner,p_paypal_order_id:'PP-'+id,p_capture_id:'CAP-'+id,p_environment:'sandbox',p_amount_minor:999,p_currency:'USD',p_occurred_at:'2026-11-06T00:00:00Z'});}
  if(legacy)await db.query("update public.song_orders set paid_at=now(),paypal_order_id='OLD-'||id where id=$1",[id]);return id;
 }
 async function rpc(name,body){const response=await transport('https://isolated.supabase.invalid/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.message);return data;}
 async function request(file,method,body,id=userId,params={},query='') {
  const request=new Request('http://localhost'+query,{method,headers:{'Content-Type':'application/json',...(id?{'x-fixture-user':id}:{})},...(method!=='GET'?{body:JSON.stringify(body)}:{})});
  return load(file)[method](request,{params:Promise.resolve(params)});
 }
 return {db,env,calls,objects,paypal,sentEmails,waffoSessions,identity,load,order,rpc,request,transport:fetcher,setMode:value=>{mode=value;},setFail:value=>{fail=value;},get lyricsCalls(){return lyricsCalls;},get generateCalls(){return generateCalls;},get pollCalls(){return pollCalls;},close:()=>db.close()};
}
