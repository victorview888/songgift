import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function load(file, clock = Date) {
  const out = {}, source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(exports,require){${source}\n})`, { Date: clock, Intl })(out, name => {
    assert.match(name, /^\.\//);
    return load(resolve(dirname(file), name + ".ts"), clock);
  });
  return out;
}
const presets = load("src/lib/occasion-presets.ts");

test("occasion links select actual form values for weddings, anniversaries, birthdays, memorials and holidays", () => {
  for (const [slug, value] of [["wedding", "Wedding"], ["anniversary", "Anniversary"], ["birthday", "Birthday"], ["memorial", "In memory"], ["christmas", "Christmas"], ["christmas-eve", "Christmas Eve"], ["new-year", "New Year"]]) {
    assert.equal(presets.getOccasionPreset(slug).occasion, value);
    assert.equal(presets.occasionCreateHref(slug), `/create?occasion=${slug}`);
  }
});

test("only exact allowlisted occasion keys can enter a preset link", () => {
  for (const slug of ["__proto__", "constructor", "toString", "https://example.com", "wedding&story=unexpected", "wedding?recipient=unexpected", "", null, undefined]) {
    assert.equal(presets.getOccasionPreset(slug), undefined);
    assert.equal(presets.occasionCreateHref(slug), "/create");
  }
});

test("content dates stay tied to published edits when the build/request clock changes", () => {
  class LaterClock extends Date { constructor(...args) { super(...(args.length ? args : ["2030-01-01T00:00:00Z"])); } }
  const current = load("src/lib/content-dates.ts"), later = load("src/lib/content-dates.ts", LaterClock);
  for (const path of ["/", "/pricing", "/help", "/occasions/wedding", "/policies/terms", "/guides/review-lyrics-before-music", "/guides/give-a-personal-song-gift"]) {
    assert.equal(current.contentModifiedOn(path), later.contentModifiedOn(path));
    assert.match(current.contentModifiedOn(path), /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const path of ["/my-songs", "/report", "/admin", "__proto__", "/unknown"])
    assert.equal(current.contentModifiedOn(path), undefined);
  assert.equal(current.formatContentDate("2026-11-15"), "15 November 2026");
  assert.equal(current.formatContentDate("2026-11-10"), "10 November 2026");
});
