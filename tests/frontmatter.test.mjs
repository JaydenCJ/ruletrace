/**
 * Frontmatter parser tests. The parser deliberately covers only the tiny
 * YAML dialect rule files use; anything it cannot read must surface as an
 * error entry instead of a silently-wrong value.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeStringList, parseFrontmatter } from "../dist/frontmatter.js";

test("file without frontmatter keeps the whole body", () => {
  const fm = parseFrontmatter("# Title\n\nBody.\n");
  assert.equal(fm.present, false);
  assert.equal(fm.body, "# Title\n\nBody.\n");
  assert.deepEqual(fm.data, {});
});

test("scalar values: strings, booleans, quotes; endLine points at the fence", () => {
  const fm = parseFrontmatter(
    '---\ndescription: House style\nalwaysApply: true\nname: "quoted value"\n---\nBody\n',
  );
  assert.equal(fm.present, true);
  assert.equal(fm.data.description, "House style");
  assert.equal(fm.data.alwaysApply, true);
  assert.equal(fm.data.name, "quoted value");
  assert.equal(fm.body, "Body\n");
  assert.equal(fm.endLine, 5);
  assert.deepEqual(fm.errors, []);
});

test("inline and block lists both parse element-wise", () => {
  const inline = parseFrontmatter("---\nglobs: [src/**/*.ts, tests/**]\n---\n");
  assert.deepEqual(inline.data.globs, ["src/**/*.ts", "tests/**"]);
  const block = parseFrontmatter("---\nglobs:\n  - src/**/*.ts\n  - docs/*.md\n---\n");
  assert.deepEqual(block.data.globs, ["src/**/*.ts", "docs/*.md"]);
});

test("comments and blank lines inside frontmatter are skipped", () => {
  const fm = parseFrontmatter("---\n# a comment\n\nkey: value\n---\n");
  assert.deepEqual(fm.errors, []);
  assert.equal(fm.data.key, "value");
});

test("unclosed frontmatter is an error, not a hang", () => {
  const fm = parseFrontmatter("---\nkey: value\nno closing fence\n");
  assert.equal(fm.present, true);
  assert.equal(fm.errors.length >= 1, true);
  assert.match(fm.errors[fm.errors.length - 1], /never closed/);
});

test("malformed lines are reported with their line number", () => {
  const words = parseFrontmatter("---\njust some words\n---\n");
  assert.equal(words.errors.length, 1);
  assert.match(words.errors[0], /line 2/);
  const floating = parseFrontmatter("---\n- floating item\n---\n");
  assert.match(floating.errors[0], /list item without a preceding key/);
});

test("normalizeStringList accepts strings, CSV strings and arrays", () => {
  assert.deepEqual(normalizeStringList("*.ts"), ["*.ts"]);
  assert.deepEqual(normalizeStringList("*.ts, *.tsx"), ["*.ts", "*.tsx"]);
  assert.deepEqual(normalizeStringList(["a", "b,c"]), ["a", "b", "c"]);
  assert.deepEqual(normalizeStringList(undefined), []);
  assert.deepEqual(normalizeStringList(null), []);
});
