import assert from 'node:assert/strict';
import test, {before,after,beforeEach} from 'node:test';
import {fixture,userId,otherId} from './helpers/customer-fixture.mjs';

const list='src/app/api/account/payments/route.ts',detail='src/app/api/account/payments/[id]/route.ts';
let f;before(async()=>{f=await fixture();});after(()=>f?.close());beforeEach(()=>f.setFail({}));
const get=(id,user=userId)=>f.request(detail,'GET',null,user,{id});
test('payment records require login, constrain privileged reads and return a minimal owned projection',async()=>{
 const id=await f.order({paid:true}),foreign=await f.order({owner:otherId,paid:true});
 assert.equal((await get(id,null)).status,401);assert.equal((await get(foreign)).status,404);assert.equal((await get('not-an-order')).status,404);
 const record=await (await get(id)).json();assert.equal(record.record.orderId,id);assert.equal(record.record.transactions[0].amountMinor,999);assert.equal(record.record.transactions[0].environment,'sandbox');
 assert.doesNotMatch(JSON.stringify(record),/Private story|confirmed song|fee_minor|lease_token|storage_path|paypal_order_id|owner@/);
 const response=await f.request(list,'GET',null,userId,{},'?userId='+otherId);assert.equal(response.status,200);const page=await response.json();assert.ok(page.orders.some(r=>r.orderId===id));assert.ok(page.orders.every(r=>r.orderId!==foreign));
});
test('quote-only and historical payments keep their original uncertainty rather than current prices',async()=>{
 const quoted=await f.order();await f.rpc('prepare_songgift_checkout',{p_order_id:quoted,p_user_id:userId,p_amount_minor:1299,p_environment:'live',p_price_version:'old-price'});
 f.env.SONG_PRICE_USD='88.88';const q=await (await get(quoted)).json();assert.equal(q.record.quote.amountMinor,1299);assert.equal(q.record.transactions.length,0);
 const historical=await f.order({legacy:true});const h=await (await get(historical)).json();assert.ok(h.record.paidAt);assert.equal(h.record.quote,null);assert.equal(h.record.transactions.length,0);
 const {paymentSummary,paymentMoney}=f.load('src/lib/account/payment-display.ts');assert.equal(paymentSummary(h.record).amount,'Amount unverified');assert.equal(paymentSummary(q.record).label,'No verified payment recorded');assert.equal(paymentMoney(null,'USD'),'Amount unverified');assert.equal(paymentMoney(0,'USD'),'$0.00');
});
test('verified partial and full refunds remain distinct from capture and from sandbox tests',async()=>{
 const id=await f.order({paid:true});const insert=async amount=>f.db.query("insert into public.payment_transactions(order_id,provider,environment,transaction_type,external_id,amount_minor,currency,occurred_at) values($1,'paypal','sandbox','refund',$2,$3,'USD',now())",[id,'REF-'+crypto.randomUUID(),amount]);
 await insert(400);const {paymentSummary}=f.load('src/lib/account/payment-display.ts');let record=(await (await get(id)).json()).record;assert.equal(paymentSummary(record).label,'Partial refund recorded');assert.equal(paymentSummary(record).amount,'$9.99');assert.equal(paymentSummary(record).test,true);
 await insert(599);record=(await (await get(id)).json()).record;assert.equal(paymentSummary(record).label,'Refund recorded');assert.equal(record.transactions.length,3);
});
test('pagination is bounded, deterministic for equal timestamps, and excludes unfinished unquoted drafts',async()=>{
 const unquoted=await f.order(),ids=[];
 for(let i=0;i<13;i++){const id=await f.order({legacy:true});ids.push(id);await f.db.query("update public.song_orders set created_at='2090-01-01T00:00:00Z' where id=$1",[id]);}
 const first=await (await f.request(list,'GET',null,userId,{},'?page=0')).json(),second=await (await f.request(list,'GET',null,userId,{},'?page=1')).json();
 assert.equal(first.pageSize,10);assert.equal(first.orders.length,10);assert.equal(new Set([...first.orders,...second.orders].map(r=>r.orderId)).size,first.orders.length+second.orders.length);assert.deepEqual(first.orders.map(r=>r.orderId),ids.sort().reverse().slice(0,10));assert.ok([...first.orders,...second.orders].every(r=>r.orderId!==unquoted));
 for(const page of ['-1','0.1','10001','abc','9999999999',''])assert.equal((await f.request(list,'GET',null,userId,{},'?page='+page)).status,400);
});
test('unavailable history fails visibly; bounded transaction history does not invent totals',async()=>{
 const id=await f.order({paid:true});f.setFail({paymentHistory:true});assert.equal((await get(id)).status,503);assert.equal((await f.request(list,'GET')).status,503);f.setFail({});
 for(let i=0;i<51;i++)await f.db.query("insert into public.payment_transactions(order_id,provider,environment,transaction_type,external_id,amount_minor,currency,occurred_at) values($1,'paypal','sandbox','refund',$2,1,'USD',now())",[id,'REF-'+crypto.randomUUID()]);
 const record=(await (await get(id)).json()).record;assert.equal(record.transactions.length,50);assert.equal(record.historyTruncated,true);const summary=f.load('src/lib/account/payment-display.ts').paymentSummary(record);assert.equal(summary.amount,'Amount unverified');assert.equal(summary.test,true);
});
test('support inbox configuration rejects header injection and never falls back to a sender address',()=>{
 const {getSupportEmail}=f.load('src/lib/support.ts');f.env.SONGGIFT_FROM_EMAIL='sender@isolated.example';assert.equal(getSupportEmail(),null);
 f.env.SONGGIFT_SUPPORT_EMAIL='Support@Isolated.example';assert.equal(getSupportEmail(),'support@isolated.example');
 for(const value of ['support@isolated.example\r\nBcc: bad@example.com','support@example.com?subject=bad','not an email']){f.env.SONGGIFT_SUPPORT_EMAIL=value;assert.equal(getSupportEmail(),null);}
});
