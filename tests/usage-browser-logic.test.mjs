import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
function browser({ dnt = false, gpc = false } = {}) {
  const storage = new Map(),
    cookies = new Map(),
    sent = [];
  let fail = false;
  const location = {
    href: "https://www.songforalways.com/?utm_source=google&utm_medium=organic&utm_campaign=approved",
    hostname: "www.songforalways.com",
    pathname: "/",
    protocol: "https:",
  };
  const document = {
    referrer: "https://www.google.com/search?q=private-query",
    get cookie() {
      return [...cookies].map(([k, v]) => k + "=" + v).join("; ");
    },
    set cookie(value) {
      const [pair] = value.split(";"),
        [k, v] = pair.split("=");
      if (value.includes("Max-Age=0")) cookies.delete(k);
      else cookies.set(k, v);
    },
  };
  const globals = {
    URL,
    Date,
    crypto,
    AbortSignal,
    Event,
    document,
    location,
    navigator: { doNotTrack: dnt ? "1" : "0", globalPrivacyControl: gpc },
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    window: { location, dispatchEvent() {} },
    fetch: async (url, init) => {
      sent.push({ url, ...init });
      return new Response("{}", { status: fail ? 503 : 200 });
    },
  };
  const cache = {};
  const load = (file) => {
    const exports = {};
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    vm.runInNewContext("(function(exports,require){" + code + "\n})", globals)(
      exports,
      () => cache.usage || (cache.usage = load("src/lib/growth/usage.ts")),
    );
    return exports;
  };
  return {
    ...load("src/lib/growth/usage-client.ts"),
    document,
    storage,
    cookies,
    sent,
    location,
    setFail: (v) => (fail = v),
  };
}
test("no optional identifiers or events before consent; refusal and privacy signals suppress collection", async () => {
  for (const flags of [{}, { dnt: true }, { gpc: true }]) {
    const b = browser(flags);
    await b.trackUsage("page_view");
    assert.equal(b.sent.length, 0);
    assert.equal(b.cookies.size, 0);
    if (flags.dnt || flags.gpc) {
      b.setUsageChoice(true, ["approved"]);
      await b.trackUsage("page_view");
      assert.equal(b.sent.length, 0);
      assert.equal(b.cookies.size, 0);
    } else {
      b.setUsageChoice(false, []);
      await b.trackUsage("page_view");
      assert.equal(b.sent.length, 0);
    }
  }
});
test("approved analytics stores only coarse source labels; first touch stays direct after later campaigns", async () => {
  const b = browser();
  b.location.href = "https://www.songforalways.com/";
  b.document.referrer = "";
  b.setUsageChoice(true, []);
  let ctx = JSON.parse(b.storage.get("sg_usage_context"));
  assert.equal(ctx.first, "direct"); // initial external referrer
  b.location.href =
    "https://www.songforalways.com/pricing?utm_source=instagram&utm_medium=social&utm_campaign=person%40example.com&story=secret";
  b.location.pathname = "/pricing";
  b.refreshContext(["approved"]);
  ctx = JSON.parse(b.storage.get("sg_usage_context"));
  assert.equal(ctx.first, "direct");
  assert.equal(ctx.last, "instagram");
  assert.equal(ctx.campaign, "");
  await b.trackUsage("page_view");
  const payload = JSON.parse(b.sent[0].body);
  assert.equal(payload.page, "pricing");
  assert.doesNotMatch(
    JSON.stringify([...b.storage]),
    /private-query|secret|person@|https:\/\//,
  );
  assert.doesNotMatch(b.sent[0].body, /pathname|referrer|story|email|https:/);
  for (const path of [
    "/gift/secret",
    "/admin/users",
    "/song/private",
    "/account",
    "/lyrics/private",
  ]) {
    b.location.pathname = path;
    await b.trackUsage("page_view");
  }
  assert.equal(b.sent.length, 1);
});
test("withdrawal stops new collection before network deletion finishes, and remains retryable", async () => {
  const b = browser();
  b.setUsageChoice(true, ["approved"]);
  await b.trackUsage("page_view");
  b.setFail(true);
  b.stopUsage();
  await assert.rejects(b.withdrawUsage());
  assert.equal(b.getChoice(), "deny");
  await b.trackUsage("page_view");
  assert.equal(b.sent.filter((r) => r.method === "POST").length, 1);
  assert.equal(b.hasUsageSession(), true);
  b.setFail(false);
  await b.withdrawUsage();
  b.setUsageChoice(false, []);
  assert.equal(b.cookies.size, 0);
  assert.equal(b.storage.has("sg_usage_context"), false);
});
test("expiry and malformed browser storage do not leak identifiers or break core UI", async () => {
  const b = browser();
  b.setUsageChoice(true, []);
  const first = JSON.parse(b.storage.get("sg_usage_context")).id;
  b.storage.set("sg_usage_context", JSON.stringify({ id: first, expires: 1 }));
  await b.trackUsage("page_view");
  assert.equal(b.sent.length, 0);
  b.refreshContext([]);
  assert.notEqual(JSON.parse(b.storage.get("sg_usage_context")).id, first);
  for (const v of ['"invalid"', "null", "[1]", "{broken"]) {
    b.storage.set("sg_usage_context", v);
    assert.doesNotThrow(() => b.refreshContext([]));
    await b.trackUsage("page_view");
  }
});
