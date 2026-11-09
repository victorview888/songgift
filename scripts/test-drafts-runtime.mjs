import assert from 'node:assert/strict';
const base=process.env.SONGGIFT_DRAFT_TEST_URL||'http://localhost:3002';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Only loopback application targets are permitted');
const origin='http://127.0.0.1:54330',userId='a3f10454-1234-4234-8234-012345678901',otherId='b3f10454-1234-4234-8234-012345678902';
const jar=new Map();let count=0;const ok=label=>{count++;console.log('PASS '+label);};
async function request(path,body,login=true){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(login?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}:{})},body:JSON.stringify(body)});for(const cookie of r.headers.getSetCookie()){const [key,value]=cookie.split(';')[0].split('=');jar.set(key,value);}return r;}
const key=crypto.randomUUID(),input={recipientName:'Emma',relationship:'Partner',occasion:'Birthday',story:'Our favorite memory is an afternoon walking beside the river.',mood:'Warm and heartfelt',style:'Acoustic pop',clientRequestId:key,draftOwnerId:userId};
assert.equal((await request('/api/lyrics',input,false)).status,401);ok('Guest writing rejected before any request reservation');
assert.equal((await request('/api/auth/verify',{email:'owner@isolated.example',code:'123456'})).status,200);
const writes=await Promise.all([request('/api/lyrics',input),request('/api/lyrics',input)]);assert.ok(writes.every(r=>[200,202].includes(r.status)));const results=await Promise.all(writes.map(r=>r.json()));assert.equal(results[0].orderId,results[1].orderId);ok('Concurrent requests share one saved order');
const replay=await request('/api/lyrics',input);assert.equal(replay.status,200);const ready=await replay.json();assert.ok(ready.lyricsText.includes('Emma'));assert.equal(ready.leaseToken,undefined);ok('Repeated request resumes stored lyrics without exposing a lease');
assert.equal((await request('/api/paypal/quote',{orderId:ready.orderId})).status,200);assert.equal((await (await request('/api/lyrics',input)).json()).orderId,ready.orderId);ok('Checkout return resumes the same order');
assert.equal((await request('/api/lyrics',{...input,story:'A changed story must use a new request identifier.'})).status,409);ok('Changed input cannot overwrite the previous request');
jar.clear();assert.equal((await request('/api/auth/verify',{email:'other@isolated.example',code:'123456'})).status,200);assert.equal((await request('/api/lyrics',input)).status,409);assert.equal((await request('/api/lyrics',{...input,draftOwnerId:otherId})).status,404);ok('Changed identity and foreign request replay are rejected');
const recorded=await (await fetch(origin+'/__fixture__/stories?requestId='+key)).json();assert.equal(recorded.requests.length,1);assert.equal(recorded.requests[0].order_id,ready.orderId);assert.equal(recorded.requests[0].state,'ready');ok('Database retains one private request and order');
console.log(count+' draft runtime checks passed');
