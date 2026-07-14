/**
 * Pure argv-parsing tests: subcommand detection, flag validation, tool
 * lists with aliases, and the usage errors users actually hit.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, UsageError } from "../dist/cliargs.js";

test("a bare path is the explain subcommand with default options", () => {
  const cmd = parseArgs(["src/a.ts"]);
  assert.equal(cmd.kind, "explain");
  assert.equal(cmd.target, "src/a.ts");
  assert.equal(cmd.opts.json, false);
  assert.equal(cmd.opts.tools, null);
});

test("tree/check subcommands; help and version short-circuit everything", () => {
  assert.equal(parseArgs(["tree"]).kind, "tree");
  assert.equal(parseArgs(["check", "--strict"]).kind, "check");
  assert.equal(parseArgs(["--help"]).kind, "help");
  assert.equal(parseArgs(["-V"]).kind, "version");
  assert.equal(parseArgs(["tree", "--version"]).kind, "version");
});

test("--tool parses CSV with aliases, dedup, accumulation and 'all'", () => {
  assert.deepEqual(parseArgs(["a.ts", "--tool", "claude-code,agents-md,claude"]).opts.tools, [
    "claude",
    "agents",
  ]);
  assert.deepEqual(parseArgs(["a.ts", "--tool", "claude", "--tool", "cursor"]).opts.tools, [
    "claude",
    "cursor",
  ]);
  assert.deepEqual(parseArgs(["a.ts", "--tool", "all"]).opts.tools, [
    "claude",
    "cursor",
    "copilot",
    "agents",
  ]);
});

test("unknown tool names are usage errors", () => {
  assert.throws(() => parseArgs(["a.ts", "--tool", "emacs"]), UsageError);
});

test("bad invocations are usage errors with specific messages", () => {
  assert.throws(() => parseArgs(["a.ts", "--root"]), /--root requires a value/);
  assert.throws(() => parseArgs(["a.ts", "--frobnicate"]), /unknown option/);
  assert.throws(() => parseArgs([]), /missing target path/);
  assert.throws(() => parseArgs(["a.ts", "b.ts"]), /unexpected extra argument/);
});

test("--strict outside check is rejected", () => {
  assert.throws(() => parseArgs(["a.ts", "--strict"]), /--strict only applies/);
  assert.throws(() => parseArgs(["tree", "--strict"]), /--strict only applies/);
});

test("--content outside explain is rejected", () => {
  assert.throws(() => parseArgs(["tree", "--content"]), /--content only applies/);
  assert.throws(() => parseArgs(["check", "--content"]), /--content only applies/);
});
