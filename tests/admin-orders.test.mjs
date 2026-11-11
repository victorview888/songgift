import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

test("financial summaries distinguish captured, quoted, unknown and conflicting payments", async () => {
  const base = { id: "a", final_assets: [], quoted_amount_minor: 999, currency: "USD", payment_environment: "live" };
  const capture = { amount_minor: 799, currency: "USD", environment: "sandbox", provider: "paypal" };
  const f = fixture({ rows: [
    { ...base, paid_at: "2026-11-10", capture_records: [capture] },
    { ...base, paid_at: null, capture_records: [] },
    { ...base, paid_at: "2026-11-10", capture_records: [] },
    { ...base, paid_at: "2026-11-10", capture_records: [capture, capture] },
    { ...base, quoted_amount_minor: -1, paid_at: null, capture_records: [] },
  ], total: 5 });
  const { orders } = await f.listAdminOrders(f.filters());
  assert.equal(orders[0].financial.amountMinor, 799);
  assert.equal(orders[0].financial.environment, "sandbox");
  assert.equal(orders[1].financial.label, "报价（未收款）");
  assert.equal(orders[2].financial.amountMinor, null);
  assert.equal(orders[3].financial.label, "多笔收款待核查");
  assert.equal(orders[3].financial.amountMinor, null);
  assert.equal(orders[4].financial.amountMinor, null);
  const query = f.calls[0].url.searchParams;
  assert.equal(query.get("capture_records.transaction_type"), "eq.capture");
  assert.equal(query.get("capture_records.limit"), "2");
  assert.equal(f.calls.length, 1);
  assert.ok(orders.every(order => !Object.hasOwn(order, "capture_records")));
});

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function fixture({ rows = [], total = 0, failure = false } = {}) {
  const calls = [];
  const db = createClient("https://isolated.supabase.invalid", "fake-service-key", { auth: { persistSession:false, autoRefreshToken:false }, global: { fetch: async (input, init) => {
    calls.push({url:new URL(input),headers:new Headers(init.headers)});
    return new Response(JSON.stringify(failure ? {message:"PRIVATE DATABASE DETAIL"} : rows), { status: failure ? 503 : 200, headers: {"Content-Type":"application/json","Content-Range":`0-${rows.length-1}/${total}`} });
  } } });
  const source=ts.transpileModule(readFileSync("src/lib/admin/orders.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(`(function(exports,require){${source}\n})`,{URLSearchParams,Date})(exports,(name)=>{
    if(name==="server-only")return {};
    if(name==="./order-metrics"){
      const out={},code=ts.transpileModule(readFileSync("src/lib/admin/order-metrics.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
      vm.runInNewContext(`(function(exports){${code}\n})`)(out);return out;
    }
    if((name==="@/lib/auth/server" || name==="@/lib/http-error"))return {HttpError};
    if(name==="@/lib/supabase/admin")return {getSupabaseAdmin:()=>db};
    throw new Error(name);
  });
  return {...exports,calls,filters:(params="")=>exports.parseOrderFilters(new URLSearchParams(params))};
}

test("rejects malformed, ambiguous and oversized filters before database access",()=>{
  const f=fixture();
  for(const q of ["page=0","page=-1","page=1.2","page=1e3","page=1000000","page=1&page=2","searchBy=story","q=partial","searchBy=paypal&q=x%29%2Cor%28id.eq.a","payment=paid","delivery=unknown","provider=unknown","from=2026-02-30","from=2026-11-06&to=2026-11-05",`searchBy=email&q=${"a".repeat(255)}@example.com`]) assert.throws(()=>f.filters(q),e=>e.status===400,q);
  assert.equal(f.calls.length,0);
});

test("server pagination is bounded and deterministic, with summary fields only",async()=>{
  const f=fixture({rows:[{id:"a",final_assets:[{id:"asset"}]}],total:41});
  const result=await f.listAdminOrders(f.filters("page=2"));
  const {url,headers}=f.calls[0];
  assert.equal(url.searchParams.get("offset"),"20");assert.equal(url.searchParams.get("limit"),"20");
  assert.equal(url.searchParams.get("order"),"created_at.desc,id.desc");assert.match(headers.get("prefer"),/count=exact/);
  assert.doesNotMatch(url.searchParams.get("select"),/story|lyrics|storage_path|generation_error|\*/);
  assert.equal(result.orders[0].hasFinalAudio,true);assert.equal(result.orders[0].final_assets,undefined);
  assert.equal(result.total,41);assert.equal(result.totalPages,3);assert.equal(result.pageSize,20);
});

test("exact email matching escapes wildcards rather than expanding a private search",async()=>{
  const f=fixture();
  await f.listAdminOrders(f.filters("searchBy=email&q="+encodeURIComponent("A_%@Example.com")));
  assert.equal(f.calls[0].url.searchParams.get("email"),"ilike.A\\_\\%@Example.com");
  assert.equal(f.calls[0].url.searchParams.get("or"),null);
});

test("order and PayPal searches use equality, never raw OR filter interpolation",async()=>{
  const f=fixture();
  const id="a3f10454-1234-4234-8234-012345678901";
  await f.listAdminOrders(f.filters("q="+id));
  await f.listAdminOrders(f.filters("searchBy=paypal&q=ABC123"));
  assert.equal(f.calls[0].url.searchParams.get("id"),"eq."+id);
  assert.equal(f.calls[1].url.searchParams.get("paypal_order_id"),"eq.ABC123");
});

test("date range includes the full end date in Beijing time and combines filters",async()=>{
  const f=fixture();
  await f.listAdminOrders(f.filters("from=2026-11-05&to=2026-11-05&payment=recorded&delivery=delivered&provider=fal"));
  const p=f.calls[0].url.searchParams;
  assert.deepEqual(p.getAll("created_at"),["gte.2026-11-04T16:00:00.000Z","lt.2026-11-05T16:00:00.000Z"]);
  assert.equal(p.get("paid_at"),"not.is.null");assert.equal(p.get("music_provider"),"eq.fal");
  assert.match(p.get("select"),/final_assets:song_assets!inner\(id\)/);assert.equal(p.get("final_assets.is_final"),"eq.true");
});

test("undelivered filters exclude final assets without losing orders with no assets",async()=>{
  const f=fixture();
  for(const delivery of ["undelivered","generating","failed"]){
    await f.listAdminOrders(f.filters("delivery="+delivery+"&payment=unrecorded"));
    const p=f.calls.at(-1).url.searchParams;
    assert.equal(p.get("final_assets"),"is.null");assert.equal(p.get("final_assets.is_final"),"eq.true");
    assert.doesNotMatch(p.get("select"),/!inner/);
    assert.equal(p.get("status"),delivery==="undelivered"?null:"eq."+delivery);
    assert.equal(p.get("paid_at"),"is.null");
  }
});

test("empty pages keep the requested page and failures reveal no database detail",async()=>{
  const f=fixture({total:0});
  const result=await f.listAdminOrders(f.filters("page=7"));assert.equal(result.orders.length,0);assert.equal(result.page,7);assert.equal(result.totalPages,0);
  const broken=fixture({failure:true});
  await assert.rejects(broken.listAdminOrders(broken.filters()),e=>e.status===503&&!e.message.includes("PRIVATE"));
});


test("review filter includes only undelivered failed/completed/error records using a fixed predicate",async()=>{
  const f=fixture();await f.listAdminOrders(f.filters("delivery=review"));
  const p=f.calls[0].url.searchParams;
  assert.equal(p.get("final_assets"),"is.null");assert.equal(p.get("final_assets.is_final"),"eq.true");
  assert.equal(p.get("or"),"(status.eq.failed,status.eq.completed,generation_error.not.is.null)");
  assert.equal(p.get("status"),null);
});
