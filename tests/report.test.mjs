/**
 * Reporter tests: pin the text layout details users grep for and the
 * stability of the JSON schema, without going through a child process.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInventory,
  explain,
  renderCheck,
  renderCheckJson,
  renderExplainJson,
  renderExplainText,
  renderTree,
} from "../dist/index.js";
import { mktree } from "./helpers.mjs";

test("explain text shows a friendly line for tools with no layers", () => {
  const fx = mktree({ "CLAUDE.md": "root\n", "a.ts": "" });
  try {
    const text = renderExplainText(explain(fx.root, "a.ts"), "0.1.0");
    assert.match(text, /cursor — no rule files apply/);
    assert.match(text, /copilot — no rule files apply/);
  } finally {
    fx.cleanup();
  }
});

test("explain text marks agent-requested layers with ~ instead of a number", () => {
  const fx = mktree({
    ".cursor/rules/agent.mdc": "---\ndescription: reviews\n---\nbody\n",
    "a.ts": "",
  });
  try {
    const text = renderExplainText(explain(fx.root, "a.ts"), "0.1.0");
    assert.match(text, /^ {2}~ {2}\.cursor\/rules\/agent\.mdc/m);
  } finally {
    fx.cleanup();
  }
});

test("explain text renders the root target as '.'", () => {
  const fx = mktree({ "CLAUDE.md": "root\n" });
  try {
    const text = renderExplainText(explain(fx.root, ""), "0.1.0");
    assert.match(text, /^target: \.$/m);
  } finally {
    fx.cleanup();
  }
});

test("nested imports are indented under their parent", () => {
  const fx = mktree({
    "CLAUDE.md": "@a.md\n",
    "a.md": "@b.md\n",
    "b.md": "leaf\n",
    "x.ts": "",
  });
  try {
    const text = renderExplainText(explain(fx.root, "x.ts"), "0.1.0");
    const parent = text.split("\n").find((l) => l.includes("@a.md"));
    const child = text.split("\n").find((l) => l.includes("@b.md"));
    assert.ok(parent && child);
    assert.ok(child.search(/\S/) > parent.search(/\S/), "child indented deeper");
  } finally {
    fx.cleanup();
  }
});

test("explain JSON round-trips and keeps layer fields", () => {
  const fx = mktree({ "AGENTS.md": "notes\n", "a.ts": "" });
  try {
    const doc = JSON.parse(renderExplainJson(explain(fx.root, "a.ts")));
    const agents = doc.tools.find((t) => t.tool === "agents");
    assert.deepEqual(Object.keys(agents.layers[0]).sort(), [
      "applied",
      "attachment",
      "detail",
      "file",
      "precedence",
      "tool",
    ]);
  } finally {
    fx.cleanup();
  }
});

test("check rendering: locations, severity summary, and the clean-run line", () => {
  const diagnostics = [
    { severity: "error", tool: "claude", file: "CLAUDE.md", line: 3, code: "import-missing", message: "m" },
    { severity: "warning", tool: "cursor", file: "r.mdc", code: "glob-dead", message: "m" },
  ];
  const text = renderCheck(diagnostics, "0.1.0");
  assert.match(text, /CLAUDE\.md:3/);
  assert.match(text, /1 error, 1 warning, 0 notes/);
  assert.equal(renderCheck([], "0.1.0"), "ruletrace 0.1.0 — check: no problems found\n");
  assert.deepEqual(JSON.parse(renderCheckJson([])), { schema_version: 1, diagnostics: [] });
});

test("tree rendering labels rule kinds", () => {
  const fx = mktree({
    "CLAUDE.local.md": "personal\n",
    ".cursor/rules/base.mdc": "---\nalwaysApply: true\n---\nbody\n",
    ".github/instructions/t.instructions.md": '---\napplyTo: "tests/**"\n---\nbody\n',
    "tests/a.ts": "",
  });
  try {
    const text = renderTree(buildInventory(fx.root), "0.1.0");
    assert.match(text, /CLAUDE\.local\.md\s+personal memory/);
    assert.match(text, /base\.mdc\s+always/);
    assert.match(text, /t\.instructions\.md\s+auto \(tests\/\*\*\)/);
  } finally {
    fx.cleanup();
  }
});
