/**
 * Glob matcher tests. These pin the exact semantics documented in
 * docs/resolution.md: `**` spans segments, `*`/`?` stop at `/`, patterns
 * without a slash match against the basename (Cursor's `*.ts` habit),
 * and braces/character classes behave like every mainstream matcher.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { expandBraces, firstMatch, globMatches } from "../dist/glob.js";

test("star and question mark match within a single segment only", () => {
  assert.equal(globMatches("src/*.ts", "src/main.ts"), true);
  assert.equal(globMatches("src/*.ts", "src/deep/main.ts"), false);
  assert.equal(globMatches("src/?.ts", "src/a.ts"), true);
  assert.equal(globMatches("src/?.ts", "src/ab.ts"), false);
  assert.equal(globMatches("src/?.ts", "src//.ts"), false);
});

test("double star spans segments, including zero of them", () => {
  assert.equal(globMatches("src/**/*.ts", "src/a/b/c.ts"), true);
  assert.equal(globMatches("src/**/*.ts", "lib/a.ts"), false);
  // `src/**/*.ts` must match a file directly inside src/ — the classic
  // off-by-one that breaks naive translations to regex.
  assert.equal(globMatches("src/**/*.ts", "src/main.ts"), true);
  assert.equal(globMatches("tests/**", "tests/unit/a.test.ts"), true);
  assert.equal(globMatches("tests/**", "test/a.ts"), false);
  assert.equal(globMatches("**", "any/path/at/all.txt"), true);
});

test("no slash means basename matching; a slash forces full-path matching", () => {
  assert.equal(globMatches("*.md", "docs/deep/notes.md"), true);
  assert.equal(globMatches("*.md", "docs/deep/notes.txt"), false);
  assert.equal(globMatches("docs/*.md", "docs/notes.md"), true);
  assert.equal(globMatches("docs/*.md", "other/docs/notes.md"), false);
});

test("brace alternation expands (nested too); unbalanced braces stay literal", () => {
  assert.deepEqual(expandBraces("a.{ts,js}").sort(), ["a.js", "a.ts"]);
  assert.deepEqual(expandBraces("{a,b{c,d}}").sort(), ["a", "bc", "bd"]);
  assert.equal(globMatches("src/**/*.{ts,tsx}", "src/ui/app.tsx"), true);
  assert.equal(globMatches("weird{name", "weird{name"), true);
  assert.equal(globMatches("weird{name", "weirdname"), false);
});

test("character classes and negated classes", () => {
  assert.equal(globMatches("file[0-9].txt", "file7.txt"), true);
  assert.equal(globMatches("file[!0-9].txt", "fileA.txt"), true);
  assert.equal(globMatches("file[!0-9].txt", "file7.txt"), false);
});

test("regex metacharacters in patterns are literal", () => {
  assert.equal(globMatches("a+b.txt", "a+b.txt"), true);
  assert.equal(globMatches("a+b.txt", "aab.txt"), false);
  assert.equal(globMatches("a.b", "axb"), false);
});

test("leading ./ and / are normalized; empty patterns match nothing", () => {
  assert.equal(globMatches("./src/*.ts", "src/a.ts"), true);
  assert.equal(globMatches("/src/*.ts", "src/a.ts"), true);
  assert.equal(globMatches("", "anything"), false);
  assert.equal(globMatches("   ", "anything"), false);
});

test("firstMatch returns the first matching pattern or null", () => {
  assert.equal(firstMatch(["*.js", "*.ts"], "src/a.ts"), "*.ts");
  assert.equal(firstMatch(["*.js", "*.go"], "src/a.ts"), null);
});

test("matching is case-sensitive", () => {
  assert.equal(globMatches("*.TS", "src/a.ts"), false);
});
