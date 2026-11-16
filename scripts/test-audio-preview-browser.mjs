import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)("playwright-core");
const base = new URL(process.env.SONGGIFT_PREVIEW_URL || "http://127.0.0.1:3039");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
const artifacts = process.env.SONGGIFT_PREVIEW_ARTIFACTS || "/tmp/songgift-audio-preview-ui";
await mkdir(artifacts, { recursive: true });
const id = "00000000-0000-4000-8000-000000000160", user = "00000000-0000-4000-8000-000000000161";
const original = "[Verse]\nAn original story just for you\nThe little moments we hold true\n[Chorus]\nAlex, these are our ordinary days";
const wav = Buffer.alloc(16044); wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(16000, 40);
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
let checks = 0;
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
    const page = await context.newPage(), state = { phase: null, canCreate: true, used: false, lyrics: original, posts: 0, saves: 0, checkouts: 0, audioFail: true, errors: [], unexpected: [] };
    page.on("pageerror", error => state.errors.push(error.message));
    const summary = () => ({ enabled: true, canCreate: state.canCreate, used: state.used, state: state.phase, lyricsLocked: Boolean(state.phase && state.phase !== "failed"), audioUrl: state.phase === "ready" ? `/api/orders/${id}/preview/audio` : null, seconds: state.phase === "ready" ? 60 : null, paid: false });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base.origin) return route.abort();
      if (url.pathname === "/isolated-checkout") return route.fulfill({ contentType: "text/html", body: "<h1>Isolated checkout</h1>" });
      if (url.pathname === "/api/auth/session") return route.fulfill({ json: { user: { id: user, email: "preview@isolated.example" } } });
      if (url.pathname === `/api/orders/${id}`) {
        if (request.method() === "PATCH") { state.saves++; state.lyrics = request.postDataJSON().lyricsText; return route.fulfill({ json: { ok: true } }); }
        return route.fulfill({ json: { order: { id, status: "lyrics_ready", title: "Ordinary Days", recipient_name: "Alex", occasion: "Birthday", lyrics_text: state.lyrics, song_assets: [], paid_at: null }, checkoutPrice: { value: "9.99", currencyCode: "USD" }, audioPreviewEnabled: true, audioPreviewLocked: summary().lyricsLocked, audioPreviewState: state.phase } });
      }
      if (url.pathname === `/api/orders/${id}/preview`) {
        if (request.method() === "POST") { state.posts++; state.phase = "processing"; state.canCreate = false; state.used = true; }
        return route.fulfill({ json: summary() });
      }
      if (url.pathname === `/api/orders/${id}/preview/audio`) return route.fulfill(state.audioFail ? { status: 503, body: "Isolated audio outage" } : { contentType: "audio/wav", body: wav });
      if (url.pathname === "/api/paypal/create-order") { state.checkouts++; return route.fulfill({ json: { approvalUrl: base.origin + "/isolated-checkout" } }); }
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
        state.unexpected.push(request.method() + " " + url.pathname); return route.fulfill({ status: 500, json: { error: "Unexpected API blocked" } });
      }
      return route.continue();
    });
    await page.goto(new URL(`/lyrics/${id}`, base).href, { waitUntil: "networkidle" });
    const decline = page.getByRole("button", { name: "No thanks", exact: true }); if (await decline.isVisible()) await decline.click();
    await page.getByRole("button", { name: "Create my free preview", exact: true }).waitFor();
    const editor = page.getByRole("textbox", { name: "Song lyrics", exact: true }), edited = original + "\nOur approved last line";
    await editor.fill(edited); await page.getByRole("button", { name: "Create my free preview", exact: true }).click();
    await page.getByText("Creating your original recording…", { exact: false }).waitFor();
    assert.equal(state.posts, 1); assert.equal(state.saves, 1); assert.equal(state.lyrics, edited);
    assert.equal(await editor.isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: /^Pay / }).isDisabled(), true);
    await page.getByRole("button", { name: "Check preview again", exact: true }).click(); assert.equal(state.posts, 1);
    state.phase = "ready";
    await page.getByRole("button", { name: "Check preview again", exact: true }).click();
    const audio = page.getByRole("region", { name: "Your free 60-second preview." }).locator("audio");
    await audio.evaluate(node => node.load());
    await page.getByRole("button", { name: "Reload preview", exact: true }).waitFor(); state.audioFail = false;
    await page.getByRole("button", { name: "Reload preview", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".song-preview-panel audio")?.duration === 1);
    const pay = page.getByRole("button", { name: "Pay $9.99 · Unlock full song", exact: true });
    await pay.waitFor(); assert.equal(await pay.isDisabled(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${artifacts}/ready-${width}.png`, fullPage: true });

    await page.evaluate(({ key, baseText }) => sessionStorage.setItem(key, JSON.stringify({ base: baseText, text: baseText + "\nUnsaved from another tab", at: Date.now() })), { key: `songgift-lyrics:${user}:${id}`, baseText: state.lyrics });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Pay $9.99 · Unlock full song", exact: true }).waitFor();
    assert.equal(await editor.inputValue(), edited); assert.equal(await editor.isDisabled(), true);
    assert.ok(await page.evaluate(key => sessionStorage.getItem(key), `songgift-lyrics:${user}:${id}`));
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Pay $9.99 · Unlock full song", exact: true }).click();
    await page.waitForURL("**/isolated-checkout"); assert.equal(state.checkouts, 1); assert.equal(state.saves, 1); assert.equal(state.posts, 1);

    state.phase = null; state.canCreate = false; state.used = true;
    await page.goto(new URL(`/lyrics/${id}`, base).href, { waitUntil: "networkidle" });
    await page.getByText("Your free audio allowance is unavailable or already used.", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Create my free preview", exact: true }).count(), 0);
    assert.equal(await editor.isDisabled(), false); assert.equal(await page.getByRole("button", { name: "Pay $9.99 · Create song", exact: true }).isDisabled(), false);
    assert.deepEqual(state.unexpected, []); assert.deepEqual(state.errors, []);
    checks += 5; await context.close();
    console.log(`PASS ${width}px: save-before-preview, one submission, locks, replay/reload, same-recording checkout and used-allowance purchase`);
  }
  console.log(`Audio preview browser: ${checks} checks passed, all API calls isolated.`);
} finally { await browser.close(); }
