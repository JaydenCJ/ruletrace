/**
 * Import scanner + resolver tests. The scanner must honor Claude Code's
 * documented evaluation rules (no imports inside code blocks or spans,
 * max five hops) and the resolver must classify every failure mode —
 * missing target, cycle, escape from the root — instead of throwing.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import {
  MAX_IMPORT_DEPTH,
  flattenImports,
  resolveImports,
  scanImports,
} from "../dist/imports.js";
import { mktree } from "./helpers.mjs";

test("scanImports finds path-like @tokens, with line numbers and punctuation stripped", () => {
  const found = scanImports("Intro\nSee @docs/style.md and @README.md.\nRead @docs/guide.md, then rest.\n");
  assert.deepEqual(found, [
    { spec: "docs/style.md", line: 2 },
    { spec: "README.md", line: 2 },
    { spec: "docs/guide.md", line: 3 },
  ]);
});

test("scanImports ignores @mentions and email addresses", () => {
  // "@alice" has no slash or dot — prose, not an import; the "@" in an
  // email address is mid-word and never starts an import.
  assert.deepEqual(scanImports("thanks @alice for the review"), []);
  assert.deepEqual(scanImports("contact dev@example.test for access"), []);
});

test("scanImports skips fenced code blocks and inline code spans", () => {
  const backtick = "before\n```bash\ncat @config/file.txt\n```\nafter @real.md\n";
  assert.deepEqual(scanImports(backtick), [{ spec: "real.md", line: 5 }]);
  const tilde = "~~~\n@inside/fence.md\n~~~\nuse `@not/an/import.md` here\n";
  assert.deepEqual(scanImports(tilde), []);
});

test("resolveImports expands nested imports relative to the importer", () => {
  const fx = mktree({
    "CLAUDE.md": "root memory\n@docs/style.md\n",
    "docs/style.md": "style\n@naming.md\n",
    "docs/naming.md": "naming rules\n",
  });
  try {
    const nodes = resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root });
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].status, "ok");
    assert.equal(nodes[0].resolved, "docs/style.md");
    // `@naming.md` is relative to docs/style.md, not the root.
    assert.equal(nodes[0].children[0].resolved, "docs/naming.md");
    assert.equal(nodes[0].children[0].status, "ok");
  } finally {
    fx.cleanup();
  }
});

test("missing import targets are reported, not thrown", () => {
  const fx = mktree({ "CLAUDE.md": "@does/not/exist.md\n" });
  try {
    const nodes = resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root });
    assert.equal(nodes[0].status, "missing");
    assert.equal(nodes[0].resolved, "does/not/exist.md");
    assert.deepEqual(nodes[0].children, []);
  } finally {
    fx.cleanup();
  }
});

test("import cycles are detected and cut, including self-imports", () => {
  const fx = mktree({
    "CLAUDE.md": "@a.md\n",
    "a.md": "@b.md\n",
    "b.md": "@a.md\n",
    "self/CLAUDE.md": "@CLAUDE.md\n",
  });
  try {
    const nodes = resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root });
    const b = nodes[0].children[0];
    assert.equal(b.status, "ok");
    assert.equal(b.children[0].status, "cycle");
    assert.equal(b.children[0].resolved, "a.md");
    assert.deepEqual(b.children[0].children, []);
    const self = resolveImports(join(fx.root, "self/CLAUDE.md"), { root: fx.root });
    assert.equal(self[0].status, "cycle");
  } finally {
    fx.cleanup();
  }
});

test("expansion stops after MAX_IMPORT_DEPTH hops", () => {
  const files = { "CLAUDE.md": "@d1.md\n" };
  for (let i = 1; i <= 7; i++) files[`d${i}.md`] = `@d${i + 1}.md\n`;
  files["d8.md"] = "leaf\n";
  const fx = mktree(files);
  try {
    const nodes = resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root });
    const flat = flattenImports(nodes);
    const deepest = flat[flat.length - 1];
    assert.equal(deepest.depth, MAX_IMPORT_DEPTH + 1);
    assert.equal(deepest.node.status, "depth-exceeded");
    assert.equal(flat.filter((f) => f.node.status === "ok").length, MAX_IMPORT_DEPTH);
  } finally {
    fx.cleanup();
  }
});

test("relative imports escaping the root are flagged outside-root", () => {
  const fx = mktree({ "CLAUDE.md": "@../secrets.md\n" });
  try {
    const nodes = resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root });
    assert.equal(nodes[0].status, "outside-root");
    assert.equal(nodes[0].resolved, null);
  } finally {
    fx.cleanup();
  }
});

test("home imports stay opaque without --home and resolve with it", () => {
  const fx = mktree({ "CLAUDE.md": "@~/personal.md\n" });
  const home = mktree({ "personal.md": "my prefs\n" });
  try {
    const opaque = resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root });
    assert.equal(opaque[0].status, "home");
    const resolved = resolveImports(join(fx.root, "CLAUDE.md"), {
      root: fx.root,
      home: home.root,
    });
    assert.equal(resolved[0].status, "ok");
  } finally {
    fx.cleanup();
    home.cleanup();
  }
});

test("flattenImports walks depth-first with depth tags", () => {
  const fx = mktree({
    "CLAUDE.md": "@a.md\n@b.md\n",
    "a.md": "@c.md\n",
    "b.md": "leaf\n",
    "c.md": "leaf\n",
  });
  try {
    const flat = flattenImports(resolveImports(join(fx.root, "CLAUDE.md"), { root: fx.root }));
    assert.deepEqual(
      flat.map((f) => [f.node.resolved, f.depth]),
      [
        ["a.md", 1],
        ["c.md", 2],
        ["b.md", 1],
      ],
    );
  } finally {
    fx.cleanup();
  }
});
