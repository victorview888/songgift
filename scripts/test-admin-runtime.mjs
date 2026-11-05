import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Isolated loopback Auth/PostgREST transport for HTTP and browser checks. The
// role table is real in-memory PostgreSQL; Auth identities/OTP are test doubles.
// Neither mode reads .env files or accepts an external target.
const fixtureOrigin = "http://127.0.0.1:54329";
const ownerId = "a3f10454-1234-4234-8234-012345678901";
const detailOrderId = "c3f10454-1234-4234-8234-000000000001";
const detailAssetId = "d3f10454-1234-4234-8234-000000000001";
const customerId = "b3f10454-1234-4234-8234-012345678902";
const identities = [
  { id: ownerId, email: "owner@admin-test.example" },
  { id: customerId, email: "customer@admin-test.example" },
];
const migration = readFileSync("supabase/migrations/20261105_admin_permissions.sql", "utf8");

async function serve() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);");
  for (const user of identities) await db.query("insert into auth.users(id) values ($1)",[user.id]);
  await db.exec(migration);
  const auditMigration=readFileSync("supabase/migrations/20261105_admin_audio_audit.sql","utf8");
  await db.exec(auditMigration);
  let signingCalls=0;
  let historyAvailable=true;
  const restore=async()=>{await db.exec(migration);await db.query("insert into public.admin_members(user_id,active) values ($1,true) on conflict(user_id) do update set active=true",[ownerId]);};
  await restore();
  const tokens = new Map();
  const authUser=(user)=>({...user,aud:"authenticated",role:"authenticated",email_confirmed_at:new Date().toISOString(),confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:"email"},user_metadata:{role:"owner",is_admin:true},identities:[]});
  const session=(user)=>{
    const now=Math.floor(Date.now()/1000);
    const access_token=[{alg:"HS256",typ:"JWT"},{sub:user.id,aud:"authenticated",role:"authenticated",iat:now,exp:now+3600},"isolated-signature"].map(part=>Buffer.from(typeof part==="string"?part:JSON.stringify(part)).toString("base64url")).join(".");
    tokens.set(access_token,user);
    return {access_token,token_type:"bearer",expires_in:3600,expires_at:now+3600,refresh_token:"fixture-refresh-"+user.id,user:authUser(user)};
  };
  const server=createServer(async(req,res)=>{
    const json=(status,body)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(status===204?undefined:JSON.stringify(body));};
    try {
      const url=new URL(req.url,fixtureOrigin);
      let body={};
      if(req.method!=="GET"&&req.method!=="HEAD") {let text="";for await(const chunk of req){text+=chunk;if(text.length>10000){json(413,{error:"Fixture request too large"});return;}}if(text)body=JSON.parse(text);}
      if(url.pathname==="/__fixture__/health")return json(200,{fixture:"songgift-admin-loopback",owner:identities[0].email,customer:identities[1].email});
      if(url.pathname==="/__fixture__/history" && req.method==="POST") {historyAvailable=body.available!==false;return json(200,{ok:true});}
      if(url.pathname==="/__fixture__/audit" && req.method==="POST") {
        if(body.mode==="missing")await db.exec("drop table public.admin_audit_logs");
        else {await db.exec(auditMigration);if(body.mode==="reset"){await db.exec("truncate public.admin_audit_logs");signingCalls=0;}}
        return json(200,{ok:true});
      }
      if(url.pathname==="/__fixture__/audit" && req.method==="GET") {
        const rows=await db.query("select request_id,actor_user_id,action,target_type,target_id,order_id,result from public.admin_audit_logs order by created_at");
        return json(200,{rows:rows.rows,signingCalls});
      }
      if(url.pathname==="/rest/v1/admin_audit_logs") {
        if(req.headers.authorization!=="Bearer isolated-service-role")return json(403,{message:"Fixture audit requires service role"});
        try {
          if(req.method==="GET") {
            const rows=await db.query("select id,actor_user_id,action,target_type,target_id,result,null as reason_code,null as error_code,created_at,null as completed_at from public.admin_audit_logs where order_id=$1 order by created_at desc limit 51",[(url.searchParams.get("order_id")||"").replace(/^eq\./,"")]);
            return json(200,rows.rows);
          }
          if(req.method==="POST") {
            await db.query("insert into public.admin_audit_logs(request_id,actor_user_id,action,target_type,target_id,order_id,result) values ($1,$2,$3,$4,$5,$6,$7)",[body.request_id,body.actor_user_id,body.action,body.target_type,body.target_id,body.order_id,body.result]);
            return json(201,null);
          }
          if(req.method==="PATCH") {
            const result=await db.query("update public.admin_audit_logs set result=$1 where request_id=$2 returning request_id",[body.result,(url.searchParams.get("request_id")||"").replace(/^eq\./,"")]);
            return json(200,result.rows);
          }
        } catch {return json(404,{message:"Fixture audit unavailable"});}
      }
      if(url.pathname==="/rest/v1/song_assets") {
        if(req.headers.authorization!=="Bearer isolated-service-role")return json(403,{message:"Fixture asset requires service role"});
        const matches=url.searchParams.get("id")==="eq."+detailAssetId && url.searchParams.get("order_id")==="eq."+detailOrderId && url.searchParams.get("is_final")==="eq.true";
        return json(200,matches?[{id:detailAssetId,order_id:detailOrderId,storage_bucket:"songs",storage_path:"fixture/audio.mp3",mime_type:"audio/mpeg"}]:[]);
      }
      if(url.pathname==="/storage/v1/object/sign/songs/fixture/audio.mp3" && req.method==="POST") {
        if(req.headers.authorization!=="Bearer isolated-service-role")return json(403,{message:"Fixture signing requires service role"});
        assert.equal(body.expiresIn,60);signingCalls++;
        return json(200,{signedURL:"/object/sign/songs/fixture/audio.mp3?token=isolated-audio"});
      }
      if(url.pathname==="/__fixture__/membership"&&req.method==="POST") {
        if(body.mode==="missing")await db.exec("drop table public.admin_members");
        else {await restore();if(body.active===false)await db.query("update public.admin_members set active=false where user_id=$1",[ownerId]);}
        return json(200,{ok:true});
      }
      if(url.pathname==="/auth/v1/otp")return json(200,{});
      if(url.pathname==="/auth/v1/verify") {
        const user=identities.find(u=>u.email===body.email);
        return user&&body.token==="123456"?json(200,session(user)):json(403,{msg:"Invalid isolated test code",code:"otp_expired"});
      }
      if(url.pathname==="/auth/v1/token") {
        const user=identities.find(u=>body.refresh_token==="fixture-refresh-"+u.id);
        return user?json(200,session(user)):json(403,{msg:"Invalid isolated test session"});
      }
      if(url.pathname==="/auth/v1/user") {
        const user=tokens.get((req.headers.authorization||"").replace(/^Bearer /,""));
        return user?json(200,authUser(user)):json(401,{msg:"No test session",code:"bad_jwt"});
      }
      if(url.pathname==="/auth/v1/logout")return json(204,null);
      if(url.pathname==="/rest/v1/rpc/claim_my_songgift_orders")return json(204,null);
      if(url.pathname==="/rest/v1/admin_members") {
        if(req.headers.authorization!=="Bearer isolated-service-role")return json(403,{code:"42501",message:"Fixture membership requires service role"});
        const id=(url.searchParams.get("user_id")||"").replace(/^eq\./,"");
        try {const data=await db.query("select user_id,role,active from public.admin_members where user_id=$1",[id]);return json(200,data.rows);}
        catch {return json(404,{code:"PGRST205",message:"Fixture membership table unavailable"});}
      }
      if(url.pathname==="/rest/v1/song_orders" && req.method==="GET") {
        if(req.headers.authorization!=="Bearer isolated-service-role")return json(403,{message:"Fixture orders require service role"});
        let rows=Array.from({length:25},(_,i)=>({
          id:`c3f10454-1234-4234-8234-${String(i+1).padStart(12,"0")}`,user_id:customerId,
          email:i===0?"buyer_one@admin-test.example":"buyer@admin-test.example",
          recipient_name:"Fixture recipient "+(i+1),occasion:"birthday",status:i%2===0?"completed":"generating",
          paid_at:i%2===0?"2026-11-05T01:00:00Z":null,created_at:`2026-11-05T00:${String(i).padStart(2,"0")}:00Z`,
          paypal_order_id:"FIXTURE"+i,music_provider:"fal",music_model:"isolated-model",final_assets:i%2===0?[{id:"fixture-asset-"+i}]:[]
        }));
        if(url.searchParams.get("select")?.includes(",story,"))rows=rows.map(row=>({...row,
          relationship:"friend",story:"Fixture private story <script>test</script>",mood:"warm",style:"pop",title:"Fixture song",lyrics_text:"Fixture private lyrics\nSecond line",provider_job_id:"fixture-job-1",updated_at:row.created_at,
          song_assets:row.id===detailOrderId?[{id:detailAssetId,asset_type:"final",mime_type:"audio/mpeg",duration_seconds:null,provider:"fal",model_id:"isolated-model",provider_job_id:"fixture-job-1",is_final:true,created_at:"2026-11-05T01:20:00Z"}]:[]
        }));
        if(url.searchParams.get("select")?.includes("quoted_amount_minor")) {
          if(!historyAvailable)return json(404,{message:"Fixture operations schema unavailable"});
          rows=rows.map(row=>({id:row.id,created_at:row.created_at,quoted_amount_minor:row.id===detailOrderId?100:null,currency:row.id===detailOrderId?"USD":null,payment_environment:row.id===detailOrderId?"live":null,price_version:row.id===detailOrderId?"isolated-v1":null,quoted_at:row.id===detailOrderId?row.created_at:null,
            payment_transactions:row.id===detailOrderId?[{id:"f3f10454-1234-4234-8234-000000000001",provider:"paypal",environment:"live",transaction_type:"capture",external_id:"ISOLATED-CAPTURE",amount_minor:100,currency:"USD",fee_minor:null,occurred_at:"2026-11-05T01:00:00Z"}]:[],
            generation_jobs:row.id===detailOrderId?[{id:"e3f10454-1234-4234-8234-000000000001",attempt_no:1,environment:"test",provider:"fal",model:"isolated-model",provider_job_id:"fixture-job-1",state:"completed",poll_count:1,error_code:null,final_asset_id:detailAssetId,started_at:"2026-11-05T01:10:00Z",completed_at:"2026-11-05T01:20:00Z"}]:[],
            order_events:row.id===detailOrderId?[{id:"e3f10454-1234-4234-8234-000000000002",event_type:"payment.captured",actor_type:"customer",actor_id:customerId,reference_id:"f3f10454-1234-4234-8234-000000000001",state:null,created_at:"2026-11-05T01:00:00Z"}]:[]
          }));
        }
        for(const [key,value] of url.searchParams) {
          if(["id","paypal_order_id","music_provider","status"].includes(key))rows=rows.filter(r=>r[key]===value.replace(/^eq\./,""));
          if(key==="email")rows=rows.filter(r=>r.email.toLowerCase()===value.replace(/^ilike\./,"").replace(/\\([_%\\])/g,"$1").toLowerCase());
          if(key==="paid_at")rows=rows.filter(r=>value==="is.null"?!r.paid_at:!!r.paid_at);
          if(key==="created_at")rows=rows.filter(r=>value.startsWith("gte.")?r.created_at>=value.slice(4):r.created_at<value.slice(3));
          if(key==="final_assets")rows=rows.filter(r=>r.final_assets.length===0);
        }
        if(url.searchParams.get("select")?.includes("!inner"))rows=rows.filter(r=>r.final_assets.length>0);
        rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
        const total=rows.length,offset=Number(url.searchParams.get("offset")||0),limit=Number(url.searchParams.get("limit")||20);
        rows=rows.slice(offset,offset+limit);
        res.setHeader("Content-Range",`${offset}-${offset+rows.length-1}/${total}`);
        return json(200,rows);
      }
      return json(404,{error:"Unexpected isolated transport request",path:url.pathname});
    } catch {json(500,{error:"Isolated fixture failed"});}
  });
  server.listen(54329,"127.0.0.1",()=>console.log("Isolated admin transport ready at "+fixtureOrigin+". Test-only OTP: 123456. No external services used."));
  process.on("SIGINT",()=>{server.close();void db.close().finally(()=>process.exit(0));});
}

async function checks() {
  const base=process.env.SONGGIFT_ADMIN_TEST_URL||"http://localhost:3002";
  const target=new URL(base);
  assert.ok(["127.0.0.1","localhost"].includes(target.hostname)&&target.protocol==="http:","Runtime checks only allow an isolated loopback website");
  const health=await fetch(fixtureOrigin+"/__fixture__/health");assert.equal((await health.json()).fixture,"songgift-admin-loopback");
  const change=(body)=>fetch(fixtureOrigin+"/__fixture__/membership",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  await change({active:true});
  await fetch(fixtureOrigin+"/__fixture__/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"reset"})});
  let passed=0;const pass=(label)=>{passed++;console.log("PASS "+label);};
  function client(){const jar={};return async(path,method="GET",body,origin=base)=>{
    const headers={Cookie:Object.entries(jar).map(([k,v])=>k+"="+v).join("; ")};
    if(method!=="GET"){headers.Origin=origin;headers["Content-Type"]="application/json";}
    const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(30000)});
    for(const cookie of response.headers.getSetCookie()){const first=cookie.split(";")[0],i=first.indexOf("="),key=first.slice(0,i),value=first.slice(i+1);if(!value||/max-age=0/i.test(cookie))delete jar[key];else jar[key]=value;}
    return response;
  };}
  async function signIn(request,email){const response=await request("/api/auth/verify","POST",{email,code:"123456",next:"/admin"});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).next,"/admin");}
  const anonymous=client(),customer=client(),owner=client();
  let response=await anonymous("/api/admin/session");assert.equal(response.status,401);assert.match(response.headers.get("cache-control"),/no-store/);pass("anonymous admin API is private and unauthorized");
  response=await anonymous("/admin");let html=await response.text();assert.ok([307,308].includes(response.status)||html.includes("/login?next=%2Fadmin"));assert.doesNotMatch(html,/owner@admin-test.example/);pass("unsigned admin page redirects without privileged render data");
  await signIn(customer,identities[1].email);response=await customer("/api/admin/session");assert.equal(response.status,403);pass("verified customer cannot grant access with forged Auth metadata");
  response=await customer("/admin");html=await response.text();assert.doesNotMatch(html,/owner@admin-test.example/);assert.ok(html.includes("无法访问这个后台页面")||response.status===404);pass("ordinary user cannot render the administrator shell");
  await signIn(owner,identities[0].email);response=await owner("/api/admin/session");assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).admin.userId,ownerId);pass("active owner receives server-checked identity");
  response=await owner("/admin");html=await response.text();assert.equal(response.status,200);assert.ok(html.includes("后台访问已开启"));assert.ok(html.includes(identities[0].email));assert.match(html,/noindex/);assert.match(response.headers.get("cache-control"),/private|no-store/);pass("owner page is dynamic, private, non-indexable and server-rendered");
  for(const [request,status] of [[anonymous,401],[customer,403]]) {
    response=await request("/api/admin/orders");assert.equal(response.status,status);
    response=await request("/admin/orders");html=await response.text();assert.doesNotMatch(html,/Fixture recipient|buyer@admin-test/);
  }
  pass("orders API and SSR page deny unsigned and ordinary customer access");
  response=await owner("/api/admin/orders?page=2");let orders=await response.json();assert.equal(response.status,200);assert.equal(orders.total,25);assert.equal(orders.orders.length,5);assert.match(response.headers.get("cache-control"),/private.*no-store/);
  response=await owner("/api/admin/orders?delivery=delivered&payment=recorded&provider=fal&from=2026-11-05&to=2026-11-05");orders=await response.json();assert.equal(orders.total,13);assert.ok(orders.orders.every(o=>o.hasFinalAudio&&o.paid_at));
  response=await owner("/api/admin/orders?searchBy=email&q=buyer_one%40admin-test.example");orders=await response.json();assert.equal(orders.total,1);
  response=await owner("/api/admin/orders?page=0");assert.equal(response.status,400);
  response=await owner("/admin/orders?page=2");html=await response.text();assert.equal(response.status,200);assert.match(html,/Fixture recipient/);assert.match(html,/noindex/);assert.match(response.headers.get("cache-control"),/private|no-store/);
  pass("owner order list filters, exact search, server pagination and private SSR work");
  const detailPath="/api/admin/orders/"+detailOrderId;
  const audioPath=detailPath+"/audio/"+detailAssetId;
  for(const [request,status] of [[anonymous,401],[customer,403]]) {
    for(const path of [detailPath,audioPath])assert.equal((await request(path)).status,status);
    response=await request("/admin/orders/"+detailOrderId);html=await response.text();assert.doesNotMatch(html,/Fixture private story|Fixture private lyrics/);
  }
  response=await owner(detailPath);const detail=await response.json();assert.equal(response.status,200);assert.match(detail.order.story,/Fixture private story/);assert.equal(detail.assets.length,1);assert.doesNotMatch(JSON.stringify(detail),/storage_path|storage_bucket|signedUrl|isolated-audio/);
  assert.equal((await owner("/api/admin/orders/not-valid")).status,404);
  assert.equal((await owner("/api/admin/orders/c3f10454-1234-4234-8234-000000000099")).status,404);
  response=await owner("/admin/orders/"+detailOrderId+"?back="+encodeURIComponent("/admin/orders?page=2&provider=fal"));html=await response.text();assert.equal(response.status,200);assert.match(html,/Fixture private story/);assert.match(html,/&lt;script&gt;test&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>test<\/script>/);assert.match(html,/page=2(?:&amp;|&)provider=fal/);assert.match(html,/no-referrer/);assert.match(response.headers.get("cache-control"),/private|no-store/);
  pass("detail API and SSR enforce access, escape text, preserve list context and omit storage capabilities");
  const historyPath=detailPath+"/history";
  for(const [request,status] of [[anonymous,401],[customer,403]])assert.equal((await request(historyPath)).status,status);
  response=await owner(historyPath);const history=await response.json();assert.equal(response.status,200);assert.equal(history.quote.amountMinor,100);assert.equal(history.payments[0].external_id,"ISOLATED-CAPTURE");assert.equal(history.jobs[0].model,"isolated-model");assert.doesNotMatch(JSON.stringify(history),/lease_token|submission_key|storage_path|isolated-audio/);assert.match(response.headers.get("cache-control"),/private.*no-store/);
  const changeHistory=available=>fetch(fixtureOrigin+"/__fixture__/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({available})});
  await changeHistory(false);assert.equal((await owner(historyPath)).status,503);
  response=await owner("/admin/orders/"+detailOrderId);html=await response.text();assert.match(html,/Fixture private story/);assert.match(html,/订单处理记录暂不可用/);
  await changeHistory(true);response=await owner("/admin/orders/"+detailOrderId);html=await response.text();assert.match(html,/ISOLATED-CAPTURE/);assert.match(html,/生成尝试记录/);
  pass("operation history is private, capability-free, and schema outages preserve existing detail access");
  let audit=await (await fetch(fixtureOrigin+"/__fixture__/audit")).json();assert.equal(audit.signingCalls,0);
  response=await owner(audioPath);assert.equal(response.status,302);assert.match(response.headers.get("location"),/isolated-audio/);assert.equal(response.headers.get("referrer-policy"),"no-referrer");assert.match(response.headers.get("cache-control"),/private.*no-store/);
  response=await owner(audioPath+"?download=1");assert.equal(response.status,302);assert.match(response.headers.get("location"),/download=SongGift/);
  assert.equal((await owner("/api/admin/orders/c3f10454-1234-4234-8234-000000000002/audio/"+detailAssetId)).status,404);
  audit=await (await fetch(fixtureOrigin+"/__fixture__/audit")).json();assert.equal(audit.rows.length,2);assert.ok(audit.rows.every(row=>row.actor_user_id===ownerId&&row.order_id===detailOrderId&&row.result==="issued"));assert.equal(audit.signingCalls,2);assert.doesNotMatch(JSON.stringify(audit.rows),/isolated-audio|storage_path|Fixture private/);
  await fetch(fixtureOrigin+"/__fixture__/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"missing"})});
  response=await owner(audioPath);assert.equal(response.status,503);assert.equal(response.headers.get("location"),null);
  await fetch(fixtureOrigin+"/__fixture__/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
  audit=await (await fetch(fixtureOrigin+"/__fixture__/audit")).json();assert.equal(audit.signingCalls,2);
  pass("audio access is bound to the order, durably audited and fails closed when audit is missing");
  await change({active:false});response=await owner("/api/admin/session");assert.equal(response.status,403);response=await owner("/admin");html=await response.text();assert.doesNotMatch(html,/后台访问已开启/);pass("revoking membership blocks the next request with the same session");
  assert.equal((await owner(historyPath)).status,403);
  assert.equal((await owner(detailPath)).status,403);assert.equal((await owner(audioPath)).status,403);
  response=await owner("/admin/orders/"+detailOrderId);assert.doesNotMatch(await response.text(),/Fixture private story|Fixture private lyrics/);
  assert.equal((await owner("/api/admin/orders")).status,403);
  response=await owner("/admin/orders");assert.doesNotMatch(await response.text(),/Fixture recipient|buyer@admin-test/);
  await change({mode:"missing"});response=await owner("/api/admin/session");assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PGRST|service_role|isolated-service-role/);response=await owner("/admin");html=await response.text();assert.doesNotMatch(html,/后台访问已开启/);assert.ok(html.includes("暂时无法验证后台访问权限"));pass("missing membership migration fails closed in API and page");
  assert.equal((await owner(historyPath)).status,503);
  assert.equal((await owner(detailPath)).status,503);assert.equal((await owner(audioPath)).status,503);
  response=await owner("/admin/orders/"+detailOrderId);assert.doesNotMatch(await response.text(),/Fixture private story|Fixture private lyrics/);
  assert.equal((await owner("/api/admin/orders")).status,503);
  response=await owner("/admin/orders");html=await response.text();assert.match(html,/暂时无法验证后台访问权限/);assert.doesNotMatch(html,/Fixture recipient|buyer@admin-test/);
  await change({active:true});response=await owner("/api/auth/signout","POST",{});assert.equal(response.status,200);assert.equal((await owner("/api/admin/session")).status,401);pass("sign-out removes administrator session access");
  response=await anonymous("/robots.txt");assert.match(await response.text(),/Disallow: \/admin/);pass("admin routes are excluded from the crawl list");
  console.log(`${passed} isolated runtime checks passed against ${base}; real Auth delivery and production role grants were not performed.`);
}

try {if(process.argv[2]==="serve")await serve();else if(process.argv[2]==="test")await checks();else throw new Error("Use serve or test; see docs/admin-access.md");}
catch(error){console.error(error instanceof Error?error.message:"Admin runtime test failed");process.exitCode=1;}
