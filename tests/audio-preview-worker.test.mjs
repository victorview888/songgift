import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export (?=(?:const|function|async function))/gm, "");
}

test("Workers downloads and clips actual MP3 audio with supported fetch options and rejects redirects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "songgift-worker-audio-"));
  let mf;
  try {
    const original = join(dir, "original.mp3"), clipped = join(dir, "preview.mp3"), worker = join(dir, "worker.mjs");
    execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=75", "-c:a", "libmp3lame", "-b:a", "192k", "-y", original]);
    // Compile the actual production downloader without unrelated database imports.
    const file = ts.createSourceFile("song-assets.ts", readFileSync("src/lib/supabase/song-assets.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const downloader = file.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "sourceBytes" || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(d => d.name.getText(file) === "MAX_AUDIO_BYTES")).map(statement => statement.getText(file)).join("\n");
    assert.ok(downloader.includes("async function sourceBytes"));
    const code = compile(downloader) + "\n" + compile(readFileSync("src/lib/audio/preview-clip.ts", "utf8")) + "\n" + compile(readFileSync("src/lib/audio/response.ts", "utf8")) + `
let fixture;
const fetch = async (input, init) => {
  // The real Workers Request constructor validates redirect/cache options.
  // Node alone accepts redirect:error and would miss this production failure.
  const request = new Request(input, init);
  if (request.url === 'https://audio.isolated.example/redirect.mp3') return new Response(null, {status:302,headers:{Location:'https://forbidden.invalid/song.mp3'}});
  if (request.url !== 'https://audio.isolated.example/original.mp3') throw new Error('External request blocked');
  return new Response(fixture, {headers:{'Content-Type':'audio/mpeg'}});
};
export default {async fetch(request) {
  fixture = new Uint8Array(await request.arrayBuffer());
  try {
    const mode = new URL(request.url).pathname === '/redirect' ? 'redirect' : 'original';
    const source = await sourceBytes({audio_url:'https://audio.isolated.example/'+mode+'.mp3',audio_base64:null,mime_type:'audio/mpeg'});
    const clip = makePreviewClip(source);
    return audioResponse(clip.bytes, clip.mime, request.headers.get('range'));
  } catch(error) {return Response.json({error:error.name}, {status:503});}
}};`;
    writeFileSync(worker, code);
    mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "isolated-audio", modulesRoot: dir, modules: [{ type: "ESModule", path: worker }], compatibilityDate: "2026-11-02", compatibilityFlags: ["nodejs_compat"] }] }));
    const body = readFileSync(original);
    const response = await mf.dispatchFetch("https://isolated-audio/", { method: "POST", body });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length < body.length); writeFileSync(clipped, bytes);
    const duration = Number(JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", clipped], { encoding: "utf8" })).format.duration);
    assert.ok(duration <= 60 && duration > 59, `Actual Worker clip duration: ${duration}`);
    const redirected = await mf.dispatchFetch("https://isolated-audio/redirect", { method: "POST", body });
    assert.equal(redirected.status, 503); assert.equal((await redirected.json()).error, "AudioDownloadHttp302");
    const beyond = await mf.dispatchFetch("https://isolated-audio/", { method: "POST", body, headers: { Range: `bytes=${bytes.length}-` } });
    assert.equal(beyond.status, 416);
  } finally { await mf?.dispose(); rmSync(dir, { recursive: true, force: true }); }
});
