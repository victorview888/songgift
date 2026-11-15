// Isolated browser acceptance: every API and all external requests are intercepted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)("playwright-core");
const base = new URL(process.env.SONGGIFT_HOLIDAY_URL || "http://127.0.0.1:3038");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
const artifacts = process.env.SONGGIFT_HOLIDAY_ARTIFACTS || "/tmp/songgift-holiday-preview";
await mkdir(artifacts, { recursive: true });
const user = { id: "00000000-0000-4000-8000-000000000115", email: "holiday@isolated.example" };
const orderId = "00000000-0000-4000-8000-000000000116";
const holidays = [
  ["christmas-eve", "Christmas Eve"],
  ["christmas", "Christmas"],
  ["new-year", "New Year"],
];
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
let checks = 0;
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    const state = { user: null, submissions: [], unexpected: [], errors: [] };
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base.origin) return route.abort();
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: state.user } });
      if (url.pathname === "/api/lyrics" && request.method() === "POST") {
        state.submissions.push(request.postDataJSON());
        return route.fulfill({ json: { orderId, lyricsText: "Original isolated lyric fixture for the holiday flow." } });
      }
      if (url.pathname === `/api/orders/${orderId}`) return route.fulfill({ json: { order: {
        id: orderId, status: "lyrics_ready", title: "A New Year Together", recipient_name: "Alex", occasion: "New Year", lyrics_text: "Original isolated lyric fixture for the holiday flow.", song_assets: [], paid_at: null,
      } } });
      if (url.pathname === "/api/paypal/quote") return route.fulfill({ json: { checkoutPrice: { value: "9.99", currencyCode: "USD" } } });
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
        state.unexpected.push(request.method() + " " + url.pathname);
        return route.fulfill({ status: 404, json: { error: "Blocked isolated API" } });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", error => state.errors.push(error.message));
    await page.goto(base.href, { waitUntil: "networkidle" });
    const decline = page.getByRole("button", { name: "No thanks", exact: true });
    if (await decline.isVisible()) await decline.click();
    // Home promotions are seasonal. The evergreen links remain present year-round.
    for (const [slug] of holidays) assert.ok(await page.locator(`a[href="/occasions/${slug}"]`).count());
    await page.screenshot({ path: `${artifacts}/home-${width}.png`, fullPage: true });
    for (const [slug, occasion] of holidays) {
      const response = await page.goto(new URL(`/occasions/${slug}`, base).href, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator("h1").count(), 1);
      await page.evaluate(() => sessionStorage.clear());
      await page.locator(`.occasion-hero a[href="/create?occasion=${slug}"]`).click();
      await page.waitForFunction(value => {
        const select = document.querySelector("select[required]");
        return select && !select.closest("fieldset")?.disabled && [...document.querySelectorAll("select")].some(node => node.value === value);
      }, occasion);
      assert.equal(await page.getByLabel(/What is the occasion\?/).inputValue(), occasion);
      assert.equal(await page.getByLabel(/^Tell us the story/).inputValue(), "");
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForFunction(value => [...document.querySelectorAll("select")].some(node => node.value === value), occasion);
      assert.equal(await page.getByLabel(/What is the occasion\?/).inputValue(), occasion);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${artifacts}/create-${slug}-${width}.png`, fullPage: true });
      checks++;
    }

    const story = "We shared ordinary adventures this year and always made time for a walk by the river.";
    await page.getByLabel("Their name", { exact: true }).fill("Alex");
    await page.getByLabel(/^Your relationship/).selectOption("Friend");
    await page.getByLabel(/^Tell us the story/).fill(story);
    await page.goto(new URL("/create?occasion=christmas", base).href, { waitUntil: "networkidle" });
    await page.getByText("Your saved story is unchanged.", { exact: false }).waitFor();
    assert.equal(await page.getByLabel(/What is the occasion\?/).inputValue(), "New Year");
    assert.equal(await page.getByLabel(/^Tell us the story/).inputValue(), story);

    state.user = user;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByText(user.email, { exact: true }).waitFor();
    await page.waitForFunction(expected => document.querySelector("textarea")?.value === expected, story);
    assert.equal(await page.getByLabel(/What is the occasion\?/).inputValue(), "New Year");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continue to lyrics", exact: true }).click();
    await page.waitForURL(`**/lyrics/${orderId}`);
    assert.equal(state.submissions.length, 1);
    assert.equal(state.submissions[0].occasion, "New Year");
    assert.equal(state.submissions[0].story, story);
    assert.equal(state.submissions[0].draftOwnerId, user.id);
    checks++;

    await page.evaluate(() => sessionStorage.clear());
    await page.goto(new URL("/create?occasion=__proto__", base).href, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Continue to lyrics", exact: true }).waitFor();
    assert.equal(await page.getByLabel(/What is the occasion\?/).inputValue(), "");
    assert.deepEqual(state.unexpected, []);
    assert.deepEqual(state.errors, []);
    checks++;
    await context.close();
    console.log(`PASS ${width}px: three holiday routes, presets, draft refresh/preservation, guest-to-login submission, unknown slug and layout`);
  }
  console.log(`Holiday browser acceptance: ${checks} checks passed; no live API, payment, music or mail calls.`);
} finally { await browser.close(); }
