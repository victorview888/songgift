import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const requireApp = createRequire(path.join(process.cwd(), "package.json"));
const nextServer = requireApp("next/server");
const verified = (extra = {}) => ({ id: "a3f10454-1234-4234-8234-012345678901", email: "owner@example.com", email_confirmed_at: "2026-11-05T00:00:00Z", user_metadata: {}, ...extra });
const member = (extra = {}) => ({ user_id: verified().id, role: "owner", active: true, ...extra });

function fixture(options = {}) {
  const state = { user: verified(), membership: member(), dbError: null, authError: null, reads: [], handlers: 0, orderReads: 0, ...options };
  const modules = new Map();
  const context = vm.createContext({ URL, Request, Response, Headers, Map, console: { error() {} }, process: { env: { SUPABASE_URL: "https://test-project.supabase.invalid", SUPABASE_PUBLISHABLE_KEY: "test-public-key", ...options.env } } });
  const db = { from(table) {
    const query = { table };
    state.reads.push(query);
    return { select(columns) { query.columns = columns; return { eq(column, value) { query.filter = [column,value]; return { async maybeSingle() {
      if (state.dbThrows) throw new Error("PRIVATE DATABASE FAILURE");
      return { data: state.membership, error: state.dbError };
    } }; } }; } };
  } };
  const createServerClient = (_url, _key, config) => ({ auth: { async getUser() {
    if (state.authThrows) throw new Error("PRIVATE AUTH FAILURE");
    if (state.refreshCookie) config.cookies.setAll([{ name: "test-auth-cookie", value: "test-only-refresh", options: { path:"/", sameSite:"none", httpOnly:false, secure:false } }]);
    return { data: { user: state.user }, error: state.authError };
  } } });
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file,exports);
    const source=readFileSync(file,"utf8");
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const imports=(name)=> {
      if(name==="server-only")return {};
      if(name==="next/server")return nextServer;
      if(name==="next/headers")return {cookies:async()=>({getAll:()=>[]})};
      if(name==="@supabase/ssr")return {createServerClient};
      if(name==="@/lib/supabase/admin")return {getSupabaseAdmin:()=>db};
      if(name==="@/lib/admin/orders")return {parseOrderFilters:()=>({}),listAdminOrders:async()=>{state.orderReads++;return {orders:[],total:0,page:1,pageSize:20,totalPages:0};}};
      if(name==="@/lib/auth/admin")return load("src/lib/auth/admin.ts");
      if(name==="./server")return load("src/lib/auth/server.ts");
      if(name==="./redirect")return load("src/lib/auth/redirect.ts");
      if(name==="./admin")return load("src/lib/auth/admin.ts");
      throw new Error("Unexpected import: "+name);
    };
    vm.runInContext(`(function(exports,require){${compiled}\n})`,context)(exports,imports);
    return exports;
  }
  return { state, load, api:()=>load("src/app/api/admin/session/route.ts").GET(new Request("https://songgift.example/api/admin/session")) };
}

test("unsigned and unverified identities never reach membership lookup", async()=>{
  const f=fixture();
  for(const user of [null, verified({email_confirmed_at:null})]) await assert.rejects(f.load("src/lib/auth/admin.ts").requireAdmin(user),e=>e.status===401);
  assert.equal(f.state.reads.length,0);
});

test("customer-controlled roles cannot grant administrator access",async()=>{
  const f=fixture({user:verified({user_metadata:{is_admin:true,role:"owner"},app_metadata:{role:"owner"}}),membership:null});
  const response=await f.api();assert.equal(response.status,403);assert.equal(f.state.reads.length,1);
  assert.deepEqual(f.state.reads[0].filter,["user_id",f.state.user.id]);
});

test("active verified owner receives only a minimal identity DTO",async()=>{
  const f=fixture({user:verified({access_token:"DO-NOT-RETURN",user_metadata:{private_story:"DO-NOT-RETURN"}})});
  const response=await f.api();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{admin:{userId:f.state.user.id,email:f.state.user.email,role:"owner"}});
  assert.match(response.headers.get("cache-control"),/private.*no-store/);assert.equal(response.headers.get("vary"),"Cookie");
});

test("inactive, unknown-role and mismatched-identity memberships are denied",async()=>{
  for(const membership of [member({active:false}),member({active:"true"}),member({role:"viewer"}),member({user_id:"another-user"})]) {
    const f=fixture({membership});assert.equal((await f.api()).status,403);
  }
});

test("revocation takes effect on the next request without refreshing the JWT",async()=>{
  const f=fixture();assert.equal((await f.api()).status,200);
  f.state.membership=member({active:false});assert.equal((await f.api()).status,403);
  f.state.membership=null;assert.equal((await f.api()).status,403);assert.equal(f.state.reads.length,3);
});

test("missing migration and membership transport errors fail closed without leaking errors",async()=>{
  for(const options of [{dbError:{code:"PGRST205",message:"PRIVATE DATABASE FAILURE"}},{dbThrows:true}]){
    const f=fixture(options);const response=await f.api();assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/PRIVATE|PGRST205|service_role/);assert.match(response.headers.get("cache-control"),/no-store/);
  }
});

test("anonymous API requests return 401 and do not query membership",async()=>{
  const f=fixture({user:null});const response=await f.api();assert.equal(response.status,401);assert.equal(f.state.reads.length,0);assert.match(response.headers.get("cache-control"),/no-store/);
});

test("forged headers and request body cannot choose the identity being checked",async()=>{
  const f=fixture({membership:null});
  const response=await f.load("src/lib/auth/admin.ts").adminRoute(new Request("https://songgift.example/api/admin/example",{method:"POST",headers:{Origin:"https://songgift.example","Content-Type":"application/json","X-User-Id":"owner-forged","X-Admin-Role":"owner"},body:JSON.stringify({userId:"owner-forged",role:"owner"})}),async()=>{f.state.handlers++;return Response.json({ok:true});});
  assert.equal(response.status,403);assert.equal(f.state.handlers,0);assert.deepEqual(f.state.reads[0].filter,["user_id",f.state.user.id]);
});

test("cross-origin writes and non-JSON writes stop before authorization and handlers",async()=>{
  const f=fixture();const admin=f.load("src/lib/auth/admin.ts");
  for(const [headers,status] of [[{Origin:"https://evil.example","Content-Type":"application/json"},403],[{Origin:"https://songgift.example","Content-Type":"text/plain"},415],[{Origin:"https://songgift.example","Content-Type":"application/json","Sec-Fetch-Site":"cross-site"},403]]){
    const response=await admin.adminRoute(new Request("https://songgift.example/api/admin/example",{method:"POST",headers,body:"{}"}),async()=>{f.state.handlers++;return Response.json({ok:true});});
    assert.equal(response.status,status);
  }
  assert.equal(f.state.reads.length,0);assert.equal(f.state.handlers,0);
});

test("authorized writes inherit secure session response cookies",async()=>{
  const f=fixture({refreshCookie:true});
  const response=await f.load("src/lib/auth/admin.ts").adminRoute(new Request("https://songgift.example/api/admin/example",{method:"POST",headers:{Origin:"https://songgift.example","Content-Type":"application/json"},body:"{}"}),async({admin})=>{f.state.handlers++;assert.equal(admin.role,"owner");return Response.json({ok:true});});
  assert.equal(response.status,200);assert.equal(f.state.handlers,1);
  const cookie=response.headers.get("set-cookie");assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=lax/i);
});

test("server-rendered pages reject unsigned and customer identities before returning admin data",async()=>{
  const anonymous=fixture({user:null});assert.equal((await anonymous.load("src/lib/auth/admin-page.ts").getAdminPageAccess()).status,401);assert.equal(anonymous.state.reads.length,0);
  const customer=fixture({membership:null});assert.deepEqual(JSON.parse(JSON.stringify(await customer.load("src/lib/auth/admin-page.ts").getAdminPageAccess())),{status:403});
  const owner=fixture();const access=await owner.load("src/lib/auth/admin-page.ts").getAdminPageAccess();assert.equal(access.status,200);assert.equal(access.admin.userId,owner.state.user.id);
  owner.state.membership.active=false;assert.equal((await owner.load("src/lib/auth/admin-page.ts").getAdminPageAccess()).status,403);
});

test("SSR auth transport errors, missing configuration and missing migration never authorize",async()=>{
  for(const options of [{authThrows:true},{dbThrows:true},{dbError:{code:"42P01"}},{env:{SUPABASE_URL:""}}]){
    const f=fixture(options);const access=await f.load("src/lib/auth/admin-page.ts").getAdminPageAccess();assert.equal(access.status,503);assert.equal(access.admin,undefined);
  }
});

test("login return path permits /admin but rejects external and privileged API destinations",()=>{
  const {safeNext}=fixture().load("src/lib/auth/redirect.ts");
  assert.equal(safeNext("/admin"),"/admin");assert.equal(safeNext("/admin/orders?page=2"),"/admin/orders?page=2");
  for(const value of ["https://evil.example","//evil.example","/\\evil.example","/api/admin/session","/auth/callback","/admin\nLocation: evil"]){assert.equal(safeNext(value),"/my-songs");}
});


test("orders API checks current membership before any customer query",async()=>{
  for(const options of [{user:null},{membership:null},{membership:member({active:false})},{dbError:{message:"missing table"}}]) {
    const f=fixture(options);
    const response=await f.load("src/app/api/admin/orders/route.ts").GET(new Request("https://songgift.example/api/admin/orders?q=private"));
    assert.ok([401,403,503].includes(response.status));assert.equal(f.state.orderReads,0);
    assert.match(response.headers.get("cache-control"),/private.*no-store/);
  }
  const f=fixture();
  const request=()=>f.load("src/app/api/admin/orders/route.ts").GET(new Request("https://songgift.example/api/admin/orders"));
  assert.equal((await request()).status,200);assert.equal(f.state.orderReads,1);
  f.state.membership=null;assert.equal((await request()).status,403);assert.equal(f.state.orderReads,1);
});
