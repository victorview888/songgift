// Use real workerd Request/WebCrypto: Node's Request accepts redirect:"error",
// but Workers rejects it before any network call. All JWKS traffic is simulated.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'workerd-test', alg: 'RS256', use: 'sig' };
const now = Math.floor(Date.now() / 1000), sha = 'a'.repeat(40);
const claims = { iss: 'https://token.actions.githubusercontent.com', aud: 'https://www.songforalways.com/api/internal/radar/reports', sub: 'repo:victorview888/songgift:ref:refs/heads/master', repository: 'victorview888/songgift', repository_id: '1432492683', repository_owner_id: '261133674', ref: 'refs/heads/master', ref_type: 'branch', workflow_ref: 'victorview888/songgift/.github/workflows/radar-free.yml@refs/heads/master', workflow_sha: sha, sha, event_name: 'workflow_dispatch', runner_environment: 'github-hosted', run_id: '123456', run_attempt: '1', iat: now, nbf: now - 1, exp: now + 300 };
const prefix = [{ alg: 'RS256', typ: 'JWT', kid: jwk.kid }, claims].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
const signature = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(prefix))).toString('base64url');
const jwt = prefix + '.' + signature;
let source = await readFile('src/lib/radar/github-identity.ts', 'utf8');
source = source.replace('import "server-only";', '').replace('import { HttpError } from "@/lib/http-error";', 'class HttpError extends Error { constructor(public status:number,message:string){super(message);} }').replace(/^export /gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const modes = ['ok', 'redirect', 'outage'];
const mf = new Miniflare(convertV4MiniflareOptions({ workers: modes.map(mode => ({
  name: mode, modules: true, compatibilityDate: '2026-11-02', compatibilityFlags: ['nodejs_compat'],
  script: compiled + `
    globalThis.fetch = async (url, init) => {
      const request = new Request(url, init); // Real workerd parameter validation.
      if(request.url !== 'https://token.actions.githubusercontent.com/.well-known/jwks' || request.redirect !== 'manual') throw new Error('Unexpected outbound request');
      if(${JSON.stringify(mode)} === 'outage') throw new TypeError('Isolated transport outage');
      if(${JSON.stringify(mode)} === 'redirect') return new Response(null,{status:302,headers:{Location:'https://untrusted.invalid'}});
      return Response.json({keys:[${JSON.stringify(jwk)}]});
    };
    export default { async fetch(request) {
      try {return Response.json(await verifyRadarIdentity(request));}
      catch(error) {return Response.json({code:error.code||'',error:error.message},{status:error.status||500});}
    }};
  `,
})) }));
try {
  const ok = await mf.getWorker('ok');
  const valid = await ok.fetch('http://localhost', { headers: { Authorization: 'Bearer ' + jwt } });
  assert.equal(valid.status, 200); assert.equal((await valid.json()).runId, '123456');
  const forged = await ok.fetch('http://localhost', { headers: { Authorization: 'Bearer ' + prefix + '.' + Buffer.alloc(256).toString('base64url') } });
  assert.equal(forged.status, 401); await forged.text();
  for (const mode of ['redirect', 'outage']) {
    const worker = await mf.getWorker(mode);
    const result = await worker.fetch('http://localhost', { headers: { Authorization: 'Bearer ' + jwt } });
    assert.equal(result.status, 503); assert.match((await result.json()).code, /^RADAR_KEYS_/);
  }
  console.log('PASS workerd: valid RSA identity, forged signature denied, JWKS redirect denied without following, transport outage fails closed. No external traffic or database writes.');
} finally { await mf.dispose(); }
