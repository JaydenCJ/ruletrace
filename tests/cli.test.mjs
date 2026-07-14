/**
 * End-to-end CLI tests: spawn the real dist/cli.js against fixture
 * repositories and assert on stdout, stderr and exit codes — the same
 * surface scripts/smoke.sh exercises, but hermetic and fine-grained.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mktree } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(args, cwd) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const FIXTURE = {
  "CLAUDE.md": "root memory\nsee @docs/style.md\n",
  "docs/style.md": "style rules\n",
  "src/CLAUDE.md": "src memory\n",
  ".cursor/rules/ts.mdc": "---\nglobs: src/**/*.ts\n---\nTS rules\n",
  ".github/copilot-instructions.md": "repo instructions\n",
  "AGENTS.md": "agent notes\n",
  "src/a.ts": "export {};\n",
};

test("--version and --help print to stdout and exit 0", () => {
  const fx = mktree({});
  try {
    const version = run(["--version"], fx.root);
    assert.equal(version.code, 0);
    assert.equal(version.stdout, "ruletrace 0.1.0\n");
    const help = run(["--help"], fx.root);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /ruletrace <path>/);
    assert.match(help.stdout, /Exit codes/);
  } finally {
    fx.cleanup();
  }
});

test("explain renders every tool section with layers and imports", () => {
  const fx = mktree(FIXTURE);
  try {
    const { code, stdout } = run(["src/a.ts", "--root", "."], fx.root);
    assert.equal(code, 0);
    assert.match(stdout, /claude-code — 2 layers/);
    assert.match(stdout, /-> @docs\/style\.md\s+\[ok\]/);
    assert.match(stdout, /cursor — 1 layer/);
    assert.match(stdout, /glob src\/\*\*\/\*\.ts matched/);
    assert.match(stdout, /copilot — 1 layer/);
    assert.match(stdout, /agents\.md — 1 layer/);
    // --tool restricts the report to the named tool.
    const filtered = run(["src/a.ts", "--root", ".", "--tool", "cursor"], fx.root);
    assert.match(filtered.stdout, /cursor — 1 layer/);
    assert.doesNotMatch(filtered.stdout, /claude-code/);
  } finally {
    fx.cleanup();
  }
});

test("explain --json emits schema_version 1 with the full trace", () => {
  const fx = mktree(FIXTURE);
  try {
    const { code, stdout } = run(["src/a.ts", "--root", ".", "--json"], fx.root);
    assert.equal(code, 0);
    const doc = JSON.parse(stdout);
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.target, "src/a.ts");
    assert.deepEqual(
      doc.tools.map((t) => t.tool),
      ["claude", "cursor", "copilot", "agents"],
    );
  } finally {
    fx.cleanup();
  }
});

test("explain --content concatenates applied layers with banners", () => {
  const fx = mktree(FIXTURE);
  try {
    const { code, stdout } = run(["src/a.ts", "--root", ".", "--content"], fx.root);
    assert.equal(code, 0);
    const claudeIdx = stdout.indexOf("===== CLAUDE.md");
    const importIdx = stdout.indexOf("===== docs/style.md");
    const srcIdx = stdout.indexOf("===== src/CLAUDE.md");
    assert.ok(claudeIdx >= 0 && importIdx > claudeIdx && srcIdx > importIdx);
    assert.match(stdout, /imported via @docs\/style\.md from CLAUDE\.md:2/);
  } finally {
    fx.cleanup();
  }
});

test("tree lists the whole inventory", () => {
  const fx = mktree(FIXTURE);
  try {
    const { code, stdout } = run(["tree", "--root", "."], fx.root);
    assert.equal(code, 0);
    assert.match(stdout, /claude-code \(2\)/);
    assert.match(stdout, /cursor \(1\)/);
    assert.match(stdout, /auto \(src\/\*\*\/\*\.ts\)/);
  } finally {
    fx.cleanup();
  }
});

test("check exits 0 on a clean repo, 1 on errors", () => {
  const clean = mktree(FIXTURE);
  const broken = mktree({ "CLAUDE.md": "@missing.md\n" });
  try {
    const ok = run(["check", "--root", "."], clean.root);
    assert.equal(ok.code, 0);
    assert.match(ok.stdout, /no problems found/);
    const bad = run(["check", "--root", "."], broken.root);
    assert.equal(bad.code, 1);
    assert.match(bad.stdout, /import-missing/);
  } finally {
    clean.cleanup();
    broken.cleanup();
  }
});

test("check --strict turns warnings into a failing exit", () => {
  const fx = mktree({ ".cursorrules": "legacy\n" });
  try {
    assert.equal(run(["check", "--root", "."], fx.root).code, 0);
    assert.equal(run(["check", "--root", ".", "--strict"], fx.root).code, 1);
  } finally {
    fx.cleanup();
  }
});

test("usage errors and out-of-root targets exit 2 with messages on stderr", () => {
  const fx = mktree({ "src/a.ts": "" });
  try {
    const bogus = run(["--bogus"], fx.root);
    assert.equal(bogus.code, 2);
    assert.match(bogus.stderr, /unknown option --bogus/);
    assert.match(bogus.stderr, /Usage:/);
    const outside = run(["../elsewhere.ts", "--root", "."], fx.root);
    assert.equal(outside.code, 2);
    assert.match(outside.stderr, /outside the root/);
  } finally {
    fx.cleanup();
  }
});

test("a nonexistent target path still resolves (what-if mode)", () => {
  const fx = mktree({ "src/CLAUDE.md": "src memory\n" });
  try {
    const { code, stdout } = run(["src/future/new-file.ts", "--root", "."], fx.root);
    assert.equal(code, 0);
    assert.match(stdout, /src\/CLAUDE\.md/);
  } finally {
    fx.cleanup();
  }
});

