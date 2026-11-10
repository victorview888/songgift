import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test,{before,after,beforeEach} from 'node:test';
import {fixture,userId,otherId} from './helpers/customer-fixture.mjs';
const keys=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const checkout='src/app/api/payments/waffo/checkout/route.ts',status='src/app/api/payments/waffo/status/route.ts',webhook='src/app/api/webhooks/waffo/route.ts',methods='src/app/api/payments/methods/route.ts';
let f;before(async()=>{f=await fixture();});after(()=>f?.close());beforeEach(()=>{
 f.setFail({});Object.assign(f.env,{WAFFO_ENABLED:'true',WAFFO_ENVIRONMENT:'test',WAFFO_MERCHANT_ID:'MER_'+ 'A'.repeat(22),WAFFO_STORE_ID:'STO_'+ 'B'.repeat(22),WAFFO_PRODUCT_ID:'PROD_'+ 'C'.repeat(22),WAFFO_PRIVATE_KEY:keys.privateKey,WAFFO_WEBHOOK_PUBLIC_KEY:keys.publicKey,SONGGIFT_SITE_URL:'https://songgift.isolated.example',PAYPAL_ENVIRONMENT:'sandbox'});
});
async function open(id=undefined){id ||= await f.order();const response=await f.request(checkout,'POST',{orderId:id,amount:'0.01',currency:'CNY',productId:'INJECTED'});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return {id,...await response.json()};}
function event(c,overrides={}){
 const paymentId='PAY_'+crypto.randomUUID().replaceAll('-','');
 return {id:paymentId,eventId:paymentId,eventType:'order.completed',timestamp:new Date().toISOString(),storeId:f.env.WAFFO_STORE_ID,mode:'test',data:{orderId:'ORD_'+crypto.randomUUID().replaceAll('-',''),orderStatus:'completed',paymentStatus:'succeeded',paymentId,chargedAmount:'9.99',currency:'USD',orderMerchantExternalId:c.checkoutId},...overrides};
}
async function notify(e,{signature,raw,timestamp=Date.now()}={}){
 raw ||= JSON.stringify(e);signature ??= 't='+timestamp+',v1='+sign('sha256',Buffer.from(timestamp+'.'+raw),keys.privateKey).toString('base64');
 return f.load(webhook).POST(new Request('https://songgift.isolated.example/api/webhooks/waffo',{method:'POST',headers:{'x-waffo-signature':signature,'content-type':'application/json'},body:raw}));
}
async function count(id,table='payment_transactions'){return (await f.db.query('select count(*)::int n from public.'+table+' where order_id=$1',[id])).rows[0].n;}

test('only configured methods are offered; checkout requires owner, correct environment and active one-time product',async()=>{
 let r=await f.request(methods,'GET');assert.deepEqual((await r.json()).methods.map(m=>[m.id,m.available]),[['paypal',true],['waffo',true]]);
 f.env.WAFFO_ENABLED='false';r=await f.request(methods,'GET');assert.equal((await r.json()).methods[1].available,false);
 const id=await f.order();assert.equal((await f.request(checkout,'POST',{orderId:id})).status,503);f.env.WAFFO_ENABLED='true';
 assert.equal((await f.request(checkout,'POST',{orderId:id},null)).status,401);assert.equal((await f.request(checkout,'POST',{orderId:id},otherId)).status,404);
 f.env.WAFFO_ENVIRONMENT='prod';assert.equal((await f.request(checkout,'POST',{orderId:id})).status,409);f.env.WAFFO_ENVIRONMENT='test';
 f.setFail({waffoSubscription:true});const before=f.waffoSessions.size;assert.equal((await f.request(checkout,'POST',{orderId:id})).status,503);assert.equal(f.waffoSessions.size,before);
});
test('server quote, buyer and business reference are frozen; repeats and lost responses reuse one session',async()=>{
 const c=await open();const session=[...f.waffoSessions.values()].find(s=>s.body.orderMerchantExternalId===c.checkoutId);
 assert.equal(session.body.priceSnapshot.amount,'9.99');assert.equal(session.body.priceSnapshot.taxIncluded,true);assert.equal(session.body.allowPromotionCodes,false);assert.equal(session.body.productId,f.env.WAFFO_PRODUCT_ID);
 assert.equal(session.body.buyerEmail,'owner@isolated.example');assert.equal(new URL(session.body.successUrl).searchParams.get('checkout'),c.checkoutId);
 const again=await open(c.id);assert.equal(again.checkoutId,c.checkoutId);assert.equal(again.checkoutUrl,c.checkoutUrl);
 const id=await f.order();f.setFail({waffoTimeout:true});assert.equal((await f.request(checkout,'POST',{orderId:id})).status,503);const pending=(await f.db.query('select id from public.waffo_checkouts where order_id=$1',[id])).rows[0];
 f.setFail({});const retried=await open(id);assert.equal(retried.checkoutId,pending.id);assert.equal([...f.waffoSessions.values()].filter(s=>s.body.orderMerchantExternalId===pending.id).length,1);
});
test('signed completed event atomically records payment once and enables exactly one original generation',async()=>{
 const c=await open(),e=event(c);let r=await notify(e);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).outcome,'recorded');
 r=await notify(e);assert.equal((await r.json()).replayed,true);assert.equal(await count(c.id),1);
 assert.equal((await f.db.query('select paid_at from public.song_orders where id=$1',[c.id])).rows[0].paid_at!==null,true);
 const s=await f.request(status,'GET',null,userId,{},'?orderId='+c.id+'&checkout='+c.checkoutId);assert.equal((await s.json()).paid,true);
 assert.equal((await f.request(status,'GET',null,otherId,{},'?orderId='+c.id+'&checkout='+c.checkoutId)).status,404);
 const before=f.generateCalls;const generated=await Promise.all([f.request('src/app/api/music/route.ts','POST',{orderId:c.id}),f.request('src/app/api/music/route.ts','POST',{orderId:c.id})]);assert.ok(generated.every(r=>r.status===200));assert.equal(f.generateCalls-before,1);
 const history=await f.request('src/app/api/account/payments/[id]/route.ts','GET',null,userId,{id:c.id});assert.equal((await history.json()).record.transactions[0].provider,'waffo');
});
test('failed event persistence is not acknowledged; concurrent callback retries commit one capture',async()=>{
 const c=await open(),e=event(c);f.setFail({waffoRecord:true});assert.equal((await notify(e)).status,503);assert.equal(await count(c.id),0);
 f.setFail({});const responses=await Promise.all([notify(e),notify(e)]);assert.ok(responses.every(response=>response.status===200));assert.equal(await count(c.id),1);
 const events=await f.db.query('select count(*)::int n from public.waffo_webhook_events where checkout_id=$1',[c.checkoutId]);assert.equal(events.rows[0].n,1);
});
test('bad, altered, stale or future signatures and test/live mixups never mark paid',async()=>{
 const c=await open(),e=event(c);
 for(const options of [{signature:'bad'},{timestamp:Date.now()-46*60000},{timestamp:Date.now()+120000}])assert.equal((await notify(e,options)).status,401);
 const raw=JSON.stringify(e),t=Date.now(),signature='t='+t+',v1='+sign('sha256',Buffer.from(t+'.'+raw),keys.privateKey).toString('base64');
 assert.equal((await notify(e,{raw:raw+' ',signature})).status,401);
 assert.equal((await notify({...e,mode:'prod'})).status,400);
 assert.equal(await count(c.id),0);
 // Platform retries keep the original signature: a valid 31-minute-old one is accepted.
 assert.equal((await notify(e,{timestamp:Date.now()-31*60000})).status,200);
});
test('missing charge amounts, wrong store and fabricated references cannot fulfill an order',async()=>{
 const c=await open(),e=event(c);
 assert.equal((await notify({...e,data:{...e.data,chargedAmount:undefined,amount:'9.99',total:'9.99'}})).status,400);
 assert.equal((await notify({...e,storeId:'STO_'+'Z'.repeat(22)})).status,409);
 assert.equal((await notify({...e,data:{...e.data,orderMerchantExternalId:crypto.randomUUID()}})).status,200);
 assert.equal(await count(c.id),0);
 const r=await f.request(status,'GET',null,userId,{},'?orderId='+c.id+'&checkout='+c.checkoutId);assert.equal((await r.json()).paid,false);
});
test('amount mismatch and cross-provider second charge are kept for review rather than granting another fulfillment',async()=>{
 const c=await open(),e=event(c);let r=await notify({...e,data:{...e.data,chargedAmount:'0.01'}});assert.equal(r.status,200);assert.equal((await r.json()).outcome,'needs_review');assert.equal(await count(c.id),0);
 assert.equal((await openAttempt(c.id)).status,409);
 const id=await f.order(),second=await open(id);await f.rpc('bind_songgift_checkout',{p_order_id:id,p_user_id:userId,p_paypal_order_id:'PP-'+id});await f.rpc('record_songgift_capture',{p_order_id:id,p_user_id:userId,p_paypal_order_id:'PP-'+id,p_capture_id:'CAP-'+id,p_environment:'sandbox',p_amount_minor:999,p_currency:'USD',p_occurred_at:new Date().toISOString()});
 r=await notify(event(second));assert.equal((await r.json()).outcome,'needs_review');assert.equal(await count(id),1);
 assert.equal((await f.request('src/app/api/music/route.ts','POST',{orderId:id})).status,409);
});
const openAttempt=id=>f.request(checkout,'POST',{orderId:id});
test('partial/full refund events use actual refunded amounts, deduplicate and block new generation after full refund',async()=>{
 const c=await open(),e=event(c);await notify(e);
 const refund={...e,id:'RFN_'+crypto.randomUUID(),eventId:'RFN_'+crypto.randomUUID(),eventType:'refund.succeeded',data:{...e.data,refundStatus:'succeeded',refundedAmount:'4.00',total:'9.99'}};
 let r=await notify(refund);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).outcome,'recorded');await notify(refund);assert.equal(await count(c.id),2);
 r=await notify({...refund,eventId:'RFN_'+crypto.randomUUID(),data:{...refund.data,refundedAmount:'5.99'}});assert.equal(r.status,200);assert.equal(await count(c.id),3);
 assert.equal((await f.request('src/app/api/music/route.ts','POST',{orderId:c.id})).status,409);
 const history=(await(await f.request('src/app/api/account/payments/[id]/route.ts','GET',null,userId,{id:c.id})).json()).record;assert.equal(f.load('src/lib/account/payment-display.ts').paymentSummary(history).label,'Refund recorded');
});
test('refund arriving before payment remains retryable; payment failure and oversized webhook cannot unlock generation',async()=>{
 const c=await open(),e=event(c),refund={...e,eventId:'RFN_'+crypto.randomUUID(),eventType:'refund.succeeded',data:{...e.data,refundStatus:'succeeded',refundedAmount:'1.00'}};
 assert.equal((await notify(refund)).status,503);assert.equal(await count(c.id),0);
 assert.equal((await notify({...e,data:{...e.data,paymentStatus:'failed'}})).status,400);
 assert.equal((await notify(e,{raw:'x'.repeat(65537)})).status,413);
 await notify(e);assert.equal((await notify(refund)).status,200);
});
test('checkout expiry creates a new reference while callbacks for the original stay attributable',async()=>{
 const c=await open();await f.db.query("update public.waffo_checkouts set expires_at=now()-interval '1 second' where id=$1",[c.checkoutId]);
 const next=await open(c.id);assert.notEqual(next.checkoutId,c.checkoutId);assert.equal((await notify(event(c))).status,200);assert.equal(await count(c.id),1);
});
test('returning to an old approved PayPal tab after Waffo payment never captures again; a completed race retains review evidence',async()=>{
 const id=await f.order(),paypalResponse=await f.request('src/app/api/paypal/create-order/route.ts','POST',{orderId:id});
 const paypal=await paypalResponse.json();assert.equal(paypalResponse.status,200);
 const c=await open(id);await notify(event(c));
 let response=await f.request('src/app/api/paypal/capture-order/route.ts','POST',{paypalOrderId:paypal.id});assert.equal(response.status,409);
 assert.equal(f.calls.filter(call=>call.url?.endsWith('/'+paypal.id+'/capture')).length,0);
 const remote=f.paypal.get(paypal.id);remote.status='COMPLETED';remote.purchase_units[0].payments={captures:[{id:'CAP-RACE-'+id,status:'COMPLETED',final_capture:true,create_time:new Date().toISOString(),amount:remote.purchase_units[0].amount}]};
 response=await f.request('src/app/api/paypal/capture-order/route.ts','POST',{paypalOrderId:paypal.id});assert.equal(response.status,409);
 const reviews=await f.db.query('select external_id from public.payment_capture_reviews where order_id=$1',[id]);assert.deepEqual(reviews.rows,[{external_id:'CAP-RACE-'+id}]);
 assert.equal(await count(id),1);assert.equal((await f.request('src/app/api/music/route.ts','POST',{orderId:id})).status,409);
});
test('new tables and RPCs remain service-only and URL validation rejects untrusted redirects',async()=>{
 const rights=await f.db.query("select has_table_privilege('authenticated','public.waffo_checkouts','select') as readable,has_function_privilege('anon','public.record_songgift_waffo_event(uuid,text,text,text,text,text,text,text,integer,text,timestamptz)','execute') as callable");assert.deepEqual(rights.rows,[{readable:false,callable:false}]);
 const {safeWaffoCheckoutUrl}=f.load('src/lib/payments/waffo.ts');for(const url of ['https://evil.example/pay','https://pancake.waffo.ai.evil.example/pay','http://pancake.waffo.ai/pay','https://name@pancake.waffo.ai/pay'])assert.throws(()=>safeWaffoCheckoutUrl(url));
 assert.equal(safeWaffoCheckoutUrl('https://pancake.waffo.ai/store/test/checkout/test'),'https://pancake.waffo.ai/store/test/checkout/test');
 assert.match(readFileSync('supabase/migrations/20261109130330_waffo_payments.sql','utf8'),/enable row level security/);
});
test('incremental migration preserves existing paid orders and assets and gives ordinary accounts no new capabilities',async()=>{
 const previous=await fixture({legacyPayments:true});
 try {
  const id=await previous.order({paid:true}),asset=crypto.randomUUID();await previous.db.query("insert into public.song_assets(id,order_id,storage_bucket,storage_path,mime_type,provider,model_id,is_final) values($1,$2,'songs','original/final.wav','audio/wav','fal','original-model',true)",[asset,id]);
  const before=await previous.db.query('select to_jsonb(o) as original from public.song_orders o where id=$1',[id]);
  await previous.db.exec('reset role');await previous.db.exec(readFileSync('supabase/migrations/20261109130330_waffo_payments.sql','utf8'));await previous.db.exec('set role service_role');
  assert.deepEqual((await previous.db.query('select to_jsonb(o) as original from public.song_orders o where id=$1',[id])).rows,before.rows);
  assert.equal((await previous.db.query('select storage_path from public.song_assets where id=$1',[asset])).rows[0].storage_path,'original/final.wav');
  const checks=await previous.db.query("select has_table_privilege('anon','public.payment_capture_reviews','select') as exposed,has_function_privilege('authenticated','public.begin_songgift_waffo_checkout(uuid,uuid,text,text,text,text,text)','execute') as callable");assert.deepEqual(checks.rows,[{exposed:false,callable:false}]);
 } finally {await previous.close();}
});
