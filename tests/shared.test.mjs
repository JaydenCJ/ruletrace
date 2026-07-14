/**
 * Tests for the small path helpers every resolver leans on. They are
 * trivial to call and catastrophic to get wrong, so they get their own
 * pinned cases.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { ancestorDirs, relativeToScope, withinDir } from "../dist/tools/shared.js";

test("ancestorDirs runs shallow to deep and starts at the root", () => {
  assert.deepEqual(ancestorDirs("src/parser/lex.ts"), ["", "src", "src/parser"]);
  assert.deepEqual(ancestorDirs("README.md"), [""]);
  assert.deepEqual(ancestorDirs(""), [""]);
  // A trailing slash marks a directory target: the directory itself counts.
  assert.deepEqual(ancestorDirs("src/parser/"), ["", "src", "src/parser"]);
});

test("withinDir: root scope contains everything, prefixes are strict", () => {
  assert.equal(withinDir("", "any/file.ts"), true);
  assert.equal(withinDir("src", "src/a.ts"), true);
  assert.equal(withinDir("src", "src"), true);
  // "srcx" must not count as inside "src" — the classic prefix bug.
  assert.equal(withinDir("src", "srcx/a.ts"), false);
});

test("relativeToScope strips exactly the scope prefix", () => {
  assert.equal(relativeToScope("", "src/a.ts"), "src/a.ts");
  assert.equal(relativeToScope("packages/web", "packages/web/src/a.ts"), "src/a.ts");
});
