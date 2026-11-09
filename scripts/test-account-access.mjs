import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const requireApp = createRequire(path.join(process.cwd(), 'package.json'));
const { createClient } = requireApp('@supabase/supabase-js');
const fixtureDirectory = path.join(process.cwd(), '.account-test-fixtures');
fs.mkdirSync(fixtureDirectory, {recursive:true});
const fixtureFile = path.join(fixtureDirectory, 'account-fixtures.private.json');
const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const base = process.env.SONGGIFT_INTEGRATION_URL || 'http://127.0.0.1:8787';
const save = (f) => fs.writeFileSync(fixtureFile,JSON.stringify(f),{mode:0o600});
const read = () => JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
function check(result, label) { if(result.error) throw new Error(label+': '+result.error.message); return result.data; }
async function code(f, who='a') {
  const data=check(await admin.auth.admin.generateLink({ type:'magiclink', email:f[who].email }), 'Generate isolated test login token');
  f[who].code=data.properties.email_otp; save(f);
}
async function init() {
  assert.ok(url && publicKey && process.env.SUPABASE_SERVICE_ROLE_KEY,'Supabase configuration is required');
  assert.ok(!fs.existsSync(fixtureFile),'Existing fixtures must be reused or cleaned up first');
  const tag=randomUUID().slice(0,8);
  const f={tag,orders:[],assetId:randomUUID(),path:`qa-account-tests/${tag}/download-check.wav`,a:{email:`songgift-qa-${tag}-a@example.com`},b:{email:`songgift-qa-${tag}-b@example.com`}};
  save(f);
  for (const who of ['a','b']) {
    const data=check(await admin.auth.admin.createUser({ email:f[who].email, email_confirm:true, user_metadata:{ purpose:'Disposable SongGift account isolation test', fixture:tag } }), 'Create test identity');
    f[who].id=data.user.id; save(f);
  }
  f.draftId=randomUUID(); f.audioId=randomUUID(); f.otherId=randomUUID(); f.orders=[f.draftId,f.audioId,f.otherId]; save(f);
  const common={recipient_name:'QA test recipient',relationship:'Friend',occasion:'Just because',story:'Disposable account isolation fixture. Not a customer song.',mood:'Warm',style:'Acoustic pop',lyrics_text:'[Verse]\nThis is a temporary verification fixture.\n[Chorus]\nNo real song generation or payment was made.'};
  check(await admin.from('song_orders').insert([
    {...common,id:f.draftId,user_id:null,email:f.a.email.toUpperCase(),status:'lyrics_ready',title:'QA — Saved lyrics check (temporary)'},
    {...common,id:f.audioId,user_id:null,email:f.a.email,status:'completed',title:'QA — Download check (temporary)'},
    {...common,id:f.otherId,user_id:f.b.id,email:f.b.email,status:'lyrics_ready',title:'QA — Other account private draft'},
  ]),'Create disposable orders');
  const rate=8000, samples=3200, wav=Buffer.alloc(44+samples*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*440)*1800),44+i*2);
  check(await admin.storage.from('songs').upload(f.path,wav,{contentType:'audio/wav'}),'Upload explicitly labelled test tone');
  check(await admin.from('song_assets').insert({id:f.assetId,order_id:f.audioId,storage_bucket:'songs',storage_path:f.path,mime_type:'audio/wav',provider:'qa-test-tone',model_id:'not-generated',is_final:true}),'Record disposable audio');
  await code(f); console.log('Prepared two isolated Auth identities, three disposable orders and a short WAV test tone. No email, music generation or payment was requested.');
}
function mergeCookies(jar, response) {
  for(const line of response.headers.getSetCookie()) {
    const first=line.split(';')[0], at=first.indexOf('=');
    const name=first.slice(0,at),value=first.slice(at+1);
    if(/max-age=0/i.test(line)||!value)delete jar[name];else jar[name]=value;
  }
}
function sessionClient(jar={}) {
  return async (path, method='GET', body, origin=base) => {
    const headers={};if(Object.keys(jar).length)headers.Cookie=Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');
    if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json'}
    const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(30000)});mergeCookies(jar,r);return r;
  };
}
async function tests() {
  const f=read(); let passed=0;
  const ok=(label)=>{passed++;console.log('PASS '+label)};
  const anonymous=sessionClient();
  for(const path of ['/api/orders',`/api/orders/${f.audioId}`,`/api/orders/${f.audioId}/audio?download=1`]) assert.equal((await anonymous(path)).status,401);
  assert.equal((await anonymous('/api/music','POST',{orderId:f.audioId})).status,401);ok('Anonymous visitors cannot read, download or generate songs');
  assert.equal((await anonymous('/api/auth/verify','POST',{email:f.a.email,code:'123456'},'https://untrusted.example')).status,403);ok('Cross-origin login submission is rejected');
  await code(f,'a');await code(f,'b');
  const jarA={}, jarB={}, a=sessionClient(jarA), b=sessionClient(jarB);
  let response=await a('/api/auth/verify','POST',{email:f.a.email,code:f.a.code,next:'//untrusted.example'});
  assert.equal(response.status,200,await response.clone().text());
  const verified=await response.json();assert.equal(verified.user.id,f.a.id);assert.equal(verified.next,'/my-songs');
  assert.ok(response.headers.getSetCookie().some(c=>/httponly/i.test(c)&&/samesite=lax/i.test(c)));
  if(base.startsWith('https:'))assert.ok(response.headers.getSetCookie().every(c=>/secure/i.test(c)));
  assert.match(response.headers.get('cache-control'),/no-store/);ok('Real Supabase one-time token establishes HttpOnly session and blocks open redirects');
  response=await b('/api/auth/verify','POST',{email:f.b.email,code:f.b.code});assert.equal(response.status,200,await response.clone().text());
  const list=await (await a('/api/orders')).json();assert.ok(list.orders.some(o=>o.id===f.audioId));assert.ok(list.orders.some(o=>o.id===f.draftId));assert.ok(!list.orders.some(o=>o.id===f.otherId));ok('Verified email recovers only its historical orders, including case-normalized email');
  const filtered=await (await a('/api/orders?filter=ready')).json();assert.equal(filtered.orders.length,1);assert.equal(filtered.orders[0].id,f.audioId);ok('Library status filtering returns saved songs');
  for(const path of [`/api/orders/${f.otherId}`,`/api/orders/${f.otherId}/audio`,`/api/orders/${f.otherId}/audio?download=1`])assert.equal((await a(path)).status,404);
  assert.equal((await a('/api/lyrics','POST',{orderId:f.otherId,recipientName:'Someone',occasion:'Birthday',story:'A sufficiently long private story for another account.'})).status,404);
  assert.equal((await a('/api/music','POST',{orderId:f.otherId})).status,404);
  assert.equal((await a('/api/paypal/create-order','POST',{orderId:f.otherId})).status,404);
  assert.equal((await a('/api/paypal/capture-order','POST',{paypalOrderId:'NO_SUCH_OWNED_CHECKOUT'})).status,404);
  assert.equal((await a('/api/music/status/arbitrary-job?orderId='+f.otherId)).status,404);ok('Other-account reads, downloads, lyrics changes, music and payment requests are rejected before provider calls');
  assert.equal((await a('/api/music','POST',{orderId:f.draftId})).status,402);
  const completed=await a('/api/music','POST',{orderId:f.audioId});assert.equal(completed.status,200);assert.equal((await completed.json()).status,'completed');ok('Unpaid drafts are blocked and completed songs do not request another generation');
  // Leased generation/persistence is covered by the isolated customer-operations
  // integration tests. This account check uses its existing disposable WAV asset.
  const edit=await a('/api/orders/'+f.draftId,'PATCH',{lyricsText:'[Verse]\nA saved lyric edit for a disposable test.\n[Chorus]\nThis change must survive a fresh page load.'});assert.equal(edit.status,200);
  const fresh=await (await a('/api/orders/'+f.draftId)).json();assert.ok(fresh.order.lyrics_text.includes('survive a fresh page load'));ok('Approved lyrics persist in the database');
  response=await a(`/api/orders/${f.audioId}/audio?download=1`);assert.equal(response.status,302);assert.match(response.headers.get('cache-control'),/no-store/);
  const audio=await fetch(response.headers.get('location'),{headers:{Range:'bytes=0-1023'}});assert.ok([200,206].includes(audio.status));assert.match(audio.headers.get('content-type'),/audio\/wav/);assert.match(audio.headers.get('content-disposition')||'',/attachment/);assert.ok((await audio.arrayBuffer()).byteLength>0);ok('Private signed download returns real WAV bytes with attachment disposition');
  const anon=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const anonOrders=await anon.from('song_orders').select('id');assert.ok(anonOrders.error||anonOrders.data.length===0);
  const authData=check(await admin.auth.admin.generateLink({type:'magiclink',email:f.a.email}),'RLS test token');
  check(await anon.auth.verifyOtp({email:f.a.email,token:authData.properties.email_otp,type:'email'}),'RLS identity');
  const forbidden=await anon.from('song_orders').select('id').eq('id',f.otherId);assert.equal(forbidden.error,null);assert.equal(forbidden.data.length,0);
  const write=await anon.from('song_orders').update({status:'completed'}).eq('id',f.otherId);assert.ok(write.error);ok('Database RLS independently isolates account records and prevents direct customer writes');
  response=await b('/api/auth/signout','POST',{});assert.equal(response.status,200);assert.equal((await b('/api/orders')).status,401);ok('Logout clears the session and protects subsequent requests');
  console.log(`${passed} account integration checks passed against ${base}. No paid generation, email delivery or payment was performed.`);
}
async function cleanup() {
  const f=read();
  for (const assetId of [f.assetId,...(f.extraAssets||[]).map(a=>a.id)].filter(Boolean)) check(await admin.from('song_assets').delete().eq('id',assetId),'Remove disposable asset record');
  const paths=[f.path,...(f.extraAssets||[]).map(a=>a.path)].filter(Boolean);if(paths.length)check(await admin.storage.from('songs').remove(paths),'Remove disposable audio');
  if(f.orders?.length)check(await admin.from('song_orders').delete().in('id',f.orders),'Remove disposable orders');
  for(const who of ['a','b'])if(f[who]?.id)check(await admin.auth.admin.deleteUser(f[who].id,true),'Soft-delete disposable identity');
  fs.unlinkSync(fixtureFile);console.log('Removed only the recorded disposable fixtures and their temporary login credentials.');
}
(async()=>{ const action=process.argv[2];if(action==='init')await init();else if(action==='test')await tests();else if(action==='code'){await code(read());console.log('Prepared a fresh test code without sending email.');}else if(action==='cleanup')await cleanup();else throw Error('Expected init, test, code or cleanup'); })().catch(e=>{console.error(e.message);process.exitCode=1});
