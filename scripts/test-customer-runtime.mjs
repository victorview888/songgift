import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fixture,userId,otherId,wav } from '../tests/helpers/customer-fixture.mjs';

// Loopback-only, fake credentials and disposable in-memory data. No .env reads.
const origin='http://127.0.0.1:54330';
const people=[{id:userId,email:'owner@isolated.example'},{id:otherId,email:'other@isolated.example'}];
async function serve() {
 const f=await fixture(),tokens=new Map(),jobs=new Set();let submissions=0,queries=0;
 const authUser=user=>({...user,aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-11-06T00:00:00Z',created_at:'2026-11-06T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},identities:[]});
 const session=user=>{
  const now=Math.floor(Date.now()/1000),token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600},'isolated-signature'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
  tokens.set(token,user);return {access_token:token,token_type:'bearer',expires_in:3600,expires_at:now+3600,refresh_token:'isolated-'+user.id,user:authUser(user)};
 };
 const server=createServer(async(req,res)=>{
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  try {
   const url=new URL(req.url,origin);let raw=Buffer.alloc(0);for await(const part of req){raw=Buffer.concat([raw,part]);if(raw.length>48*1024*1024)return json(413,{error:'Fixture request too large'});}
   const body=raw.length&&req.headers['content-type']?.includes('json')?JSON.parse(raw.toString()):{};
   if(url.pathname==='/__fixture__/health')return json(200,{fixture:'songgift-customer-loopback',submissions,queries});
   if(url.pathname==='/__fixture__/seed'&&req.method==='POST') {
    const draft=await f.order(),paid=await f.order({paid:true}),foreign=await f.order({owner:otherId,paid:true});
    if(body.growth){
     await f.db.query('insert into public.admin_members(user_id) values($1) on conflict(user_id) do update set active=true',[userId]);
     await f.db.query("update song_orders set title='A Song for Emma',status='completed' where id=$1",[paid]);
     await f.db.query("insert into song_assets(order_id,storage_path,mime_type,provider,model_id,is_final) values($1,$2,'audio/wav','fal','isolated-model',true)",[paid,paid+'/gift.wav']);
     f.objects.set('songs/'+paid+'/gift.wav',wav());
     return json(200,{draft,paid,foreign});
    }
    if(body.account){
     const legacy=await f.order({legacy:true}),quoted=await f.order();await f.rpc('prepare_songgift_checkout',{p_order_id:quoted,p_user_id:userId,p_amount_minor:1299,p_environment:'live',p_price_version:'isolated-old-price'});
     await f.db.query("insert into public.payment_transactions(order_id,provider,environment,transaction_type,external_id,amount_minor,currency,occurred_at) values($1,'paypal','sandbox','refund',$2,400,'USD',now())",[paid,'REF-'+crypto.randomUUID()]);
     for(let i=0;i<11;i++)await f.order({legacy:true});return json(200,{draft,paid,foreign,legacy,quoted});
    }
    if(body.admin)await f.db.query('insert into public.admin_members(user_id) values($1) on conflict(user_id) do update set active=true',[userId]);return json(200,{draft,paid,foreign});
   }
   if(url.pathname==='/__fixture__/usage')return json(200,{events:(await f.db.query('select event,page,first_source,last_source,medium,campaign from usage_events order by id')).rows,attributions:(await f.db.query('select count(*)::int n from song_order_attribution')).rows[0].n});
   if(url.pathname==='/__fixture__/membership'&&req.method==='POST'){await f.db.query('update admin_members set active=$1 where user_id=$2',[body.active===true,userId]);return json(200,{ok:true});}
   if(url.pathname==='/__fixture__/stories'){const requestId=url.searchParams.get('requestId');const rows=(await f.db.query('select request_id,order_id,state from public.song_story_requests where request_id=$1',[requestId])).rows;return json(200,{requests:rows});}
   if(url.pathname==='/__fixture__/fault'&&req.method==='POST'){f.setFail(body);return json(200,{ok:true});}
   if(url.pathname==='/__fixture__/due'&&req.method==='POST'){await f.db.query("update public.generation_jobs set next_check_at=now()-interval '1 second' where id=$1",[body.jobId]);return json(200,{ok:true});}
   if(url.pathname==='/__fixture__/inspect'){
    const orderId=url.searchParams.get('orderId');
    const order=(await f.db.query('select status,active_generation_job_id from public.song_orders where id=$1',[orderId])).rows[0];
    const notices=(await f.db.query('select status,attempts from public.song_notification_outbox where order_id=$1',[orderId])).rows;
    const audit=(await f.db.query('select action,result from public.admin_audit_logs where order_id=$1 order by created_at',[orderId])).rows;
    return json(200,{order,notices,audit,submissions,queries});
   }
   if(url.pathname==='/auth/v1/otp')return json(200,{});
   if(url.pathname==='/auth/v1/verify') {
    const user=people.find(p=>p.email===body.email);if(!user||body.token!=='123456')return json(400,{message:'Invalid fixture code'});return json(200,session(user));
   }
   if(url.pathname==='/auth/v1/user') {
    const user=tokens.get((req.headers.authorization||'').replace(/^Bearer /,''));return user?json(200,authUser(user)):json(401,{message:'Fixture sign-in required'});
   }
   if(url.pathname==='/auth/v1/logout')return json(200,{});
   if(url.pathname==='/music-fixture'&&req.method==='POST') {
    assert.equal(req.headers.authorization,'Bearer isolated-google-token');assert.ok(body.input?.[0]?.text?.includes('Approved lyrics:'));
    const id='isolated-'+crypto.randomUUID();jobs.add(id);submissions++;return json(200,{id,status:'processing'});
   }
   if(url.pathname.startsWith('/music-fixture/')&&req.method==='GET') {
    const id=url.pathname.split('/').at(-1);if(!jobs.has(id))return json(404,{error:'No fixture song'});queries++;return json(200,{id,status:'completed',audio:wav().toString('base64')});
   }
   if(url.pathname.startsWith('/storage/v1/object/sign/')) {
    const key=decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/'.length));
    if(!f.objects.has(key))return json(404,{message:'No fixture audio'});
    if(req.method==='POST')return json(200,{signedURL:'/object/sign/'+key+'?token=isolated'});
    res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'private, no-store'});return res.end(f.objects.get(key));
   }
   const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(bearer!=='isolated-service-role'&&!tokens.has(bearer))return json(403,{message:'Fixture credentials required'});
   if(url.pathname==='/rest/v1/rpc/claim_my_songgift_orders')return json(200,null); // All seeded orders already have owners.
   const input='https://isolated.supabase.invalid'+url.pathname+url.search;
   const response=await f.transport(input,{method:req.method,headers:req.headers,...(raw.length?{body:req.headers['content-type']?.includes('json')?raw.toString():raw}:{})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error){json(500,{error:'Isolated fixture failed',code:error.code||'fixture_error'});}
 });
 await new Promise(resolve=>server.listen(54330,'127.0.0.1',resolve));console.log('Customer fixture ready at '+origin);
 const close=()=>{server.close();f.close().finally(()=>process.exit(0));};process.on('SIGTERM',close);process.on('SIGINT',close);
}
export async function run(base=process.env.SONGGIFT_CUSTOMER_TEST_URL||'http://localhost:3002') {
 const url=new URL(base);assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Only loopback application targets are permitted');
 const health=await (await fetch(origin+'/__fixture__/health')).json();assert.equal(health.fixture,'songgift-customer-loopback');
 const seed=await (await fetch(origin+'/__fixture__/seed',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
 const jar=new Map();let checks=0;const ok=label=>{checks++;console.log('PASS '+label);};
 async function request(path,method='GET',body,login=true) {
  const response=await fetch(base+path,{method,headers:{...(login?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{}),...(method==='GET'?{}:{'Content-Type':'application/json',Origin:base})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});
  for(const value of response.headers.getSetCookie()){const [name,token]=value.split(';')[0].split('=');jar.set(name,token);}
  return response;
 }
 assert.equal((await request('/api/orders/'+seed.paid,'GET',null,false)).status,401);ok('Signed-out access rejected');
 assert.equal((await request('/api/auth/verify','POST',{email:people[0].email,code:'123456'})).status,200);ok('Isolated email-code session established');
 const quoted=await request('/api/paypal/quote','POST',{orderId:seed.draft});assert.equal(quoted.status,200,await quoted.clone().text());assert.equal((await quoted.json()).checkoutPrice.value,'9.99');ok('Quote frozen through the actual customer route');
 assert.equal((await request('/api/music','POST',{orderId:seed.draft})).status,402);ok('Unpaid music request rejected');
 for(const path of ['/api/orders/'+seed.foreign,'/api/music/status/unknown?orderId='+seed.foreign])assert.equal((await request(path)).status,404);ok('Cross-account order/task access rejected');
 const before=await (await fetch(origin+'/__fixture__/health')).json();
 const starts=await Promise.all([request('/api/music','POST',{orderId:seed.paid}),request('/api/music','POST',{orderId:seed.paid})]);assert.ok(starts.every(r=>r.status===200));const job=await starts[0].json();ok('Concurrent customer starts accepted without duplicate submission');
 const afterStart=await (await fetch(origin+'/__fixture__/health')).json();assert.equal(afterStart.submissions-before.submissions,1);ok('Exactly one simulated music submission');
 const result=await request('/api/music/status/'+job.generationJobId+'?orderId='+seed.paid);assert.equal(result.status,200,await result.clone().text());const complete=await result.json();assert.equal(complete.status,'completed');assert.equal(complete.lease_token,undefined);assert.equal(complete.audioBase64,undefined);ok('Audio cached, stored and atomically completed');
 const loaded=await (await request('/api/orders/'+seed.paid)).json();assert.equal(loaded.order.status,'completed');assert.equal(loaded.order.song_assets.length,1);ok('Completed song appears in the private order');
 const audio=await request('/api/orders/'+seed.paid+'/audio');assert.equal(audio.status,302);const bytes=await fetch(audio.headers.get('location'));assert.equal(bytes.status,200);assert.equal(Buffer.from(await bytes.arrayBuffer()).toString('ascii',0,4),'RIFF');ok('Private playback link serves the isolated WAV');
 const replay=await request('/api/music','POST',{orderId:seed.paid});assert.equal((await replay.json()).status,'completed');const end=await (await fetch(origin+'/__fixture__/health')).json();assert.equal(end.submissions-before.submissions,1);ok('Completed replay never submits a new song');
 assert.match(result.headers.get('cache-control'),/private.*no-store/);ok('Private responses prohibit caching');
 console.log(checks+' runtime checks passed');return {seed,jar};
}
if(process.argv[2]==='serve')await serve();else if(process.argv[2]==='test')await run();
