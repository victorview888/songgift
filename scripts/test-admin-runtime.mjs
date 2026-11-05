import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Isolated loopback Auth/PostgREST transport for HTTP and browser checks. The
// role table is real in-memory PostgreSQL; Auth identities/OTP are test doubles.
// Neither mode reads .env files or accepts an external target.
const fixtureOrigin = "http://127.0.0.1:54329";
const ownerId = "a3f10454-1234-4234-8234-012345678901";
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
  await change({active:false});response=await owner("/api/admin/session");assert.equal(response.status,403);response=await owner("/admin");html=await response.text();assert.doesNotMatch(html,/后台访问已开启/);pass("revoking membership blocks the next request with the same session");
  assert.equal((await owner("/api/admin/orders")).status,403);
  response=await owner("/admin/orders");assert.doesNotMatch(await response.text(),/Fixture recipient|buyer@admin-test/);
  await change({mode:"missing"});response=await owner("/api/admin/session");assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PGRST|service_role|isolated-service-role/);response=await owner("/admin");html=await response.text();assert.doesNotMatch(html,/后台访问已开启/);assert.ok(html.includes("暂时无法验证后台访问权限"));pass("missing membership migration fails closed in API and page");
  assert.equal((await owner("/api/admin/orders")).status,503);
  response=await owner("/admin/orders");html=await response.text();assert.match(html,/暂时无法验证后台访问权限/);assert.doesNotMatch(html,/Fixture recipient|buyer@admin-test/);
  await change({active:true});response=await owner("/api/auth/signout","POST",{});assert.equal(response.status,200);assert.equal((await owner("/api/admin/session")).status,401);pass("sign-out removes administrator session access");
  response=await anonymous("/robots.txt");assert.match(await response.text(),/Disallow: \/admin/);pass("admin routes are excluded from the crawl list");
  console.log(`${passed} isolated runtime checks passed against ${base}; real Auth delivery and production role grants were not performed.`);
}

try {if(process.argv[2]==="serve")await serve();else if(process.argv[2]==="test")await checks();else throw new Error("Use serve or test; see docs/admin-access.md");}
catch(error){console.error(error instanceof Error?error.message:"Admin runtime test failed");process.exitCode=1;}
