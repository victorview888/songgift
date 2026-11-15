import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const api = {};
const code = ts.transpileModule(readFileSync("src/lib/holidays.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(`(function(exports){${code}\n})`, { Date, Intl })(api);
const dates = instant => Array.from(api.featuredHolidays(new Date(instant)), holiday => holiday.date);

test("holiday feature follows the season across the year boundary and keeps today's holiday", () => {
  assert.deepEqual(dates("2026-11-15T12:00:00Z"), ["2026-12-24", "2026-12-25", "2027-01-01"]);
  assert.deepEqual(dates("2026-12-25T23:59:59Z"), ["2026-12-25", "2027-01-01"]);
  assert.deepEqual(dates("2027-01-01T23:59:59Z"), ["2027-01-01"]);
  assert.deepEqual(dates("2027-11-15T00:00:00Z"), ["2027-12-24", "2027-12-25", "2028-01-01"]);
});

test("expired holiday promotions disappear; evergreen form options remain available", () => {
  for (const instant of ["2027-01-02T00:00:00Z", "2027-06-15T00:00:00Z", "2027-10-31T23:59:59Z"])
    assert.deepEqual(dates(instant), []);
  assert.equal(api.holidayOccasions.length, 3);
  assert.equal(api.holidayForOccasion("New Year").slug, "new-year");
});

test("only known holiday slugs can preselect a form occasion", () => {
  for (const holiday of api.holidayOccasions) {
    assert.equal(api.getHoliday(holiday.slug).occasion, holiday.occasion);
    assert.equal(api.holidayCreateHref(holiday.slug), `/create?occasion=${holiday.slug}`);
  }
  for (const unknown of ["__proto__", "constructor", "<script>", "https://example.com", ""])
    assert.equal(api.holidayCreateHref(unknown), "/create");
  assert.equal(api.getHoliday(null), undefined);
  assert.equal(api.getHoliday("christmas&story=unexpected"), undefined);
});
