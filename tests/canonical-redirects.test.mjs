import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('src/proxy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const out = {};
vm.runInNewContext('(function(exports,require){' + code + '\n})', { URL })(out, name => {
  if (name === '@/lib/seo') return { siteUrl: 'https://www.songforalways.com' };
  if (name === 'next/server') return { NextResponse: {
    redirect: (url, init) => new Response(null, { ...init, headers: { ...init.headers, Location: url.toString() } }),
    next: () => new Response(null, { headers: { 'x-middleware-next': '1' } }),
  } };
  throw new Error('Unexpected dependency: ' + name);
});

test('all production aliases use a permanent HTTPS redirect while preserving the path and query', () => {
  for (const method of ['GET', 'HEAD', 'POST']) {
    for (const origin of ['http://www.songforalways.com', 'http://songforalways.com', 'https://songforalways.com']) {
      for (const path of ['/', '/pricing', '/auth/callback?code=isolated&next=%2Fmy-songs', '/lyrics/test?token=isolated']) {
        const response = out.proxy(new Request(origin + path, { method }));
        assert.equal(response.status, 308);
        assert.equal(response.headers.get('Location'), 'https://www.songforalways.com' + path);
        assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      }
    }
  }
});

test('canonical HTTPS, local and preview requests pass through without trusting forwarded-host input', () => {
  for (const origin of ['https://www.songforalways.com', 'http://localhost:3038', 'http://127.0.0.1:3038', 'https://songgift.example.workers.dev', 'https://www.songforalways.com.evil.example']) {
    const response = out.proxy(new Request(origin + '/api/auth/session', { headers: { 'x-forwarded-host': 'songforalways.com', 'x-forwarded-proto': 'http' } }));
    assert.equal(response.headers.get('x-middleware-next'), '1');
    assert.equal(response.headers.get('Location'), null);
  }
});

test('protocol-relative paths and next parameters cannot change the redirect host', () => {
  for (const path of ['//evil.example/elsewhere', '/%2f%2fevil.example/?next=https%3A%2F%2Fevil.example']) {
    const request = new Request('http://www.songforalways.com' + path);
    const response = out.proxy(request);
    const target = new URL(response.headers.get('Location'));
    assert.equal(target.origin, 'https://www.songforalways.com');
    assert.equal(target.pathname, new URL(request.url).pathname);
    assert.equal(target.search, new URL(request.url).search);
  }
});
