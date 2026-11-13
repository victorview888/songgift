// Isolated HTTP/browser acceptance checks. Start test-customer-runtime.mjs serve first.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const base = process.env.SONGGIFT_GROWTH_TEST_URL || "http://localhost:3002";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Only loopback targets allowed",
);
const fixture = "http://127.0.0.1:54330",
  artifacts = "/tmp/songgift-resumed-preview";
assert.equal(
  (await (await fetch(fixture + "/__fixture__/health")).json()).fixture,
  "songgift-customer-loopback",
);
const seed = await (
  await fetch(fixture + "/__fixture__/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"growth":true}',
  })
).json();
assert.ok(seed.paid);
await mkdir(artifacts, { recursive: true });
let checks = 0;
const pass = (label) => {
  checks++;
  console.log("PASS " + label);
};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
let debugPage;
try {
  const owner = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    visitor = await browser.newContext({
      viewport: { width: 390, height: 900 },
    }),
    customer = await browser.newContext();
  for (const context of [owner, visitor, customer])
    context.setDefaultTimeout(15000);
  const signIn = async (context, email) => {
    const response = await context.request.post(base + "/api/auth/verify", {
      headers: { Origin: base },
      data: { email, code: "123456", next: "/admin/users" },
    });
    assert.equal(response.status(), 200, await response.text());
  };
  const kinds = ["users", "system", "audit", "analytics"];
  for (const kind of kinds)
    assert.equal(
      (await visitor.request.get(base + "/api/admin/" + kind)).status(),
      401,
    );
  await signIn(customer, "other@isolated.example");
  for (const kind of kinds)
    assert.equal(
      (await customer.request.get(base + "/api/admin/" + kind)).status(),
      403,
    );
  await signIn(owner, "owner@isolated.example");
  const page = await owner.newPage(),
    errors = [];
  debugPage = page;
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [kind, title] of [
    ["users", "用户管理"],
    ["system", "系统状态"],
    ["audit", "操作审计"],
    ["analytics", "来源与转化"],
  ]) {
    const response = await page.goto(base + "/admin/" + kind, {
      waitUntil: "networkidle",
    });
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    assert.match(response.headers()["cache-control"], /private|no-store/);
    assert.equal(await page.locator(".admin-error").count(), 0);
    assert.ok(
      (
        await page.locator("meta[name=robots]").first().getAttribute("content")
      ).includes("noindex"),
    );
    await page.screenshot({
      path: artifacts + "/desktop-" + kind + ".png",
      fullPage: true,
    });
  }
  const userApi = await owner.request.get(
    base + "/api/admin/users?q=owner%40isolated.example",
  );
  assert.equal(userApi.status(), 200);
  assert.equal((await userApi.json()).rows.length, 1);
  assert.equal(
    (await owner.request.get(base + "/api/admin/users?page=0")).status(),
    400,
  );
  const songData = await owner.request.get(base + "/api/orders/" + seed.paid);
  assert.equal(songData.status(), 200, await songData.text());
  assert.equal((await songData.json()).order.song_assets.length, 1);
  await page.goto(base + "/song/" + seed.paid, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Create gift link", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Create gift link", exact: true })
      .isEnabled(),
    false,
  );
  await page
    .getByRole("textbox", { name: "A short greeting (optional)" })
    .fill("For all our ordinary days.");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create gift link", exact: true })
    .click();
  await page
    .getByText("Gift link created. Previous links have been replaced.", {
      exact: true,
    })
    .waitFor();
  const link = await page
    .getByRole("textbox", { name: "Your active gift link" })
    .inputValue();
  assert.ok(link.startsWith(base + "/gift/"));
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page
      .getByRole("textbox", { name: "A short greeting (optional)" })
      .inputValue(),
    "For all our ordinary days.",
  );
  await page.screenshot({
    path: artifacts + "/desktop-gift-settings.png",
    fullPage: true,
  });
  const guestPage = await visitor.newPage(),
    giftResponse = await guestPage.goto(link, { waitUntil: "networkidle" });
  await guestPage
    .getByRole("heading", { name: "A Song for Emma", exact: true })
    .waitFor();
  assert.equal(await guestPage.locator("audio").count(), 1);
  assert.equal(await guestPage.locator(".usage-consent").count(), 0);
  assert.equal(giftResponse.headers()["referrer-policy"], "no-referrer");
  assert.match(giftResponse.headers()["x-robots-tag"], /noindex/);
  assert.match(
    giftResponse.headers()["content-security-policy"],
    /connect-src 'self'/,
  );
  const html = await giftResponse.text();
  assert.doesNotMatch(
    html,
    /Private story|confirmed song for Emma|owner@isolated|paypal_order_id|storage_path/,
  );
  assert.ok(!html.includes(seed.paid));
  let response = await visitor.request.get(
    base + "/api/gifts/" + link.split("/").at(-1) + "/audio",
    { headers: { Range: "bytes=0-15" } },
  );
  assert.equal(response.status(), 206);
  assert.equal((await response.body()).length, 16);
  assert.equal(response.headers().location, undefined);
  await guestPage
    .locator("audio")
    .evaluate((node) => node.dispatchEvent(new Event("error")));
  await guestPage
    .getByRole("button", { name: "Try audio again", exact: true })
    .click();
  await guestPage
    .getByRole("button", { name: "Try audio again", exact: true })
    .waitFor({ state: "detached" });
  await guestPage.screenshot({
    path: artifacts + "/mobile-gift.png",
    fullPage: true,
  });
  const giftApi = base + "/api/orders/" + seed.paid + "/gift";
  assert.equal(
    (
      await owner.request.post(giftApi, {
        headers: { Origin: "https://other.invalid" },
        data: { active: false, greeting: "" },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await customer.request.post(giftApi, {
        headers: { Origin: base },
        data: { active: true, confirmed: true, greeting: "" },
      })
    ).status(),
    404,
  );
  await page
    .getByRole("button", { name: "Turn off sharing", exact: true })
    .click();
  await page
    .getByText("Sharing has been turned off.", { exact: true })
    .waitFor();
  assert.equal(
    (
      await visitor.request.get(
        base + "/api/gifts/" + link.split("/").at(-1) + "/audio",
      )
    ).status(),
    404,
  );
  await guestPage.reload({ waitUntil: "networkidle" });
  await guestPage
    .getByRole("heading", {
      name: "This gift link is unavailable.",
      exact: true,
    })
    .waitFor();
  pass(
    "gift ownership, permission, retained greeting, private playback, revocation and CSP",
  );
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/admin/users", { waitUntil: "networkidle" });
    await page
      .getByRole("heading", { name: "用户管理", exact: true })
      .waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: artifacts + "/" + width + "-users.png",
      fullPage: true,
    });
    await guestPage.setViewportSize({ width, height: 900 });
    await guestPage.goto(base + "/guides", { waitUntil: "networkidle" });
    await guestPage
      .getByRole("heading", { name: "Make your story sing.", exact: true })
      .waitFor();
    assert.equal(await guestPage.locator(".guide-grid article").count(), 3);
    assert.ok(
      await guestPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await guestPage.screenshot({
      path: artifacts + "/" + width + "-guides.png",
      fullPage: true,
    });
  }
  const seen = [];
  guestPage.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/analytics"))
      seen.push({ method: request.method(), body: request.postData() });
  });
  assert.equal(seen.length, 0);
  await guestPage
    .getByRole("button", { name: "No thanks", exact: true })
    .click();
  assert.equal(
    await guestPage.evaluate(() => localStorage.getItem("sg_usage_choice")),
    "deny",
  );
  assert.equal(
    (await visitor.cookies()).filter((c) => c.name === "sg_usage").length,
    0,
  );
  await guestPage
    .getByRole("button", { name: "Analytics preferences", exact: true })
    .click();
  await Promise.all([
    guestPage.waitForResponse(
      (r) =>
        r.url().endsWith("/api/analytics/events") &&
        r.request().method() === "POST",
    ),
    guestPage
      .getByRole("button", { name: "Allow analytics", exact: true })
      .click(),
  ]);
  assert.ok(seen.some((r) => r.method === "POST"));
  assert.doesNotMatch(
    seen.find((r) => r.method === "POST").body,
    /https:|email|story|lyrics|recipient/,
  );
  const postsBefore = seen.filter((r) => r.method === "POST").length;
  await guestPage.goto(link, { waitUntil: "networkidle" });
  assert.equal(seen.filter((r) => r.method === "POST").length, postsBefore);
  await guestPage.goto(base + "/guides/turn-memories-into-a-song", {
    waitUntil: "networkidle",
  });
  assert.equal(await guestPage.locator("h1").count(), 1);
  assert.equal(
    await guestPage.locator("link[rel=canonical]").getAttribute("href"),
    "https://www.songforalways.com/guides/turn-memories-into-a-song",
  );
  assert.ok(
    (
      await guestPage
        .locator('script[type="application/ld+json"]')
        .allTextContents()
    ).some((text) => text.includes("Article")),
  );
  assert.ok(
    await guestPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await guestPage.screenshot({
    path: artifacts + "/mobile-guide-article.png",
    fullPage: true,
  });
  await guestPage
    .getByRole("button", { name: "Analytics preferences", exact: true })
    .click();
  await guestPage
    .getByRole("button", { name: "No thanks", exact: true })
    .click();
  await guestPage.locator(".usage-consent").waitFor({ state: "detached" });
  assert.equal(
    (await visitor.cookies()).filter((c) => c.name === "sg_usage").length,
    0,
  );
  const usage = await (await fetch(fixture + "/__fixture__/usage")).json();
  assert.equal(usage.events.length, 0);
  assert.equal(usage.attributions, 0);
  pass(
    "consent, refusal, private-page exclusion, withdrawal and server deletion",
  );
  const sitemap = await (await fetch(base + "/sitemap.xml")).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, 20);
  assert.doesNotMatch(sitemap, /\/gift\/|\/song\/|\/admin/);
  await guestPage.goto(base + "/guides/toString", { waitUntil: "networkidle" });
  assert.ok(
    (
      await guestPage
        .locator("meta[name=robots]")
        .first()
        .getAttribute("content")
    ).includes("noindex"),
  );
  pass(
    "guide pages, SEO, sitemap and unknown slug handling at 1440/390/320 px",
  );
  await fetch(fixture + "/__fixture__/membership", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"active":false}',
  });
  for (const kind of kinds)
    assert.equal(
      (await owner.request.get(base + "/api/admin/" + kind)).status(),
      403,
    );
  await page.goto(base + "/admin/users", { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "无法访问这个后台页面", exact: true })
    .waitFor();
  pass("all four admin APIs and SSR pages honour current Owner access");
  assert.deepEqual(errors, []);
  console.log(
    `${checks} acceptance groups passed; screenshots: ${artifacts}. All identities, storage and payments are simulated.`,
  );
} catch (error) {
  if (debugPage) {
    await debugPage.screenshot({
      path: artifacts + "/failure.png",
      fullPage: true,
    });
    console.error(
      "Isolated failure page:",
      await debugPage.locator("body").innerText(),
    );
  }
  throw error;
} finally {
  await browser.close();
}
