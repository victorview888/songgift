// Run after build:vinext. Dispatch directly to workerd so Wrangler's local
// Location-header rewriting cannot hide the actual protocol or redirect target.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const config = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
const root = resolve('dist/server');
const entry = resolve(root, config.main);
const modules = (await readdir(root, { recursive: true })).filter(path => /\.m?js$/.test(path))
  .map(path => resolve(root, path)).filter(path => path !== entry);
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  name: 'songgift', modulesRoot: root,
  modules: [entry, ...modules].map(path => ({ type: 'ESModule', path })),
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
  bindings: { ...config.vars, SUPABASE_URL: 'http://127.0.0.1:54329', SUPABASE_PUBLISHABLE_KEY: 'isolated-test', SUPABASE_SERVICE_ROLE_KEY: 'isolated-test' },
  assets: { directory: resolve('dist/client'), binding: 'ASSETS', run_worker_first: true,
    assetConfig: { html_handling: 'none', not_found_handling: 'none' } },
}] }));
try {
  const worker = await mf.getWorker();
  let redirects = 0;
  for (const origin of ['http://www.songforalways.com', 'http://songforalways.com', 'https://songforalways.com']) {
    for (const path of ['/', '/pricing?utm_source=isolated-test', '/auth/callback?code=isolated&next=%2Fmy-songs']) {
      const response = await worker.fetch(origin + path, { redirect: 'manual' });
      assert.equal(response.status, 308, origin + path);
      assert.equal(response.headers.get('Location'), 'https://www.songforalways.com' + path);
      assert.match(response.headers.get('Cache-Control'), /private.*no-store/);
      await response.arrayBuffer(); redirects++;
    }
  }
  const post = await worker.fetch('http://www.songforalways.com/api/auth/request', {
    method: 'POST', body: 'isolated request, must redirect before route handling', redirect: 'manual',
  });
  assert.equal(post.status, 308);
  assert.equal(post.headers.get('Location'), 'https://www.songforalways.com/api/auth/request');
  // The framework first normalizes duplicate slashes; follow only in this local worker.
  let unusual = 'http://www.songforalways.com//evil.example/elsewhere';
  for (let hop = 0; hop < 3; hop++) {
    const response = await worker.fetch(unusual, { redirect: 'manual' });
    if (!response.headers.has('Location')) { await response.arrayBuffer(); break; }
    unusual = new URL(response.headers.get('Location'), unusual).toString();
    assert.equal(new URL(unusual).hostname, 'www.songforalways.com');
  }
  assert.equal(new URL(unusual).protocol, 'https:');
  for (const origin of ['https://www.songforalways.com', 'http://localhost:3039', 'https://songgift-preview.example.workers.dev']) {
    const response = await worker.fetch(origin + '/pricing', {
      redirect: 'manual', headers: { 'x-forwarded-host': 'songforalways.com', 'x-forwarded-proto': 'http' },
    });
    assert.equal(response.status, 200, origin);
    assert.equal(response.headers.get('Location'), null);
    await response.arrayBuffer();
  }
  console.log(`PASS workerd: ${redirects} exact production redirect targets, duplicate slashes stay on host, HTTP POST redirects before handling, canonical HTTPS and preview/local hosts return 200.`);
} finally { await mf.dispose(); }
