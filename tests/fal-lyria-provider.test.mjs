import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the production adapter with recorded HTTP response shapes. No
// network calls, payment requests, or real generation credits are involved.
function loadAdapter(responses, key = "test-only-key") {
  const calls = [];
  const context = vm.createContext({
    process: { env: { FAL_KEY: key } },
    AbortSignal,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses.shift();
      assert.ok(next, "Unexpected extra HTTP request");
      return new Response(JSON.stringify(next.body), { status: next.status || 200 });
    },
  });
  function load(path, require) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    const run = vm.runInContext(`(function(exports, require) {${outputText}\n})`, context);
    run(exports, require);
    return exports;
  }
  const prompts = load("../src/lib/prompts/music.ts");
  const { FalLyriaProvider } = load("../src/lib/providers/fal-lyria-provider.ts", (id) => {
    assert.equal(id, "@/lib/prompts/music");
    return prompts;
  });
  return { provider: new FalLyriaProvider(), calls };
}

const input = {
  recipientName: "Emma", occasion: "Birthday", story: "Our first walk by the river",
  mood: "Warm", style: "Acoustic pop", lyricsText: "[Chorus]\nEmma, this song is yours",
};

test("submits one request with approved lyrics and server authentication", async () => {
  const { provider, calls } = loadAdapter([{ body: { request_id: "task-1" } }]);
  const result = await provider.generateSong(input);
  assert.equal(result.providerJobId, "fal-lyria3-pro:task-1");
  assert.equal(result.status, "queued");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/lyria3/pro");
  assert.equal(calls[0].init.headers.Authorization, "Key test-only-key");
  const body = JSON.parse(calls[0].init.body);
  assert.ok(body.prompt.includes(input.lyricsText));
  assert.equal(body.num_samples, undefined);
});

test("polls owner/app URL and fetches the completed MP3", async () => {
  const { provider, calls } = loadAdapter([
    { body: { status: "IN_QUEUE" } },
    { body: { status: "IN_PROGRESS" } },
    { body: { status: "COMPLETED" } },
    { body: { audio: { url: "https://example.com/song.mp3" } } },
  ]);
  const id = "fal-lyria3-pro:task-1";
  assert.equal((await provider.getStatus(id)).status, "queued");
  assert.equal((await provider.getStatus(id)).status, "processing");
  const result = await provider.getStatus(id);
  assert.equal(result.audioUrl, "https://example.com/song.mp3");
  assert.equal(result.status, "completed");
  assert.equal(result.watermarked, true);
  assert.equal(calls[0].url, "https://queue.fal.run/fal-ai/lyria3/requests/task-1/status");
  assert.equal(calls[3].url, "https://queue.fal.run/fal-ai/lyria3/requests/task-1");
});

test("also accepts the documented string audio output", async () => {
  const { provider } = loadAdapter([
    { body: { status: "COMPLETED" } },
    { body: { audio: "https://example.com/song.mp3" } },
  ]);
  assert.equal((await provider.getStatus("fal-lyria3-pro:task-2")).status, "completed");
});

test("finished but failed tasks do not fetch audio or resubmit", async () => {
  const { provider, calls } = loadAdapter([
    { body: { status: "COMPLETED", error: "generation failed", error_type: "error" } },
  ]);
  assert.equal((await provider.getStatus("fal-lyria3-pro:task-3")).status, "failed");
  assert.equal(calls.length, 1);
});

test("missing key and insufficient credits fail without resubmission", async () => {
  const missing = loadAdapter([], "");
  await assert.rejects(missing.provider.generateSong(input), { name: "ProviderConfigurationError" });
  assert.equal(missing.calls.length, 0);
  const empty = loadAdapter([{ status: 402, body: { detail: "Insufficient credits" } }]);
  await assert.rejects(empty.provider.generateSong(input), { name: "ProviderConfigurationError" });
  assert.equal(empty.calls.length, 1);
});
