import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const id="c3f10454-1234-4234-8234-000000000001",userId="a3f10454-1234-4234-8234-012345678901";
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const assertId=value=>{if(!/^[a-f0-9-]{36}$/.test(value))throw new HttpError(404,"missing");};
function module(file,imports={},globals={}){
  const exports={},compiled=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(exports,require){${compiled}\n})`,globals)(exports,name=>{
    if(name==="server-only")return {};
    if((name==="@/lib/auth/server" || name==="@/lib/http-error"))return {HttpError};
    if(name==="@/lib/admin/order-detail"||name==="./order-detail")return {assertAdminOrderId:assertId};
    if(imports[name])return imports[name];throw new Error("Unexpected import: "+name);
  });return exports;
}
function serviceFixture(error=null){
  const calls=[];const env={SONG_PRICE_USD:"9.99",PAYPAL_ENVIRONMENT:"live"};
  const quote={id,quoted_amount_minor:100,currency:"USD",payment_environment:"live",price_version:"v1",quoted_at:"2026-11-05T00:00:00Z",story:"PRIVATE STORY"};
  const db={rpc:async(name,params)=>{calls.push({name,params});return {data:quote,error};}};
  const pricing=module("src/lib/pricing.ts",{},{process:{env}});
  const api=module("src/lib/services/order-operations.ts",{"@/lib/supabase/admin":{getSupabaseAdmin:()=>db},"@/lib/pricing":pricing},{process:{env}});
  return {api,calls};
}

test("quote preparation uses verified server identity and exact cents, and returns only the quote DTO",async()=>{
  const f=serviceFixture();
  const result=await f.api.prepareOrderQuote(id,{id:userId,email:"VictorView888@gmail.com",email_confirmed_at:"now"});
  assert.equal(f.calls[0].params.p_amount_minor,100);assert.equal(f.calls[0].params.p_user_id,userId);assert.equal(f.calls[0].params.p_environment,"live");
  assert.equal(result.story,undefined);assert.equal(result.quoted_amount_minor,100);
  await f.api.prepareOrderQuote(id,{id:userId,email:"other@isolated.example",email_confirmed_at:"now"});assert.equal(f.calls[1].params.p_amount_minor,999);
  await assert.rejects(f.api.prepareOrderQuote(id,{id:userId,email_confirmed_at:null}),e=>e.status===401);assert.equal(f.calls.length,2);
  assert.equal(f.api.usdMinor("0.01"),1);assert.equal(f.api.usdMinor("9.9"),990);
  for(const value of ["0","0.00","-1","1e2","1.234"," 9.99","NaN","99999999"])assert.throws(()=>f.api.usdMinor(value),e=>e.status===503);
});

test("operation services issue only structured RPCs and deterministic validated storage paths",async()=>{
  const f=serviceFixture();
  await f.api.reserveGeneration({orderId:id,userId,requestId:id,provider:"fal",model:"saved-model",environment:"production"});
  await f.api.claimGeneration(id);
  await f.api.settleGeneration({jobId:id,leaseToken:id,state:"storing",errorCode:"storage_failed"});
  await f.api.finishGeneration(id,id,id);
  assert.deepEqual(f.calls.map(c=>c.name),["reserve_songgift_generation","claim_songgift_job","settle_songgift_job","finish_songgift_generation"]);
  assert.equal(f.calls[0].params.p_model,"saved-model");assert.equal(f.calls[2].params.p_error_code,"storage_failed");
  assert.equal(f.api.generationStoragePath(id,id,"audio/wav"),`${id}/${id}/final.wav`);
  assert.throws(()=>f.api.generationStoragePath("../../other",id,"audio/mpeg"),e=>e.status===404);
});

test("RPC errors are classified without returning database/provider details",async()=>{
  for(const [message,status] of [["job_busy",409],["legacy_payment_needs_review",409],["order_not_found",404],["admin_denied",403],["PRIVATE DATABASE TOKEN",503]]){
    const f=serviceFixture({message});await assert.rejects(f.api.claimGeneration(id),e=>e.status===status&&!e.message.includes("PRIVATE"));
  }
});

function historyFixture({missing=false,failure=false,total=1,legacy=false}={}){
  const calls=[];
  const db=createClient("https://isolated.supabase.invalid","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(input);calls.push({url,method:init.method});
    const records=Array.from({length:total},(_,i)=>({id:String(i)}));
    const row={id,quoted_amount_minor:legacy?null:100,currency:legacy?null:"USD",payment_environment:legacy?null:"live",price_version:legacy?null:"v1",quoted_at:legacy?null:"2026-11-05T00:00:00Z",payment_transactions:records,generation_jobs:records,order_events:records};
    return new Response(JSON.stringify(failure?{message:"PRIVATE DATABASE FAILURE"}:url.pathname.endsWith("song_orders")?(missing?[]:[row]):records),{status:failure?403:200,headers:{"Content-Type":"application/json"}});
  }}});
  return {calls,api:module("src/lib/admin/order-history.ts",{"@/lib/supabase/admin":{getSupabaseAdmin:()=>db}})};
}

test("history queries are order-bound, bounded and omit all lease/storage capabilities",async()=>{
  const f=historyFixture({total:51});const result=await f.api.getAdminOrderHistory(id);
  assert.equal(result.quote.amountMinor,100);assert.equal(result.payments.length,50);assert.equal(result.jobs.length,50);assert.equal(result.events.length,50);assert.equal(result.audit.length,50);
  assert.ok(Object.values(result.truncated).every(Boolean));
  const p=f.calls[0].url.searchParams;assert.equal(p.get("id"),"eq."+id);
  for(const table of ["payment_transactions","generation_jobs","order_events"])assert.equal(p.get(table+".limit"),"51");
  assert.doesNotMatch(p.get("select"),/lease|submission_key|storage_path|story|lyrics|\*/);
  assert.equal(f.calls[1].url.searchParams.get("order_id"),"eq."+id);assert.equal(f.calls[1].url.searchParams.get("limit"),"51");
  assert.ok(f.calls.every(c=>c.method==="GET"));
});

test("legacy quotes stay absent and missing history cannot disclose errors or unrelated orders",async()=>{
  assert.equal((await historyFixture({legacy:true,total:0}).api.getAdminOrderHistory(id)).quote,null);
  await assert.rejects(historyFixture({missing:true}).api.getAdminOrderHistory(id),e=>e.status===404);
  await assert.rejects(historyFixture({failure:true}).api.getAdminOrderHistory(id),e=>e.status===503&&!e.message.includes("PRIVATE"));
  const invalid=historyFixture();await assert.rejects(invalid.api.getAdminOrderHistory("invalid"),e=>e.status===404);assert.equal(invalid.calls.length,0);
});
