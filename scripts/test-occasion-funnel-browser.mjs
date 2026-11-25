// Actual local application + disposable Postgres/Auth/Storage. No external requests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const base = new URL(process.env.SONGGIFT_FUNNEL_URL || "http://127.0.0.1:3041");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
const fixture = "http://127.0.0.1:54330";
assert.equal((await (await fetch(fixture + "/__fixture__/health")).json()).fixture, "songgift-customer-loopback");
const seed = await (await fetch(fixture + "/__fixture__/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"funnel":true}' })).json();
const artifacts = "/workspace/songforalways-funnel-2026-11-25";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const stored = async () => (await (await fetch(fixture + "/__fixture__/usage")).json()).events;
async function until(predicate) {
  for (let i = 0; i < 40; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.fail("Expected fixture event was not persisted");
}
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    const errors = [], blocked = [];
    let failSample = true;
    await context.route("**/*", route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== base.origin) { blocked.push(url.origin); return route.abort(); }
      if (url.pathname === "/api/samples/birthday-demo/audio" && failSample) return route.fulfill({ status: 503, body: "Isolated audio failure" });
      if (!["GET", "HEAD"].includes(req.method()) && !["/api/analytics/events", "/api/analytics/order", "/api/paypal/quote"].includes(url.pathname)) {
        blocked.push(req.method() + " " + url.pathname); return route.abort();
      }
      return route.continue();
    });
    const auth = await context.request.post(base.origin + "/api/auth/verify", { headers: { Origin: base.origin }, data: { email: "owner@isolated.example", code: "123456", next: "/" } });
    assert.equal(auth.status(), 200, await auth.text());
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    await page.goto(base.origin, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#samples audio").count(), 3);
    assert.deepEqual(await stored(), []);
    await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
    await until(async () => (await stored()).some(e => e.event === "page_view"));
    const play = async selector => page.locator(selector).evaluate(async node => { node.currentTime = 0; await node.play(); });
    await page.locator("#samples audio").first().evaluate(async node => { try { await node.play(); } catch { /* Expected isolated load failure. */ } });
    await page.getByRole("button", { name: "Retry sample", exact: true }).waitFor();
    assert.equal((await stored()).filter(e => e.event === "sample_played").length, 0);
    failSample = false;
    await page.getByRole("button", { name: "Retry sample", exact: true }).click();
    await play("#samples audio >> nth=0");
    await until(async () => (await stored()).filter(e => e.event === "sample_played").length === 1);
    await play("#samples audio >> nth=0");
    await play("#samples audio >> nth=1");
    await until(async () => (await stored()).filter(e => e.event === "sample_played").length === 2);
    assert.deepEqual((await stored()).filter(e => e.event === "sample_played").map(e => e.occasion).sort(), ["anniversary", "birthday"]);
    await page.goto(base.origin + "/create?occasion=christmas", { waitUntil: "networkidle" });
    const recipient = page.locator("#recipient-name");
    await recipient.fill("Isolated Alex");
    await recipient.fill("Isolated Alex edited");
    await until(async () => (await stored()).filter(e => e.event === "story_started").length === 1);
    assert.equal((await stored()).find(e => e.event === "story_started").occasion, "christmas");
    await page.goto(base.origin + "/lyrics/" + seed.draft, { waitUntil: "networkidle" });
    await page.locator(".song-preview-panel audio").waitFor();
    assert.equal((await stored()).filter(e => e.event === "preview_played").length, 0);
    await play(".song-preview-panel audio");
    await until(async () => (await stored()).filter(e => e.event === "preview_played").length === 1);
    await play(".song-preview-panel audio");
    await page.goto(base.origin + "/admin/analytics", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "来源与转化", exact: true }).waitFor();
    assert.ok(await page.getByText("生日 / 个人预览播放", { exact: true }).count());
    assert.ok(await page.getByText("圣诞节 / 开始填写（首次编辑）", { exact: true }).count());
    assert.equal((await stored()).filter(e => e.event === "preview_played").length, 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${artifacts}/analytics-${base.port}-${width}.png`, fullPage: true });
    await page.goto(base.origin + "/admin/system", { waitUntil: "networkidle" });
    assert.ok(await page.getByText("0 条待处理 / 0 条发送中", { exact: true }).count());
    assert.ok(await page.getByText("尚无完成结果", { exact: true }).count());
    await page.screenshot({ path: `${artifacts}/system-${base.port}-${width}.png`, fullPage: true });
    await page.goto(base.origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Analytics preferences", exact: true }).click();
    await page.getByRole("button", { name: "No thanks", exact: true }).click();
    await until(async () => (await stored()).length === 0);
    await play("#samples audio >> nth=0");
    assert.deepEqual(await stored(), []);
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    await context.close();
    console.log(`PASS ${base.port} ${width}px: failed audio excluded, real playback, replay dedupe, one first edit, stored order occasion, private admin diagnostics, opt-out deletion`);
  }
} finally { await browser.close(); }
