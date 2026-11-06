import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function factory() {
 const env={MUSIC_PROVIDER:'musicapi',MUSICAPI_KEY:'test-key',MUSICAPI_MODEL:'new-default',MUREKA_API_KEY:'test-key',MUREKA_MODEL:'new-default',GOOGLE_CLOUD_PROJECT_ID:'isolated',GOOGLE_LYRIA_ACCESS_TOKEN:'test-key',GOOGLE_LYRIA_MODEL:'new-default',ALLOW_MOCK_FALLBACK:'true'};
 const calls=[],cache=new Map();class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 function load(file){const key=path.resolve(file);if(cache.has(key))return cache.get(key);const out={};cache.set(key,out);
  const compiled=ts.transpileModule(readFileSync(key,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext('(function(exports,require){'+compiled+'\n})',{process:{env},AbortSignal,fetch:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({task_id:'task',id:'task',status:'processing'}),{headers:{'Content-Type':'application/json'}});}})(out,name=>{
   if(name==='@/lib/auth/server')return {HttpError};if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');return load(path.resolve(path.dirname(key),name+'.ts'));
  });return out;
 }
 return {api:load('src/lib/providers/factory.ts'),env,calls};
}
const input={recipientName:'Emma',occasion:'Birthday',story:'Private memory',mood:'Warm',style:'Pop',lyricsText:'Approved lyric for Emma'};
test('pinned MusicAPI and Mureka models survive default changes without mock fallback',async()=>{
 const f=factory();await f.api.getPinnedMusicProvider({provider:'musicapi',model:'original-musicapi',environment:'production'}).generateSong(input);
 assert.equal(JSON.parse(f.calls[0].init.body).mv,'original-musicapi');f.env.MUSIC_PROVIDER='mock';
 await f.api.getPinnedMusicProvider({provider:'mureka_cn',model:'original-mureka',environment:'production'}).generateSong(input);assert.equal(JSON.parse(f.calls[1].init.body).model,'original-mureka');
});
test('pinned Google model is passed to the existing music adapter',async()=>{const f=factory();await f.api.getPinnedMusicProvider({provider:'google_lyria',model:'original-google',environment:'production'}).generateSong(input);assert.equal(JSON.parse(f.calls[0].init.body).model,'original-google');});
test('new generation identities are explicit and unsupported/test identities fail closed',()=>{
 const f=factory();assert.equal(f.api.getMusicIdentity().model,'new-default');f.env.MUSIC_PROVIDER='fal';assert.equal(f.api.getMusicIdentity().model,'fal-ai/lyria3/pro');
 f.env.MUSIC_PROVIDER='typo';assert.throws(()=>f.api.getMusicIdentity(),e=>e.status===503);
 for(const id of [{provider:'fal',model:'unknown',environment:'production'},{provider:'musicapi',model:'any',environment:'test'},{provider:'mock',model:'local-preview',environment:'production'}])assert.throws(()=>f.api.getPinnedMusicProvider(id),e=>e.status===409);
 assert.equal(f.calls.length,0);
});
