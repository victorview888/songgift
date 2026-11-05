import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

const id="c3f10454-1234-4234-8234-000000000001";
const assetId="d3f10454-1234-4234-8234-000000000001";
const admin={userId:"a3f10454-1234-4234-8234-012345678901",email:"owner@isolated.example",role:"owner"};
class HttpError extends Error { constructor(status,message) { super(message);this.status=status; } }
const asset={id:assetId,asset_type:"final",mime_type:"audio/mpeg",duration_seconds:null,provider:"fal",model_id:"isolated-model",provider_job_id:"job-1",is_final:true,created_at:"2026-11-05T01:20:00Z"};
const order={id,user_id:null,email:"buyer@isolated.example",recipient_name:"Test",relationship:null,occasion:"birthday",story:"<script>not executable</script>",mood:null,style:null,title:"A song",lyrics_text:"Saved lyrics",status:"completed",paid_at:"2026-11-05T01:00:00Z",paypal_order_id:"PAYPAL1",music_provider:"fal",music_model:"isolated-model",provider_job_id:"job-1",created_at:"2026-11-05T00:00:00Z",updated_at:"2026-11-05T01:20:00Z"};
function fixture(options={}) {
  const calls=[];
  const modules=new Map();
  const db=createClient("https://isolated.supabase.invalid","isolated-service-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(input),body=init.body?JSON.parse(init.body):undefined;
    calls.push({url,method:init.method,body});
    let result,status=200;
    if(url.pathname==="/rest/v1/song_orders")result=options.missingOrder?[]:[{...order,song_assets:options.assets||[asset],final_assets:[{id:assetId}]}];
    else if(url.pathname==="/rest/v1/song_assets")result=options.missingAsset||url.searchParams.get("order_id")!=="eq."+id||url.searchParams.get("id")!=="eq."+assetId?[]:[{...asset,order_id:id,storage_bucket:"songs",storage_path:"private/path.mp3"}];
    else if(url.pathname==="/rest/v1/admin_audit_logs") {
      result=init.method==="PATCH"?[{request_id:body.request_id||"fixture-request"}]:null;
      if(options.auditInsertFails&&init.method==="POST"||options.auditUpdateFails&&body.result==="issued")status=403;
    } else if(url.pathname.startsWith("/storage/v1/object/sign/")) {
      result={signedURL:"/object/sign/songs/private/path.mp3?token=DO-NOT-LOG"};
      if(options.signingFails)status=403;
    } else throw new Error("Unexpected isolated request: "+url.pathname);
    if(options.readFails&&["/rest/v1/song_orders","/rest/v1/song_assets"].includes(url.pathname))status=403;
    if(status!==200)result={message:"PRIVATE PROVIDER FAILURE",error:"PRIVATE PROVIDER FAILURE"};
    return new Response(JSON.stringify(result),{status,headers:{"Content-Type":"application/json"}});
  }}});
  function load(file) {
    if(modules.has(file))return modules.get(file);
    const exports={};modules.set(file,exports);
    const compiled=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(`(function(exports,require){${compiled}\n})`,{URL,crypto})(exports,name=>{
      if(name==="server-only")return {};
      if(name==="@/lib/auth/server")return {HttpError};
      if(name==="@/lib/supabase/admin" || name==="./admin")return {getSupabaseAdmin:()=>db};
      if(name==="@/lib/supabase/orders")return load("src/lib/supabase/orders.ts");
      if(name==="./order-detail")return load("src/lib/admin/order-detail.ts");
      throw new Error(name);
    });return exports;
  }
  return {calls,load,detail:()=>load("src/lib/admin/order-detail.ts").getAdminOrderDetail(id),audio:(args={})=>load("src/lib/admin/audio.ts").issueAdminAudioLink({orderId:id,assetId,download:false,admin,...args})};
}

test("detail reads are bounded, private projections and never sign or mutate",async()=>{
  const f=fixture();const result=await f.detail();
  assert.equal(result.order.story,order.story);assert.equal(result.hasFinalAudio,true);
  assert.equal(result.order.song_assets,undefined);assert.equal(result.order.final_assets,undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(result.timeline.map(item=>item.key))),["created","paid",assetId]);
  const p=f.calls[0].url.searchParams;
  assert.equal(p.get("id"),"eq."+id);assert.equal(p.get("song_assets.limit"),"101");
  assert.equal(p.get("final_assets.limit"),"1");assert.equal(p.get("final_assets.is_final"),"eq.true");
  assert.doesNotMatch(p.get("select"),/storage_path|storage_bucket|generation_error|\*/);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,"GET");
});

test("malformed and missing order/asset IDs do not leak records or create audit rows",async()=>{
  const f=fixture();
  await assert.rejects(f.load("src/lib/admin/order-detail.ts").getAdminOrderDetail("not-an-id"),e=>e.status===404);
  await assert.rejects(f.audio({assetId:"invalid"}),e=>e.status===404);assert.equal(f.calls.length,0);
  const missing=fixture({missingOrder:true});await assert.rejects(missing.detail(),e=>e.status===404);
  for(const options of [{missingAsset:true},{}]) {
    const other=fixture(options);await assert.rejects(other.audio({orderId:"c3f10454-1234-4234-8234-000000000002"}),e=>e.status===404);assert.equal(other.calls.length,1);
  }
});

test("detail does not invent payment amounts or events; old final assets retain delivery evidence",async()=>{
  const assets=Array.from({length:101},(_,i)=>({...asset,id:String(i),is_final:false}));
  const f=fixture({assets});const result=await f.detail();
  assert.equal(result.assets.length,100);assert.equal(result.assetsTruncated,true);assert.equal(result.hasFinalAudio,true);
  for(const field of ["amount","currency","payment_environment","capture_id"])assert.equal(result.order[field],undefined);
  assert.equal(result.timeline.some(item=>/歌词确认|邮件发送|供应商完成/.test(item.title)),false);
});

test("audio capabilities require bound final asset, durable audit before signing and 60-second lifetime",async()=>{
  const f=fixture();const url=await f.audio();
  assert.match(url,/token=DO-NOT-LOG/);
  assert.deepEqual(f.calls.map(call=>call.url.pathname),["/rest/v1/song_assets","/rest/v1/admin_audit_logs","/storage/v1/object/sign/songs/private/path.mp3","/rest/v1/admin_audit_logs"]);
  const q=f.calls[0].url.searchParams;assert.equal(q.get("id"),"eq."+assetId);assert.equal(q.get("order_id"),"eq."+id);assert.equal(q.get("is_final"),"eq.true");
  const row=f.calls[1].body;assert.equal(row.actor_user_id,admin.userId);assert.equal(row.target_id,assetId);assert.equal(row.order_id,id);assert.equal(row.result,"requested");assert.equal(row.action,"audio.preview");
  assert.deepEqual(Object.keys(row).sort(),["request_id","actor_user_id","action","target_type","target_id","order_id","result"].sort());
  assert.doesNotMatch(JSON.stringify(row),/token|private\/|buyer|story/);assert.equal(f.calls[2].body.expiresIn,60);assert.equal(f.calls[3].body.result,"issued");
  assert.equal(f.calls[3].url.searchParams.get("request_id"),"eq."+row.request_id);
});

test("download uses a safe filename and logs a distinct action",async()=>{
  const f=fixture();const url=await f.audio({download:true});
  assert.equal(f.calls[1].body.action,"audio.download");assert.equal(new URL(url).searchParams.get("download"),`SongGift-${id}.mp3`);
});

test("missing audit permissions stop signing; signing and audit-finalization failures release no link",async()=>{
  const noAudit=fixture({auditInsertFails:true});await assert.rejects(noAudit.audio(),e=>e.status===503);assert.equal(noAudit.calls.length,2);
  const badSign=fixture({signingFails:true});await assert.rejects(badSign.audio(),e=>e.status===503&&!e.message.includes("PRIVATE"));assert.equal(badSign.calls.at(-1).body.result,"failed");
  const badRecord=fixture({auditUpdateFails:true});await assert.rejects(badRecord.audio(),e=>e.status===503);assert.equal(badRecord.calls.at(-1).body.result,"issued");
  const broken=fixture({readFails:true});await assert.rejects(broken.detail(),e=>e.status===503&&!e.message.includes("PRIVATE"));await assert.rejects(broken.audio(),e=>e.status===503);assert.equal(broken.calls.length,2);
});

test("return links preserve list filters but reject other pages and external destinations",()=>{
  const {adminOrdersBackLink}=fixture().load("src/lib/admin/links.ts");
  assert.equal(adminOrdersBackLink("/admin/orders?page=2&provider=fal"),"/admin/orders?page=2&provider=fal");
  for(const value of [undefined,["/admin/orders"],"https://evil.example","//evil.example/admin/orders","/\\evil.example/admin/orders","/api/admin/orders","/admin/orders/other","/admin/orders#x","/admin/orders\n"])assert.equal(adminOrdersBackLink(value),"/admin/orders");
});
