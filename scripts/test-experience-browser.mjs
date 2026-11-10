import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = process.env.SONGGIFT_UI_URL || 'http://localhost:3035';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname), 'Local isolated target required');
const artifacts = process.env.SONGGIFT_UI_ARTIFACTS || '/tmp/songgift-experience-preview';
await mkdir(artifacts, { recursive: true });
const id = '00000000-0000-4000-8000-000000000535';
const initial = { id, status:'lyrics_ready', recipient_name:'Emma', relationship:'Partner', occasion:'Anniversary', story:'An isolated browser-only story.', mood:'Warm', style:'Acoustic pop', title:'All the Little Things', lyrics_text:'[Verse]\nThe little things you always do\nBring me right back home to you\n\n[Chorus]\nA song for every memory\nThe moments that mean everything', paid_at:null, created_at:'2026-11-10T00:00:00Z', updated_at:'2026-11-10T00:00:00Z', provider_job_id:null, generation_error:null, song_assets:[] };
const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(16000,40);
const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox'] });
try {
 for (const width of process.env.SONGGIFT_UI_ADMIN_ONLY ? [] : [1440,768,390,320]) {
  const context = await browser.newContext({ viewport:{width,height:900} }), page = await context.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  let signedIn=true, sessionFailure=false, order={...initial}, phase='needs_review', audioFailure=true, musicFailure=false;
  let held=null, race=false, orderLoads=0, authLoads=0, delayedOtp=null;
  await context.route('**/samples/ui-fixture.wav',route=>route.fulfill({status:200,contentType:'audio/wav',body:wav}));
  await context.route('**/api/**',async route=>{
   const request=route.request(), url=new URL(request.url()), path=url.pathname;
   if(path==='/api/auth/session'){authLoads++;return route.fulfill(sessionFailure ? {status:503,json:{error:'Temporary session outage'}} : {json:{user:signedIn?{id:'browser-owner',email:'preview@isolated.example'}:null}});}
   if(path==='/api/auth/request'){if(delayedOtp){delayedOtp(route);return;}return route.fulfill({json:{message:'Mock code sent'}});}
   if(path==='/api/orders/'+id){orderLoads++;if(request.method()==='PATCH')order={...order,lyrics_text:request.postDataJSON().lyricsText};return route.fulfill({json:{order,checkoutPrice:{currencyCode:'USD',value:'9.99'}}});}
   if(path==='/api/orders'){
    const filter=url.searchParams.get('filter'); if(race&&filter==='ready'){held=route;return;}
    return route.fulfill({json:{orders:[{...initial,title:filter==='draft'?'Current draft':initial.title}],total:1}});
   }
   if(path==='/api/paypal/capture-order')return route.fulfill({json:{orderId:id}});
   if(path==='/api/music')return route.fulfill(musicFailure?{status:503,json:{error:'Song is saved. Please continue generation.'}}:{json:{status:'queued'}});
   if(path.startsWith('/api/music/status/'))return route.fulfill({json:{status:phase,phase}});
   if(path.endsWith('/audio'))return route.fulfill(audioFailure?{status:503,json:{error:'Mock audio unavailable'}}:{status:200,contentType:'audio/wav',body:wav});
   throw new Error('Unexpected request blocked: '+request.method()+' '+path);
  });
  for(const [name,path] of [['home','/'],['create','/create'],['pricing','/pricing'],['help','/help'],['lyrics','/lyrics/'+id],['library','/my-songs']]){
   await page.goto(base+path,{waitUntil:'networkidle'});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflow at '+width);
   if(width===1440||width===390)await page.screenshot({path:`${artifacts}/${name}-${width}.png`,fullPage:true});
  }
  await page.goto(base+'/');
  if(await page.getByRole('region',{name:'Song samples'}).count()){ await page.locator('#samples audio').first().evaluate(audio=>audio.load()); await page.waitForFunction(()=>document.querySelector('#samples audio')?.duration===1); }
  await page.goto(base+'/lyrics/'+id,{waitUntil:'networkidle'});
  const editor=page.getByRole('textbox',{name:'Song lyrics'}), edited=initial.lyrics_text+'\nMy unsaved edit';
  await editor.fill(edited); const before=orderLoads, authBefore=authLoads;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>true); await page.waitForTimeout(200);
  assert.ok(authLoads>authBefore); assert.equal(orderLoads,before); assert.equal(await editor.inputValue(),edited);
  sessionFailure=true; await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByRole('button',{name:'Retry connection'}).waitFor(); assert.equal(await editor.inputValue(),edited); assert.ok(page.url().includes('/lyrics/'));
  sessionFailure=false;await page.getByRole('button',{name:'Retry connection'}).click();await page.getByRole('button',{name:'Retry connection'}).waitFor({state:'detached'});
  page.once('dialog',dialog=>dialog.accept()); await page.reload({waitUntil:'networkidle'}); assert.equal(await editor.inputValue(),edited);
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'← My Songs',exact:true}).click();assert.ok(page.url().includes('/lyrics/'));
  await page.getByRole('button',{name:'Save lyrics',exact:true}).click();await page.getByText('Lyrics saved successfully.',{exact:false}).waitFor();
  await page.getByRole('link',{name:'← My Songs',exact:true}).click();await page.waitForURL('**/my-songs');
  race=true;await page.getByRole('button',{name:'Ready to play',exact:true}).click();
  await page.waitForTimeout(100);assert.ok(held);await page.getByRole('button',{name:'Drafts',exact:true}).click();
  await page.getByRole('heading',{name:'Current draft',exact:true}).waitFor();
  await held.fulfill({json:{orders:[{...initial,title:'Stale ready result'}],total:1}}).catch(()=>{});
  await page.waitForTimeout(100);assert.equal(await page.locator('.library-song-card h2').innerText(),'Current draft');
  order={...initial};musicFailure=true;
  await page.goto(base+'/lyrics/'+id+'?token=mock-paypal-return');await page.getByRole('button',{name:'Create my song',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^Pay /}).count(),0);
  await page.getByRole('heading',{name:'Payment confirmed',exact:true}).waitFor();
  musicFailure=false;order={...initial,status:'generating',provider_job_id:'mock-job',paid_at:initial.created_at};
  await page.goto(base+'/song/'+id);await page.locator('.song-progress-note').getByText('Your song needs assistance',{exact:true}).waitFor();
  assert.ok(!(await page.locator('.result-copy').innerText()).includes("We're turning your story into music"));
  order={...initial,status:'completed',paid_at:initial.created_at,song_assets:[{id:'fake-asset',mime_type:'audio/wav',created_at:initial.created_at}]};
  await page.reload();await page.locator('.song-audio audio').waitFor();await page.locator('audio').evaluate(audio=>audio.load());
  await page.getByRole('button',{name:'Reload audio',exact:true}).waitFor();audioFailure=false;
  await page.getByRole('button',{name:'Reload audio',exact:true}).click();await page.locator('audio').evaluate(audio=>audio.load());
  await page.waitForFunction(()=>document.querySelector('audio')?.duration===1);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download song',exact:true}).click();
  assert.ok((await downloaded).suggestedFilename().endsWith('.wav'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width===1440||width===390)await page.screenshot({path:`${artifacts}/song-${width}.png`,fullPage:true});
  signedIn=false;await page.goto(base+'/login');await page.getByLabel('Email address').fill('preview@isolated.example');await page.getByRole('checkbox').check();
  delayedOtp=route=>{held=route;};await page.getByRole('button',{name:'Send sign-in code',exact:true}).click();
  assert.equal(await page.getByLabel('Email address').getAttribute('readonly'),'');
  await held.fulfill({json:{message:'Mock code sent'}});delayedOtp=null;
  await page.getByRole('button',{name:'Use another email',exact:true}).waitFor();
  await page.reload(); await page.getByLabel("Email address").fill("preview@isolated.example"); await page.getByRole("button",{name:"I already have a code",exact:true}).click();
  delayedOtp=route=>{held=route;};await page.getByRole('button',{name:'Resend code',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Use another email',exact:true}).isDisabled(),true);
  await held.fulfill({json:{message:'Mock code resent'}});delayedOtp=null;
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: layout, unsaved edit focus, transient session retry, leave guard, lyric save, filter race, paid recovery, needs-review, WAV playback/reload/download, OTP pending lock.`);
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const login=await context.request.post(base+'/api/auth/verify',{headers:{Origin:base},data:{email:'owner@admin-test.example',code:'123456'}});
 assert.equal(login.status(),200);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(base+'/admin/orders?searchBy=id&q=c3f10454-1234-4234-8234-000000000001');await page.getByRole('heading',{name:'订单列表',exact:true}).waitFor();
  await page.getByText('已登记收款',{exact:true}).first().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${artifacts}/admin-orders-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'待核查',exact:true}).click();await page.waitForURL('**/admin/orders?**');
  assert.equal(new URL(page.url()).searchParams.get('delivery'),'review');
  await page.goto(base+'/admin/jobs');await page.getByRole('link',{name:'当前生成任务',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'当前生成任务',exact:true}).getAttribute('aria-current'),'page');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${artifacts}/admin-jobs-${width}.png`,fullPage:true});
 }
 await context.close();console.log('PASS admin: real isolated authentication, trusted money, quick filters, current tasks default, desktop/mobile layout.');
} finally { await browser.close(); }
