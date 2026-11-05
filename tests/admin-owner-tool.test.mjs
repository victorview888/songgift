import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import test from "node:test";

const userId="a3f10454-1234-4234-8234-012345678901";
const source=readFileSync("scripts/grant-admin-owner.mjs","utf8").replace(/^import .+;\r?\n/gm,"");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function run(options={}) {
  const writes=[],logs=[];
  const state={exitCode:undefined,env:{SUPABASE_URL:"https://test-project.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test-only-service-role",...options.env}};
  const identity={id:userId,email:"owner@example.com",email_confirmed_at:"2026-11-05T00:00:00Z",...options.user};
  const result={data:{user_id:userId,role:"owner",active:true},error:null};
  const db={auth:{admin:{getUserById:async()=>({data:{user:identity},error:null})}},from(table){assert.equal(table,"admin_members");return {
    select:()=>({eq:(column,value)=>{assert.deepEqual([column,value],["user_id",userId]);return {maybeSingle:async()=>({data:options.membership??null,error:options.dbError??null})};}}),
    insert:(row)=>{writes.push({type:"insert",row});return {select:()=>({single:async()=>result})};},
    update:(row)=>({eq:(column,value)=>{writes.push({type:"update",row,filter:[column,value]});return {select:()=>({single:async()=>result})};}}),
  };}};
  const args=["--user-id",userId,"--expected-project","test-project",...(options.apply?["--apply"]:[])];
  await new AsyncFunction("parseArgs","createClient","process","console",source)(config=>parseArgs({...config,args}),()=>db,state,{log:value=>logs.push(String(value)),error:value=>logs.push(String(value))});
  return {state,writes,logs};
}

test("owner bootstrap defaults to a reviewed dry run with no writes",async()=>{
  const f=await run();assert.equal(f.state.exitCode,undefined);assert.equal(f.writes.length,0);assert.ok(f.logs.some(line=>line.includes("Dry run only")));assert.ok(f.logs.every(line=>!line.includes("test-only-service-role")));
});
test("project mismatch and insecure destinations are refused before a grant",async()=>{
  for(const url of ["https://other-project.supabase.co","http://test-project.supabase.co","https://test-project.supabase.co.evil.example"]){const f=await run({apply:true,env:{SUPABASE_URL:url}});assert.equal(f.state.exitCode,1);assert.equal(f.writes.length,0);}
});
test("unverified, deleted, banned and unknown-schema accounts cannot become owners",async()=>{
  for(const options of [{user:{email_confirmed_at:null}},{user:{deleted_at:"2026-11-05T00:00:00Z"}},{user:{banned_until:"2999-01-01T00:00:00Z"}},{dbError:{code:"PGRST205"}}]){const f=await run({...options,apply:true});assert.equal(f.state.exitCode,1);assert.equal(f.writes.length,0);}
});
test("explicit apply grants only the selected verified account and active owners are a no-op",async()=>{
  const created=await run({apply:true});assert.equal(created.state.exitCode,undefined);assert.equal(created.writes.length,1);assert.equal(created.writes[0].type,"insert");assert.equal(created.writes[0].row.user_id,userId);assert.equal(created.writes[0].row.role,"owner");
  const existing=await run({apply:true,membership:{user_id:userId,role:"owner",active:true}});assert.equal(existing.writes.length,0);
});
test("reactivation updates the selected membership instead of replacing its creation record",async()=>{
  const f=await run({apply:true,membership:{user_id:userId,role:"owner",active:false}});assert.equal(f.state.exitCode,undefined);assert.equal(f.writes[0].type,"update");assert.deepEqual(f.writes[0].filter,["user_id",userId]);assert.equal(f.writes[0].row.created_at,undefined);
});
