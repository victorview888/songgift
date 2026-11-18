// Isolated UX acceptance. All APIs and external requests are intercepted.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const { chromium } = createRequire(import.meta.url)("playwright-core");
const base = new URL(process.env.SONGGIFT_CREATE_URL || "http://127.0.0.1:3039");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Use an isolated loopback server");
const artifacts = process.env.SONGGIFT_CREATE_ARTIFACTS || "/tmp/songforalways-create";
await mkdir(artifacts, { recursive: true });
const user = { id: "00000000-0000-4000-8000-000000000118", email: "create@isolated.example" };
const orderId = "00000000-0000-4000-8000-000000000119";
const story = "Alex packed tea for every walk. We got lost near the lake last autumn and laughed all the way home.";
const key = "songgift-story-draft-v1";
let checks = 0;
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

async function fixture(width, blockStorage = false) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(30000);
  if (blockStorage) await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Isolated unavailable storage", "SecurityError"); }; });
  const state = { user: null, submissions: [], unexpected: [], errors: [], fail: false, hold: null };
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base.origin) return route.abort();
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: state.user } });
    if (url.pathname === "/api/lyrics" && request.method() === "POST") {
      state.submissions.push(request.postDataJSON());
      if (state.hold) await state.hold;
      if (state.fail) return route.fulfill({ status: 503, json: { error: "Please try again shortly." } });
      return route.fulfill({ json: { orderId } });
    }
    if (url.pathname === `/api/orders/${orderId}`) return route.fulfill({ json: { order: {
      id: orderId, status: "lyrics_ready", title: "Walks by the Lake", recipient_name: "Alex", occasion: "Birthday", lyrics_text: "Fictional isolated lyrics.", song_assets: [], paid_at: null,
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
  await page.goto(new URL("/create", base).href, { waitUntil: "networkidle" });
  await page.getByLabel("Their name", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector("fieldset")?.disabled);
  const decline = page.getByRole("button", { name: "No thanks", exact: true });
  if (await decline.isVisible()) await decline.click();
  return { context, page, state };
}

try {
  for (const width of [1440, 1024, 768, 390, 320]) {
    const { context, page, state } = await fixture(width);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator('.create-journey [aria-current="step"]').textContent(), "1 Your story");
    assert.equal(await page.locator(".create-companion").isVisible(), width > 1000);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${artifacts}/create-empty-${width}.png`, fullPage: true });
    checks++;

    const name = page.getByLabel("Their name", { exact: true });
    await name.focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.getByLabel("Your relationship", { exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.getByLabel("What is the occasion?", { exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.getByLabel("Tell us the story", { exact: true }).evaluate(node => node === document.activeElement), true);
    await name.fill("Alex");
    await page.getByLabel("Your relationship", { exact: true }).selectOption("Friend");
    await page.getByLabel("What is the occasion?", { exact: true }).selectOption("Birthday");
    await page.getByLabel("Tell us the story", { exact: true }).fill(story);
    const saved = await page.evaluate(key => sessionStorage.getItem(key), key);
    await page.getByText("Need a starting point? See an example", { exact: true }).click();
    await page.getByText("Fictional example · Use your own memories", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Tell us the story", { exact: true }).inputValue(), story);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), saved, "Example must not change the draft or request ID");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await name.inputValue(), "Alex");
    assert.equal(await page.getByLabel("Tell us the story", { exact: true }).inputValue(), story);
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    checks++;

    await name.fill("A".repeat(100));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Long recipient name must wrap");
    await name.fill("Alex");
    // Required explicit consent blocks submission; it must never be restored or prechecked.
    await page.getByRole("button", { name: "Sign in to continue", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/create");
    assert.equal(state.submissions.length, 0);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Sign in to continue", exact: true }).click();
    await page.waitForURL("**/login?next=/create");
    assert.equal(state.submissions.length, 0, "Guests sign in before any generation request");
    state.user = user;
    await page.goto(new URL("/create", base).href, { waitUntil: "networkidle" });
    await page.waitForFunction(expected => document.querySelector("textarea")?.value === expected, story);
    assert.equal(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).ownerId, key), user.id);
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    checks++;

    await page.getByLabel("Tell us the story", { exact: true }).fill("                     short");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continue to lyrics", exact: true }).click();
    assert.equal(state.submissions.length, 0, "Whitespace padding must not bypass the server's trimmed minimum");
    assert.match(await page.locator("textarea").evaluate(node => node.validationMessage), /20 characters/);
    await name.fill("    ");
    await page.getByLabel("Tell us the story", { exact: true }).fill(story);
    await page.getByRole("button", { name: "Continue to lyrics", exact: true }).click();
    assert.equal(state.submissions.length, 0, "Blank names must be caught before an API request");
    await name.fill("Alex");
    state.fail = true;
    await page.getByRole("button", { name: "Continue to lyrics", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Please try again shortly." }).waitFor();
    assert.equal(await page.getByLabel("Tell us the story", { exact: true }).inputValue(), story);
    assert.equal(state.submissions.length, 1);
    assert.equal(state.submissions[0].draftOwnerId, user.id);
    await page.screenshot({ path: `${artifacts}/create-filled-${width}.png`, fullPage: true });
    checks++;

    state.fail = false;
    let release;
    state.hold = new Promise(resolve => { release = resolve; });
    await page.locator("form.story-form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await page.getByRole("button", { name: "Writing lyrics...", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Writing lyrics...", exact: true }).isDisabled(), true);
    await page.waitForTimeout(100);
    assert.equal(state.submissions.length, 2, "Repeated submits must issue one in-flight request");
    assert.equal(state.submissions[0].clientRequestId, state.submissions[1].clientRequestId, "Retry the same draft without duplicating its order");
    assert.equal(state.submissions[1].story, story);
    release();
    await page.waitForURL(`**/lyrics/${orderId}`);
    await page.goto(new URL("/create?occasion=christmas", base).href, { waitUntil: "networkidle" });
    await page.getByRole("region", { name: "Saved song", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Continue saved song" }).getAttribute("href"), `/lyrics/${orderId}`);
    await page.getByRole("button", { name: "Start a new story", exact: true }).click();
    assert.equal(await page.getByLabel("Tell us the story", { exact: true }).inputValue(), "");
    assert.equal(await page.getByLabel("What is the occasion?", { exact: true }).inputValue(), "Christmas");
    assert.equal(state.submissions.length, 2);
    assert.deepEqual(state.unexpected, []);
    assert.deepEqual(state.errors, []);
    checks++;
    await context.close();
    console.log(`PASS ${width}px: layout, examples, draft recovery, consent, sign-in, validation, failed retry, single submission and saved-order recovery`);
  }
  const { context, page, state } = await fixture(390, true);
  await page.getByLabel("Their name", { exact: true }).fill("Alex");
  await page.getByRole("status").filter({ hasText: "Local saving is unavailable" }).waitFor();
  assert.equal(await page.getByLabel("Their name", { exact: true }).inputValue(), "Alex");
  assert.deepEqual(state.submissions, []);
  assert.deepEqual(state.errors, []);
  await context.close();
  checks++;
  console.log(`Create-page browser acceptance: ${checks} checks passed. No live lyrics, music, payment or email calls.`);
} finally { await browser.close(); }
