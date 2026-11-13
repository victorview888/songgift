// Run against an isolated local Next or Workers server. No account or database fixture is needed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const base = new URL(process.env.SONGGIFT_SEO_URL || 'http://127.0.0.1:3036');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'An isolated loopback target is required');
assert.ok(['http:', 'https:'].includes(base.protocol));
assert.equal(base.username + base.password + base.search + base.hash, '');
assert.equal(base.pathname, '/');
const canonicalOrigin = 'https://www.songforalways.com';
const expectedPrice = process.env.SONGGIFT_SEO_EXPECTED_PRICE || '9.99';
assert.match(expectedPrice, /^\d+\.\d{2}$/);
const publicPaths = ['/', '/guides', '/guides/turn-memories-into-a-song', '/guides/review-lyrics-before-music', '/guides/give-a-personal-song-gift', '/create', '/pricing', '/occasions', '/help',
  ...['terms', 'privacy', 'content-standards', 'refunds', 'audio-storage'].map(slug => '/policies/' + slug),
  ...['birthday', 'wedding', 'anniversary', 'family', 'pet', 'memorial'].map(slug => '/occasions/' + slug)];
const privatePaths = ['/gift/'+'A'.repeat(43), '/admin/users', '/admin/system', '/admin/audit', '/admin/analytics', '/login', '/my-songs', '/account', '/account/payments', '/admin', '/admin/orders',
  '/lyrics/00000000-0000-4000-8000-000000000036', '/song/00000000-0000-4000-8000-000000000036', '/contact', '/report'];
let checks = 0;
function passed(message) { checks++; console.log('PASS ' + message); }

async function get(path) {
  const target = new URL(path, base);
  assert.equal(target.origin, base.origin, 'Do not follow a URL outside the local server');
  // No cookies, credentials, writes, or redirect following; a server redirect cannot escape loopback.
  return fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { 'User-Agent': 'Twitterbot/1.0 (SongGift isolated SEO validation)', Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' } });
}

const browser = await chromium.launch({ executablePath: process.env.SONGGIFT_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route('**/api/**', route => route.fulfill({ status: 200, json: { user: null } }));
  await context.route('**/*', route => route.request().url().includes('/api/')
    ? route.fulfill({ status: 200, json: { user: null } }) : route.abort());
  const page = await context.newPage();
  // Parse fetched SSR HTML in an inert DOM, without executing scripts or loading any document resources.
  async function parse(html) {
    return page.evaluate(source => {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const all = selector => [...doc.querySelectorAll(selector)];
      const meta = key => all(`meta[name="${key}"],meta[property="${key}"]`).map(node => node.getAttribute('content'));
      const scripts = all('script[type="application/ld+json"]').map(node => node.textContent);
      all('script,style,template').forEach(node => node.remove());
      return {
        titles: all('title').map(node => node.textContent), description: meta('description'),
        canonical: all('link[rel="canonical"]').map(node => node.getAttribute('href')),
        robots: meta('robots'), ogUrl: meta('og:url'), ogTitle: meta('og:title'), ogDescription: meta('og:description'),
        ogImages: meta('og:image'), ogWidth: meta('og:image:width'), ogHeight: meta('og:image:height'), ogAlt: meta('og:image:alt'),
        twitterCard: meta('twitter:card'), twitterImages: meta('twitter:image'), twitterTitle: meta('twitter:title'),
        twitterDescription: meta('twitter:description'), h1s: all('h1').map(node => node.textContent),
        lang: doc.documentElement.lang, scripts, text: doc.body.textContent,
        links: all('a[href]').map(node => node.getAttribute('href')),
        icons: all('link[rel="icon"],link[rel="apple-touch-icon"]').map(node => node.getAttribute('href')),
      };
    }, html);
  }
  const titles = new Set(), descriptions = new Set(), imagePaths = new Set(), iconPaths = new Set(), pages = new Map();
  function one(values, label) { assert.equal(values.length, 1, label + ': exactly one'); assert.ok(values[0]?.trim(), label + ': nonempty'); return values[0]; }
  function checkCanonical(actual, path) { assert.equal(new URL(actual).href, new URL(path, canonicalOrigin).href, path + ': canonical'); }
  function nodes(value) {
    if (!value || typeof value !== 'object') return [];
    return [value, ...Object.values(value).flatMap(nodes)];
  }
  for (const path of publicPaths) {
    const response = await get(path);
    assert.equal(response.status, 200, path + ': HTTP status');
    assert.match(response.headers.get('content-type') || '', /text\/html/i);
    const data = await parse(await response.text()); pages.set(path, data);
    const title = one(data.titles, path + ' title'), description = one(data.description, path + ' description');
    assert.ok(!titles.has(title), path + ': unique title'); titles.add(title);
    assert.ok(!descriptions.has(description), path + ': unique description'); descriptions.add(description);
    checkCanonical(one(data.canonical, path), path); checkCanonical(one(data.ogUrl, path + ' og:url'), path);
    assert.equal(one(data.ogTitle, path + ' og:title'), title);
    assert.equal(one(data.ogDescription, path + ' og:description'), description);
    assert.equal(one(data.twitterTitle, path + ' twitter:title'), title);
    assert.equal(one(data.twitterDescription, path + ' twitter:description'), description);
    assert.equal(one(data.twitterCard, path + ' twitter:card'), 'summary_large_image');
    assert.ok(data.ogAlt.some(Boolean), path + ': social image alt');
    assert.ok(data.ogWidth.includes('1200') && data.ogHeight.includes('630'), path + ': social image dimensions');
    for (const image of [...data.ogImages, ...data.twitterImages]) {
      const url = new URL(image); assert.equal(url.origin, canonicalOrigin); imagePaths.add(url.pathname);
    }
    assert.ok(data.ogImages.length && data.twitterImages.length, path + ': social images');
    assert.ok(!data.robots.join(',').includes('noindex'), path + ': indexable');
    assert.ok(!(response.headers.get('x-robots-tag') || '').includes('noindex'), path + ': header indexable');
    assert.equal(data.lang, 'en'); assert.equal(data.h1s.length, 1, path + ': one SSR heading');
    for (const script of data.scripts) {
      const structured = JSON.parse(script);
      assert.ok(nodes(structured).some(node => node['@context'] === 'https://schema.org'), path + ': schema context');
      assert.ok(!/victorview888|lyrics_text|recipient_name|paypal_order_id/.test(script), path + ': no private schema fields');
    }
    for (const icon of data.icons) {
      const url = new URL(icon, canonicalOrigin); assert.equal(url.origin, canonicalOrigin); iconPaths.add(url.pathname);
    }
    passed(path + ': SSR metadata, canonical, sharing, indexability, headings and JSON-LD');
  }
  const homeNodes = pages.get('/').scripts.flatMap(script => nodes(JSON.parse(script)));
  assert.ok(homeNodes.some(node => node['@type'] === 'WebSite'));
  assert.ok(homeNodes.some(node => node['@type'] === 'Organization'));
  const pricingNodes = pages.get('/pricing').scripts.flatMap(script => nodes(JSON.parse(script)));
  assert.ok(pricingNodes.some(node => node['@type'] === 'Service'));
  const offers = pricingNodes.filter(node => node['@type'] === 'Offer'); assert.equal(offers.length, 1);
  assert.equal(offers[0].priceCurrency, 'USD'); assert.equal(Number(offers[0].price).toFixed(2), expectedPrice);
  assert.ok(pages.get('/pricing').text.includes('US$' + expectedPrice), 'Offer must match the visible public price');
  assert.ok(pages.get('/').text.includes('US$' + expectedPrice), 'Homepage must match public pricing');
  passed('WebSite, Organization and Service/Offer agree with public pricing');

  for (const path of imagePaths) {
    const response = await get(path); assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', /image\/png/i);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'A real PNG is required');
    assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 630);
    passed(path + ': real 1200×630 PNG');
  }
  assert.ok(iconPaths.size, 'Brand icon references should be present');
  for (const path of iconPaths) {
    const response = await get(path); assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type') || '', /image\//i); assert.ok((await response.arrayBuffer()).byteLength);
  }
  passed('Referenced icons are served as nonempty images');

  const sitemap = await get('/sitemap.xml'); assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  const urls = await page.evaluate(source => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Malformed sitemap XML');
    return [...doc.querySelectorAll('loc')].map(node => node.textContent);
  }, xml);
  assert.equal(new Set(urls).size, urls.length, 'No duplicate sitemap URLs');
  assert.deepEqual(urls.map(url => { const parsed = new URL(url); assert.equal(parsed.origin, canonicalOrigin); assert.equal(parsed.search + parsed.hash, ''); return parsed.pathname; }).sort(), [...publicPaths].sort());
  passed('Sitemap contains every public route and no private, form-only or parameter URLs');
  const robots = await get('/robots.txt'); assert.equal(robots.status, 200); const rules = await robots.text();
  assert.match(rules, /Sitemap: https:\/\/www\.songforalways\.com\/sitemap\.xml/i);
  assert.match(rules, /Disallow: \/api\//i); assert.match(rules, /Disallow: \/auth\//i);
  assert.ok(!/Disallow:\s*\/(?:admin|account|login|lyrics|song|my-songs)(?:\s|\/|$)/i.test(rules), 'Crawlers must reach private-page noindex directives');
  passed('Robots exposes sitemap and permits reading private-page noindex');

  for (const path of privatePaths) {
    const response = await get(path); assert.ok(path.startsWith('/gift/') ? [200,404].includes(response.status) : response.status===200, path);
    const data = await parse(await response.text()); assert.match(data.robots.join(','), /noindex/, path);
    assert.equal(data.scripts.length, 0, path + ': no public structured data on private pages');
    passed(path + ': anonymous SSR noindex');
  }
  for (const path of ['/guides/unknown-guide', '/guides/__proto__', '/guides/constructor', '/guides/toString', '/seo-unknown-route', '/policies/seo-unknown-policy',
    ...['seo-unknown-occasion', '__proto__', 'constructor', 'toString'].map(slug => '/occasions/' + slug)]) {
    const response = await get(path); assert.equal(response.status, 404, path + ': correct 404, not 500 or soft 404');
    const data = await parse(await response.text()); assert.match(data.robots.join(','), /noindex/, path);
    passed(path + ': 404 and noindex');
  }
  for (const path of ['/', '/pricing', '/occasions/birthday']) {
    const response = await get(path + '?utm_source=isolated-seo-test'); assert.equal(response.status, 200);
    const data = await parse(await response.text()); checkCanonical(one(data.canonical, path), path);
  }
  passed('Campaign parameters do not enter canonical URLs');
  for (const path of publicPaths.filter(path => path.startsWith('/occasions/'))) {
    assert.ok(pages.get('/occasions').links.includes(path), path + ': discoverable in occasion directory');
    assert.ok(pages.get('/').links.includes(path), path + ': discoverable from homepage');
    assert.ok(pages.get(path).links.includes('/create'), path + ': links to creation');
    assert.ok(pages.get(path).scripts.flatMap(script => nodes(JSON.parse(script))).some(node => node['@type'] === 'BreadcrumbList'), path + ': breadcrumb schema');
  }
  passed('All six occasion pages have public discovery links, conversion links and breadcrumbs');
  console.log(`SEO runtime: ${checks} checks passed against ${base.origin}; public price US$${expectedPrice}.`);
  await context.close();
} finally { await browser.close(); }
