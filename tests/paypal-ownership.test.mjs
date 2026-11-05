import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function fixture(orderResponses) {
  const calls = [], writes = [], filters = [];
  const payloads = [{ access_token: "test-access-token" }, ...orderResponses];
  const query = { eq: (key, value) => { filters.push([key, value]); return query; }, is: (key, value) => { filters.push([key, value]); return Promise.resolve({ error: null }); } };
  const db = { from: () => ({ update: (data) => { writes.push(data); return query; } }) };
  const context = vm.createContext({ Buffer, process: { env: { PAYPAL_CLIENT_ID:"test-id", PAYPAL_CLIENT_SECRET:"test-secret", PAYPAL_ENVIRONMENT:"sandbox", SONG_PRICE_USD:"9.99", PAYPAL_CURRENCY:"USD" } }, fetch: async (url, init) => { calls.push({url,init}); const next=payloads.shift(); assert.ok(next,"Unexpected provider call"); return new Response(JSON.stringify(next.body || next),{status:next.httpStatus || 200}); } });
  const source = readFileSync("src/lib/paypal.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
  const exports={};vm.runInContext(`(function(exports,require){${compiled}\n})`,context)(exports,()=>({getSupabaseAdmin:()=>db}));
  const pricingSource = readFileSync("src/lib/pricing.ts", "utf8");
  const pricingCompiled = ts.transpileModule(pricingSource, { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
  const pricingExports={};vm.runInContext(`(function(exports){${pricingCompiled}\n})`,context)(pricingExports);
  return {...exports,...pricingExports,calls,writes,filters};
}
const owner={orderId:"song-order-a",userId:"customer-a",priceUsd:"9.99"};
const paypalOrder=(status="APPROVED",extra={})=>({id:"paypal-order-a",status,purchase_units:[{custom_id:owner.orderId,amount:{currency_code:"USD",value:"9.99"}}],...extra});

test("rejects a different song binding before capture or payment writes",async()=>{
  const f=fixture([paypalOrder("APPROVED",{purchase_units:[{custom_id:"someone-else",amount:{currency_code:"USD",value:"9.99"}}]})]);
  await assert.rejects(f.capturePayPalOrder("paypal-order-a",owner),/does not match/);
  assert.equal(f.calls.filter(c=>c.url.endsWith("/capture")).length,0);assert.equal(f.writes.length,0);
});
test("rejects mismatched amount before capture",async()=>{
  const f=fixture([paypalOrder("APPROVED",{purchase_units:[{custom_id:owner.orderId,amount:{currency_code:"USD",value:"0.01"}}]})]);
  await assert.rejects(f.capturePayPalOrder("paypal-order-a",owner),/does not match/);assert.equal(f.writes.length,0);
});
test("verified test-account email pays $1 and other accounts pay $9.99",async()=>{
  const f=fixture([{id:"paypal-order-a",links:[{rel:"approve",href:"https://www.sandbox.paypal.com/checkoutnow"}]}]);
  const testPrice=f.songPriceUsdForEmail("  VictorView888@GMAIL.COM ");
  assert.equal(testPrice,"1.00");
  assert.equal(f.songPriceUsdForEmail("another@example.com"),"9.99");
  assert.equal(f.songPriceUsdForEmail(undefined),"9.99");
  await f.createPayPalOrder(owner.orderId,testPrice);
  assert.equal(JSON.parse(f.calls[1].init.body).purchase_units[0].amount.value,"1.00");
});
test("a $1 checkout captures only for the test-account price",async()=>{
  const paidOrder=paypalOrder("APPROVED",{purchase_units:[{custom_id:owner.orderId,amount:{currency_code:"USD",value:"1.00"}}]});
  const f=fixture([paidOrder,{id:"paypal-order-a"},paypalOrder("COMPLETED",{purchase_units:paidOrder.purchase_units})]);
  await f.capturePayPalOrder("paypal-order-a",{...owner,priceUsd:f.songPriceUsdForEmail("victorview888@gmail.com")});
  assert.equal(f.writes.length,1);
});
test("a $1 checkout is rejected for an ordinary account before capture",async()=>{
  const paidOrder=paypalOrder("APPROVED",{purchase_units:[{custom_id:owner.orderId,amount:{currency_code:"USD",value:"1.00"}}]});
  const f=fixture([paidOrder]);
  await assert.rejects(f.capturePayPalOrder("paypal-order-a",{...owner,priceUsd:f.songPriceUsdForEmail("another@example.com")}),/does not match/);
  assert.equal(f.calls.filter(c=>c.url.endsWith("/capture")).length,0);
  assert.equal(f.writes.length,0);
});
test("captures the matching order once and constrains writes to its owner",async()=>{
  const f=fixture([paypalOrder(),paypalOrder("COMPLETED"),paypalOrder("COMPLETED")]);
  const result=await f.capturePayPalOrder("paypal-order-a",owner);
  assert.equal(result.orderId,owner.orderId);assert.equal(f.calls.filter(c=>c.url.endsWith("/capture")).length,1);
  assert.equal(f.calls.find(c=>c.url.endsWith("/capture")).init.headers["PayPal-Request-Id"],owner.orderId);
  assert.deepEqual(f.filters,[["id",owner.orderId],["user_id",owner.userId],["paypal_order_id","paypal-order-a"],["paid_at",null]]);
});
test("completed payment is idempotent and cannot reset a later generation status",async()=>{
  const f=fixture([paypalOrder("COMPLETED")]);await f.capturePayPalOrder("paypal-order-a",owner);
  assert.equal(f.calls.filter(c=>c.url.endsWith("/capture")).length,0);assert.ok(f.filters.some(([key,value])=>key==="paid_at"&&value===null));
});
test("failed capture never marks an order paid",async()=>{
  const f=fixture([paypalOrder(),{httpStatus:422,body:{message:"Payment declined"}},paypalOrder()]);
  await assert.rejects(f.capturePayPalOrder("paypal-order-a",owner),/not completed/);assert.equal(f.writes.length,0);
});
