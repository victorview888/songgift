import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const orderId="c3f10454-1234-4234-8234-000000000001",jobId="d3f10454-1234-4234-8234-000000000001";
const legacy={id:orderId,email:"buyer@isolated.example",recipient_name:"Friend",status:"generating",music_provider:"fal",music_model:"saved-model",provider_job_id:"original-task",generation_error:"PRIVATE TOKEN AND PROVIDER ERROR",created_at:"2026-11-05T00:00:00Z",updated_at:"2026-11-05T00:10:00Z",final_assets:[]};
const recorded={id:jobId,order_id:orderId,attempt_no:1,environment:"production",provider:"fal",model:"saved-model",provider_job_id:"original-task",state:"storing",error_code:"storage_failed",final_asset_id:null,started_at:"2026-11-05T00:00:00Z",updated_at:"2026-11-05T00:10:00Z",completed_at:null,order:{email:legacy.email,recipient_name:"Friend"}};
function fixture({rows,total=21,failure=false}={}){
  const calls=[],modules=new Map();
  const db=createClient("https://isolated.supabase.invalid","fake-service-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(input);calls.push({url,method:init.method});
    const data=rows||[url.pathname.endsWith("generation_jobs")?recorded:legacy];
    return new Response(JSON.stringify(failure?{message:"PRIVATE DATABASE FAILURE"}:data),{status:failure?403:200,headers:{"Content-Type":"application/json","Content-Range":`0-${data.length-1}/${total}`}});
  }}});
  function load(file){
    if(modules.has(file))return modules.get(file);
    const exports={},compiled=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;modules.set(file,exports);
    vm.runInNewContext(`(function(exports,require){${compiled}\n})`,{Date,URL,URLSearchParams})(exports,name=>{
      if(name==="server-only")return {};
      if(name==="@/lib/auth/server")return {HttpError};
      if(name==="@/lib/supabase/admin")return {getSupabaseAdmin:()=>db};
      if(name==="./order-metrics")return load("src/lib/admin/order-metrics.ts");
      throw new Error(name);
    });return exports;
  }
  const api=load("src/lib/admin/jobs.ts");return {api,calls,load,filters:(params="")=>api.parseJobFilters(new URLSearchParams(params))};
}

test("job filters reject invalid, duplicate and source-incompatible inputs before any reads",()=>{
  const f=fixture();
  for(const value of ["source=unknown","source=recorded&source=legacy","page=0","page=1e2","page=1000000","state=storing","source=recorded&state=generating","environment=production","searchBy=jobId","source=recorded&environment=live","provider=unknown","attention=yes","q=partial","searchBy=email&q=not-email","from=2026-02-30","from=2026-11-06&to=2026-11-05","searchBy=providerJobId&q=some%00value","searchBy=providerJobId&q="+"a".repeat(2049)])assert.throws(()=>f.filters(value),e=>e.status===400,value);
  assert.equal(f.calls.length,0);
});

test("legacy tasks are bounded read-only order references, never fabricated task history",async()=>{
  const f=fixture();const result=await f.api.listAdminJobs(f.filters("page=2"));
  assert.equal(result.source,"legacy");assert.equal(result.pageSize,20);assert.equal(result.totalPages,2);
  const p=f.calls[0].url.searchParams;
  assert.equal(p.get("offset"),"20");assert.equal(p.get("limit"),"20");assert.equal(p.get("order"),"created_at.desc,id.desc");assert.equal(p.get("final_assets.limit"),"1");
  assert.equal(p.get("or"),"(provider_job_id.not.is.null,status.in.(generating,failed,completed))");
  assert.equal(result.jobs[0].id,null);assert.equal(result.jobs[0].environment,null);assert.equal(result.jobs[0].attemptNo,null);assert.equal(result.jobs[0].completedAt,null);assert.equal(result.jobs[0].elapsedSeconds,null);
  assert.equal(result.jobs[0].errorCode,"legacy_error");assert.equal(result.jobs[0].recordedAt,legacy.created_at);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|TOKEN|generation_error|lease_token|signedUrl|storage_path/);
  assert.equal(f.calls[0].method,"GET");
  const lost=fixture({rows:[{...legacy,provider_job_id:null}]});
  assert.equal((await lost.api.listAdminJobs(lost.filters())).jobs[0].providerJobId,null);
});

test("recorded tasks use their saved provider/model and return no processing capabilities",async()=>{
  const f=fixture();const result=await f.api.listAdminJobs(f.filters("source=recorded&state=storing&provider=fal&environment=production&page=2"));
  const p=f.calls[0].url.searchParams;assert.equal(f.calls[0].url.pathname,"/rest/v1/generation_jobs");
  assert.equal(p.get("state"),"eq.storing");assert.equal(p.get("provider"),"eq.fal");assert.equal(p.get("environment"),"eq.production");assert.equal(p.get("order"),"started_at.desc,id.desc");
  assert.doesNotMatch(p.get("select"),/lease|submission_key|story|lyrics|storage|generation_error|\*/);
  assert.equal(result.jobs[0].id,jobId);assert.equal(result.jobs[0].model,"saved-model");assert.equal(result.jobs[0].errorCode,"storage_failed");assert.equal(result.jobs[0].orderEmail,legacy.email);
  const complete=fixture({rows:[{...recorded,state:"completed",completed_at:"2026-11-05T00:30:00Z"}]});
  assert.equal((await complete.api.listAdminJobs(complete.filters("source=recorded"))).jobs[0].elapsedSeconds,1800);
  const failed=fixture({rows:[{...recorded,state:"failed"}]});assert.equal((await failed.api.listAdminJobs(failed.filters("source=recorded"))).jobs[0].elapsedSeconds,null);
  const unknown=fixture({rows:[{...recorded,error_code:"PRIVATE TOKEN"}]});const cleaned=await unknown.api.listAdminJobs(unknown.filters("source=recorded"));assert.equal(cleaned.jobs[0].errorCode,"unknown");assert.doesNotMatch(JSON.stringify(cleaned),/PRIVATE|TOKEN/);
});

test("exact search scopes order IDs, independent job IDs, escaped email and external references",async()=>{
  const f=fixture();
  await f.api.listAdminJobs(f.filters("source=recorded&searchBy=jobId&q="+jobId));assert.equal(f.calls.at(-1).url.searchParams.get("id"),"eq."+jobId);
  await f.api.listAdminJobs(f.filters("source=recorded&q="+orderId));assert.equal(f.calls.at(-1).url.searchParams.get("order_id"),"eq."+orderId);
  await f.api.listAdminJobs(f.filters("source=recorded&searchBy=email&q="+encodeURIComponent("A_%@isolated.example")));assert.equal(f.calls.at(-1).url.searchParams.get("order.email"),"ilike.A\\_\\%@isolated.example");assert.match(f.calls.at(-1).url.searchParams.get("select"),/song_orders!inner/);
  const external='fal-lyria:{"requestId":"abc,def"}';
  await f.api.listAdminJobs(f.filters("searchBy=providerJobId&q="+encodeURIComponent(external)));assert.equal(f.calls.at(-1).url.searchParams.get("provider_job_id"),"eq."+external);
  assert.equal(f.calls.at(-1).url.searchParams.get("or"),"(provider_job_id.not.is.null,status.in.(generating,failed,completed))");
});

test("legacy attention groups both fixed predicates and dates use the selected source's timestamp",async()=>{
  const f=fixture();await f.api.listAdminJobs(f.filters("attention=1&from=2026-11-05&to=2026-11-05"));
  const p=f.calls[0].url.searchParams;
  assert.equal(p.get("or"),"(and(or(provider_job_id.not.is.null,status.in.(generating,failed,completed)),or(status.eq.failed,status.eq.completed,generation_error.not.is.null)))");
  assert.equal(p.getAll("or").length,1);assert.equal(p.get("final_assets"),"is.null");assert.deepEqual(p.getAll("created_at"),["gte.2026-11-04T16:00:00.000Z","lt.2026-11-05T16:00:00.000Z"]);
  await f.api.listAdminJobs(f.filters("source=recorded&attention=1&from=2026-11-05&to=2026-11-05"));
  const q=f.calls.at(-1).url.searchParams;assert.equal(q.get("or"),"(state.in.(failed,needs_review),error_code.not.is.null)");assert.deepEqual(q.getAll("started_at"),p.getAll("created_at"));
});

test("missing migrations fail visibly; empty pages keep page context without guessing counts",async()=>{
  const broken=fixture({failure:true});await assert.rejects(broken.api.listAdminJobs(broken.filters("source=recorded")),e=>e.status===503&&!e.message.includes("PRIVATE"));
  const f=fixture({rows:[],total:0});const result=await f.api.listAdminJobs(f.filters("page=7"));assert.equal(result.jobs.length,0);assert.equal(result.total,0);assert.equal(result.page,7);
});

test("order details may safely return to filtered job lists and reject non-list destinations",()=>{
  const f=fixture(),{adminOrdersBackLink}=f.load("src/lib/admin/links.ts");
  assert.equal(adminOrdersBackLink("/admin/jobs?source=recorded&state=storing&page=2"),"/admin/jobs?source=recorded&state=storing&page=2");
  for(const input of ["/admin/jobs/other","//evil.example/admin/jobs","/api/admin/jobs","/admin/jobs#x"])assert.equal(adminOrdersBackLink(input),"/admin/orders");
});
