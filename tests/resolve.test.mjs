/**
 * Orchestration tests: target normalization, inventory building (skip
 * dirs, determinism), tool filtering, and the assembled --content view.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import {
  assembleContent,
  buildInventory,
  explain,
  normalizeTarget,
} from "../dist/index.js";
import { mktree } from "./helpers.mjs";

test("normalizeTarget: cwd-relative inside the root, root-relative outside", () => {
  const fx = mktree({ "src/a.ts": "" });
  const elsewhere = mktree({});
  try {
    assert.equal(normalizeTarget(fx.root, "a.ts", join(fx.root, "src")), "src/a.ts");
    assert.equal(normalizeTarget(fx.root, "src/a.ts", elsewhere.root), "src/a.ts");
    // Trailing slash survives as the directory marker.
    assert.equal(normalizeTarget(fx.root, "src/", fx.root), "src/");
  } finally {
    fx.cleanup();
    elsewhere.cleanup();
  }
});

test("normalizeTarget rejects escapes from the root", () => {
  const fx = mktree({});
  try {
    assert.throws(() => normalizeTarget(fx.root, "../outside.ts", fx.root), /outside the root/);
  } finally {
    fx.cleanup();
  }
});

test("inventory skips .git and node_modules and sorts its lists", () => {
  const fx = mktree({
    "CLAUDE.md": "root\n",
    ".git/CLAUDE.md": "not a rule\n",
    "node_modules/pkg/CLAUDE.md": "vendored\n",
    "z/AGENTS.md": "",
    "a/AGENTS.md": "",
    "AGENTS.md": "",
  });
  try {
    const inv = buildInventory(fx.root);
    assert.deepEqual(inv.claudeFiles, ["CLAUDE.md"]);
    assert.deepEqual(inv.agentsFiles, ["AGENTS.md", "a/AGENTS.md", "z/AGENTS.md"]);
  } finally {
    fx.cleanup();
  }
});

test("explain honors the tools filter and preserves its order", () => {
  const fx = mktree({ "CLAUDE.md": "root\n", "AGENTS.md": "notes\n", "a.ts": "" });
  try {
    const trace = explain(fx.root, "a.ts", { tools: ["agents", "claude"] });
    assert.deepEqual(
      trace.tools.map((t) => t.tool),
      ["agents", "claude"],
    );
  } finally {
    fx.cleanup();
  }
});

test("assembleContent inlines imports depth-first after their importer", () => {
  const fx = mktree({
    "CLAUDE.md": "root memory\n@docs/style.md\n",
    "docs/style.md": "style\n@naming.md\n",
    "docs/naming.md": "naming\n",
    "src/CLAUDE.md": "src memory\n",
    "src/a.ts": "",
  });
  try {
    const pieces = assembleContent(explain(fx.root, "src/a.ts", { tools: ["claude"] }));
    assert.deepEqual(
      pieces.map((p) => p.file),
      ["CLAUDE.md", "docs/style.md", "docs/naming.md", "src/CLAUDE.md"],
    );
    assert.match(pieces[1].provenance, /imported via @docs\/style\.md from CLAUDE\.md:2/);
    assert.equal(pieces[2].text, "naming\n");
  } finally {
    fx.cleanup();
  }
});

test("assembleContent marks unresolvable imports instead of omitting them", () => {
  const fx = mktree({ "CLAUDE.md": "@gone.md\n", "a.ts": "" });
  try {
    const pieces = assembleContent(explain(fx.root, "a.ts", { tools: ["claude"] }));
    assert.equal(pieces.length, 2);
    assert.match(pieces[1].text, /\[unresolved import: missing\]/);
  } finally {
    fx.cleanup();
  }
});

test("assembleContent skips non-applied layers", () => {
  const fx = mktree({
    ".cursor/rules/manual.mdc": "manual body\n",
    ".cursor/rules/base.mdc": "---\nalwaysApply: true\n---\nbase body\n",
    "a.ts": "",
  });
  try {
    const pieces = assembleContent(explain(fx.root, "a.ts", { tools: ["cursor"] }));
    assert.deepEqual(
      pieces.map((p) => p.file),
      [".cursor/rules/base.mdc"],
    );
  } finally {
    fx.cleanup();
  }
});
