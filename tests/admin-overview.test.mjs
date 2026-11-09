import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { PGlite } from "@electric-sql/pglite";

class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
const db=new PGlite();
before(async()=>{
  await db.exec(`create table song_orders(id integer primary key,status text,paid_at timestamptz,generation_error text,created_at timestamptz);
    create table song_assets(id integer primary key,order_id integer,is_final boolean);
    insert into song_orders values
      (1,'draft',null,null,'2026-11-04T15:59:59.999Z'),
      (2,'lyrics_ready','2026-11-05',null,'2026-11-04T16:00:00Z'),
      (3,'completed','2026-11-05',null,'2026-11-05T01:00:00Z'),
      (4,'failed',null,null,'2026-11-05T15:59:59.999Z'),
      (5,'completed','2026-11-05',null,'2026-11-05T16:00:00Z'),
      (6,'generating','2026-11-05',null,'2026-11-05T02:00:00Z'),
      (7,'generating','2026-11-05','PRIVATE ERROR','2026-11-05T03:00:00Z'),
      (8,'failed','2026-11-05',null,'2026-11-05T04:00:00Z'),
      (9,'lyrics_ready',null,'PRIVATE ERROR','2026-11-05T05:00:00Z'),
      (10,'generating','2026-11-05',null,'2026-11-05T06:00:00Z');
    insert into song_assets values (1,3,true),(2,3,true),(3,8,true),(4,9,false),(5,10,true);`);
});
after(()=>db.close());

function fixture({empty=false,errorAt=-1,missingCount=false,negativeCount=false}={}){
  const calls=[],modules=new Map();
  const client=createClient("https://isolated.supabase.invalid","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(input),p=url.searchParams;
    calls.push({url,method:init.method,body:init.body});
    if(calls.length===errorAt)return new Response(null,{status:403});
    assert.equal(url.pathname,"/rest/v1/song_orders");assert.equal(init.method,"HEAD");
    const where=[],values=[];
    const hasFinal="exists(select 1 from song_assets a where a.order_id=o.id and a.is_final=true)";
    if(p.get("select").includes("!inner"))where.push(hasFinal);
    if(p.get("final_assets")==="is.null")where.push("not "+hasFinal);
    if(p.get("paid_at")==="not.is.null")where.push("paid_at is not null");
    if(p.get("status")){assert.equal(p.get("status"),"eq.generating");where.push("status='generating'");}
    if(p.get("or")){
      assert.equal(p.get("or"),"(status.eq.failed,status.eq.completed,generation_error.not.is.null)");
      where.push("(status='failed' or status='completed' or generation_error is not null)");
    }
    for(const value of p.getAll("created_at")){
      const split=value.indexOf('.'),op=value.slice(0,split);assert.ok(["gte","lt"].includes(op));values.push(value.slice(split+1));
      where.push(`created_at ${op==='gte'?'>=':'<'} $${values.length}`);
    }
    const result=await db.query("select count(*)::int total from song_orders o"+(where.length?" where "+where.join(" and "):""),values);
    const count=empty?0:negativeCount?-1:result.rows[0].total;
    return new Response(null,{status:200,headers:missingCount?{}:{"Content-Range":"*/"+count}});
  }}});
  function load(file){
    if(modules.has(file))return modules.get(file);
    const exports={},compiled=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    modules.set(file,exports);
    vm.runInNewContext(`(function(exports,require){${compiled}\n})`,{Date,URLSearchParams})(exports,name=>{
      if(name==="server-only")return {};
      if((name==="@/lib/auth/server" || name==="@/lib/http-error"))return {HttpError};
      if(name==="@/lib/supabase/admin")return {getSupabaseAdmin:()=>client};
      if(name==="./order-metrics")return load("src/lib/admin/order-metrics.ts");
      throw new Error(name);
    });return exports;
  }
  return {calls,api:load("src/lib/admin/overview.ts"),load};
}

test("overview counts orders, not assets, and separates payment, generation and review evidence",async()=>{
  const f=fixture(),result=await f.api.getAdminOverview(new Date("2026-11-05T15:59:59.999Z"));
  assert.deepEqual(JSON.parse(JSON.stringify(result.counts)),{orders:10,createdToday:8,paid:7,withFinalAudio:3,generating:2,needsReview:4});
  assert.equal(result.day,"2026-11-05");assert.equal(result.timeZone,"Asia/Shanghai");assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
  assert.equal(result.links.needsReview,"/admin/orders?delivery=review");
  assert.equal(result.links.createdToday,"/admin/orders?from=2026-11-05&to=2026-11-05");
  assert.equal(f.calls.length,6);assert.ok(f.calls.every(c=>c.method==="HEAD"&&!c.body));
  for(const call of f.calls)assert.doesNotMatch(call.url.searchParams.get("select"),/story|lyrics|email|storage|generation_error|payment_transactions|generation_jobs|\*/);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|revenue|income|profit|capture|recipient|signedUrl/);
});

test("Beijing day boundaries and list date links switch together at UTC 16:00",async()=>{
  const f=fixture();const result=await f.api.getAdminOverview(new Date("2026-11-05T16:00:00Z"));
  assert.equal(result.day,"2026-11-06");assert.equal(result.counts.createdToday,1);
  assert.equal(result.links.createdToday,"/admin/orders?from=2026-11-06&to=2026-11-06");
  assert.deepEqual(f.calls[1].url.searchParams.getAll("created_at"),["gte.2026-11-05T16:00:00.000Z","lt.2026-11-06T16:00:00.000Z"]);
});

test("only confirmed empty counts become zero; missing/error counts fail as unavailable",async()=>{
  const empty=await fixture({empty:true}).api.getAdminOverview();assert.ok(Object.values(empty.counts).every(v=>v===0));
  for(const options of [{errorAt:2},{missingCount:true},{negativeCount:true}])await assert.rejects(fixture(options).api.getAdminOverview(),e=>e.status===503&&!e.message.includes("PRIVATE"));
});

test("overview review predicate matches the linked list filter and remains a static query",async()=>{
  const f=fixture();const overview=await f.api.getAdminOverview(new Date("2026-11-05T01:00:00Z"));
  const orders=f.load("src/lib/admin/orders.ts");
  const params=new URL(overview.links.needsReview,"https://songgift.invalid").searchParams;
  const filters=orders.parseOrderFilters(params);assert.equal(filters.delivery,"review");
  // Only inspect the query: a list response uses GET rather than the HEAD test transport.
  const queryCall=f.calls.find(c=>c.url.searchParams.has("or"));assert.equal(queryCall.url.searchParams.get("final_assets"),"is.null");
  assert.equal(queryCall.url.searchParams.get("final_assets.is_final"),"eq.true");
});
