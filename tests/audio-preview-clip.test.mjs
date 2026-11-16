import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
function load(file) {
  const out = {};
  vm.runInNewContext(`(function(exports){${ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`, { Buffer, Headers, Response })(out);
  return out;
}
const { makePreviewClip } = load("src/lib/audio/preview-clip.ts");
const { audioResponse } = load("src/lib/audio/response.ts");
test("real MP3 decoder confirms CBR, VBR and lower sample-rate previews cannot contain more than 60 seconds", () => {
  const dir = mkdtempSync(join(tmpdir(), "songgift-clips-"));
  try {
    for (const [rate, args] of [[44100, ["-b:a", "192k"]], [48000, ["-q:a", "3"]], [22050, ["-b:a", "64k"]]]) {
      const source = join(dir, `full-${rate}.mp3`), target = join(dir, `clip-${rate}.mp3`);
      execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=${rate}:duration=75`, "-c:a", "libmp3lame", ...args, "-metadata", "title=TEST FULL ORIGINAL", "-y", source]);
      const bytes = readFileSync(source), clip = makePreviewClip(bytes);
      assert.ok(clip.bytes.length < bytes.length); assert.ok(clip.seconds <= 60 && clip.seconds > 59);
      assert.ok(!Buffer.from(clip.bytes).includes(Buffer.from("TEST FULL ORIGINAL")));
      writeFileSync(target, clip.bytes);
      const duration = Number(JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", target], { encoding: "utf8" })).format.duration);
      assert.ok(duration <= 60 && duration > 58.5, `Decoded ${rate}Hz preview duration ${duration}`);
      execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-i", target, "-f", "null", "-"]);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("PCM WAV truncation rewrites its data length and serves range requests only within the shortened file", async () => {
  const size = 8000 * 2 * 75, full = Buffer.alloc(44 + size);
  full.write("RIFF"); full.writeUInt32LE(full.length - 8, 4); full.write("WAVEfmt ", 8); full.writeUInt32LE(16, 16);
  full.writeUInt16LE(1, 20); full.writeUInt16LE(1, 22); full.writeUInt32LE(8000, 24); full.writeUInt32LE(16000, 28); full.writeUInt16LE(2, 32); full.writeUInt16LE(16, 34); full.write("data", 36); full.writeUInt32LE(size, 40);
  const clip = makePreviewClip(full); assert.equal(clip.seconds, 60); assert.equal(clip.bytes.length, 44 + 960000);
  assert.equal(audioResponse(clip.bytes, clip.mime, `bytes=${clip.bytes.length}-`).status, 416);
  const range = audioResponse(clip.bytes, clip.mime, "bytes=0-15"); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 16);
  const suffix = audioResponse(clip.bytes, clip.mime, "bytes=-10"); assert.equal(suffix.status, 206); assert.equal((await suffix.arrayBuffer()).byteLength, 10);
  assert.equal(audioResponse(clip.bytes, clip.mime, "bytes=0-1,10-20").status, 416);
});
test("unsupported and malformed input fails closed instead of returning the complete source", () => {
  for (const bytes of [Buffer.alloc(200), Buffer.from("not audio"), Buffer.from("ID3\x04\x00\x00\xff\x00\x00\x00" + "x".repeat(100))])
    assert.throws(() => makePreviewClip(bytes));
});
test("short songs also receive an excerpt rather than exposing their entire recording", () => {
  const dir = mkdtempSync(join(tmpdir(), "songgift-short-clips-"));
  try {
    for (const ext of ["mp3", "wav"]) {
      const file = join(dir, "short." + ext);
      execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=20", "-y", file]);
      const full = readFileSync(file), clip = makePreviewClip(full);
      assert.ok(clip.seconds > 14 && clip.seconds < 16);
      assert.ok(clip.bytes.length < full.length);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
