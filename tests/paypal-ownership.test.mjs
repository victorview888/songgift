import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const quote={id:'c3f10454-1234-4234-8234-000000000001',quoted_amount_minor:999,currency:'USD',payment_environment:'sandbox',quoted_at:'2026-11-06T00:00:00Z',price_version:'v1'};
const owner={userId:'customer-a',quote};
const capture={id:'CAP-A',status:'COMPLETED',final_capture:true,create_time:'2026-11-06T01:00:00Z',amount:{currency_code:'USD',value:'9.99'}};
const order=(status='APPROVED',extra={})=>({id:'PP-A',status,purchase_units:[{custom_id:quote.id,amount:{currency_code:'USD',value:'9.99'},...(status==='COMPLETED'?{payments:{captures:[capture]}}:{})}],links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=A'}],...extra});
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function fixture(responses,envOverrides={}) {
 const calls=[],writes=[],queue=[{access_token:'test-token'},...responses];
 const env={PAYPAL_CLIENT_ID:'test-id',PAYPAL_CLIENT_SECRET:'test-secret',PAYPAL_LIVE_CLIENT_ID:'live-id',PAYPAL_LIVE_CLIENT_SECRET:'live-secret',PAYPAL_ENVIRONMENT:'sandbox',...envOverrides};
 const usdMinor=value=>{if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))throw new Error('invalid');const [whole,decimal='']=value.split('.');return Number(whole)*100+Number(decimal.padEnd(2,'0'));};
 const imports={'@/lib/auth/server':{HttpError},'@/lib/http-error':{HttpError},'@/lib/payments/capture-guard':{assertPayPalCaptureAllowed:async()=>{}},'@/lib/services/order-operations':{usdMinor,recordVerifiedCapture:async data=>{writes.push(data);}}};
 const globals={Buffer,URL,AbortSignal,process:{env},fetch:async(url,init)=>{calls.push({url,init});const next=queue.shift();assert.ok(next,'Unexpected provider request');if(next instanceof Error)throw next;return new Response(JSON.stringify(next.body||next),{status:next.httpStatus||200});}};
 const compiled=ts.transpileModule(readFileSync('src/lib/paypal.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={};vm.runInNewContext('(function(exports,require){'+compiled+'\n})',globals)(api,id=>{assert.ok(imports[id],id);return imports[id];});
 return {...api,calls,writes};
}

test('new checkout uses the snapshot amount/environment and a stable create request ID',async()=>{
 const f=fixture([order()],{PAYPAL_ENVIRONMENT:'live',SONG_PRICE_USD:'29.99'});
 await f.createPayPalOrder(quote,{returnUrl:'https://example.com/return',cancelUrl:'https://example.com/cancel'});
 assert.match(f.calls[0].url,/sandbox/);const create=f.calls[1];assert.equal(create.init.headers['PayPal-Request-Id'],'sg-create-'+quote.id);
 assert.equal(JSON.parse(create.init.body).purchase_units[0].amount.value,'9.99');
 assert.equal(f.calls[0].init.headers.Authorization,'Basic '+Buffer.from('test-id:test-secret').toString('base64'));
});
test('a stored Live quote selects Live credentials even after the current default changes',async()=>{
 const live={...quote,payment_environment:'live'};const f=fixture([order('APPROVED',{links:[{rel:'approve',href:'https://www.paypal.com/checkoutnow?token=A'}]})]);
 await f.createPayPalOrder(live,{returnUrl:'https://example.com',cancelUrl:'https://example.com'});assert.equal(new URL(f.calls[0].url).host,'api-m.paypal.com');assert.equal(f.calls[0].init.headers.Authorization,'Basic '+Buffer.from('live-id:live-secret').toString('base64'));
});
test('reopening an associated checkout uses GET instead of creating another payment',async()=>{
 const f=fixture([order()]);await f.createPayPalOrder(quote,{returnUrl:'https://example.com',cancelUrl:'https://example.com'},'PP-A');assert.equal(f.calls[1].init.method,undefined);assert.equal(f.calls.length,2);
});
test('captures a matching approved order and records complete provider evidence',async()=>{
 const f=fixture([order(),order('COMPLETED'),order('COMPLETED')]);await f.capturePayPalOrder('PP-A',owner);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/capture')).length,1);assert.equal(f.calls.find(c=>c.url.endsWith('/capture')).init.headers['PayPal-Request-Id'],'sg-capture-'+quote.id);
 assert.deepEqual(JSON.parse(JSON.stringify(f.writes)),[{orderId:quote.id,userId:owner.userId,paypalOrderId:'PP-A',captureId:'CAP-A',environment:'sandbox',amountMinor:999,currency:'USD',occurredAt:'2026-11-06T01:00:00.000Z'}]);
});
test('completed orders are read and recorded without capturing again',async()=>{const f=fixture([order('COMPLETED')]);await f.capturePayPalOrder('PP-A',owner);assert.equal(f.calls.length,2);assert.equal(f.writes.length,1);});
test('a lost capture response is resolved by reading the same order',async()=>{const f=fixture([order(),new Error('timeout'),order('COMPLETED')]);await f.capturePayPalOrder('PP-A',owner);assert.equal(f.writes.length,1);assert.equal(f.calls.filter(c=>c.url.endsWith('/capture')).length,1);});
for(const [name,unit] of [
 ['foreign custom ID',{custom_id:'OTHER',amount:{currency_code:'USD',value:'9.99'}}],
 ['wrong currency',{custom_id:quote.id,amount:{currency_code:'EUR',value:'9.99'}}],
 ['changed price',{custom_id:quote.id,amount:{currency_code:'USD',value:'1.00'}}],
 ['scientific notation',{custom_id:quote.id,amount:{currency_code:'USD',value:'9.99e0'}}],
])test('rejects '+name+' before capture',async()=>{const f=fixture([order('APPROVED',{purchase_units:[unit]})]);await assert.rejects(f.capturePayPalOrder('PP-A',owner),e=>e.status===409);assert.equal(f.writes.length,0);assert.equal(f.calls.filter(c=>c.url.endsWith('/capture')).length,0);});
for(const [name,bad] of [
 ['missing capture',[]],['pending capture',[{...capture,status:'PENDING'}]],['refunded capture',[{...capture,status:'REFUNDED'}]],['partial capture',[{...capture,final_capture:false}]],
 ['mismatched capture amount',[{...capture,amount:{currency_code:'USD',value:'1.00'}}]],['invalid timestamp',[{...capture,create_time:'invalid'}]],['multiple captures',[capture,{...capture,id:'CAP-B'}]],
])test('does not record '+name,async()=>{const f=fixture([order('COMPLETED',{purchase_units:[{custom_id:quote.id,amount:{currency_code:'USD',value:'9.99'},payments:{captures:bad}}]})]);await assert.rejects(f.capturePayPalOrder('PP-A',owner),e=>e.status===409);assert.equal(f.writes.length,0);});
test('failed capture does not create a local payment fact',async()=>{const f=fixture([order(),{httpStatus:422,body:{message:'declined'}},order()]);await assert.rejects(f.capturePayPalOrder('PP-A',owner),e=>e.status===409);assert.equal(f.writes.length,0);});
test('unapproved checkout and unsafe approval URL are rejected',async()=>{
 const pending=fixture([order('CREATED')]);await assert.rejects(pending.capturePayPalOrder('PP-A',owner),e=>e.status===409);assert.equal(pending.calls.length,2);
 const unsafe=fixture([order('APPROVED',{links:[{rel:'approve',href:'https://evil.example/steal'}]})]);await assert.rejects(unsafe.createPayPalOrder(quote,{returnUrl:'https://example.com',cancelUrl:'https://example.com'}),e=>e.status===409);
});
