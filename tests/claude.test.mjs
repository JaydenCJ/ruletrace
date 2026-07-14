/**
 * Claude Code layer resolution tests: ancestor nesting order, local
 * memory files, sibling-directory isolation, and the shape of the
 * import trees attached to each layer.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { explain } from "../dist/index.js";
import { mktree } from "./helpers.mjs";

function claudeLayers(trace) {
  return trace.tools.find((t) => t.tool === "claude").layers;
}

test("every ancestor CLAUDE.md applies, shallow to deep", () => {
  const fx = mktree({
    "CLAUDE.md": "root\n",
    "src/CLAUDE.md": "src\n",
    "src/parser/CLAUDE.md": "parser\n",
    "src/parser/lex.ts": "",
  });
  try {
    const layers = claudeLayers(explain(fx.root, "src/parser/lex.ts"));
    assert.deepEqual(
      layers.map((l) => l.file),
      ["CLAUDE.md", "src/CLAUDE.md", "src/parser/CLAUDE.md"],
    );
    assert.deepEqual(
      layers.map((l) => l.precedence),
      [1, 2, 3],
    );
    assert.equal(layers.every((l) => l.applied), true);
  } finally {
    fx.cleanup();
  }
});

test("sibling-directory and deeper-than-target CLAUDE.md files do not apply", () => {
  const fx = mktree({
    "CLAUDE.md": "root\n",
    "lib/CLAUDE.md": "lib only\n",
    "src/CLAUDE.md": "src\n",
    "src/deep/CLAUDE.md": "deeper\n",
    "src/a.ts": "",
  });
  try {
    const layers = claudeLayers(explain(fx.root, "src/a.ts"));
    assert.deepEqual(
      layers.map((l) => l.file),
      ["CLAUDE.md", "src/CLAUDE.md"],
    );
  } finally {
    fx.cleanup();
  }
});

test("CLAUDE.local.md rides alongside its sibling as a local layer", () => {
  const fx = mktree({
    "CLAUDE.md": "shared\n",
    "CLAUDE.local.md": "personal\n",
    "a.ts": "",
  });
  try {
    const layers = claudeLayers(explain(fx.root, "a.ts"));
    assert.deepEqual(
      layers.map((l) => [l.file, l.attachment]),
      [
        ["CLAUDE.md", "nesting"],
        ["CLAUDE.local.md", "local"],
      ],
    );
  } finally {
    fx.cleanup();
  }
});

test("layers carry their resolved import trees", () => {
  const fx = mktree({
    "CLAUDE.md": "see @docs/style.md\n",
    "docs/style.md": "style\n",
    "a.ts": "",
  });
  try {
    const [layer] = claudeLayers(explain(fx.root, "a.ts"));
    assert.equal(layer.imports.length, 1);
    assert.equal(layer.imports[0].resolved, "docs/style.md");
    assert.equal(layer.imports[0].status, "ok");
  } finally {
    fx.cleanup();
  }
});

test("directory targets include their own CLAUDE.md; the root target only root's", () => {
  const fx = mktree({
    "CLAUDE.md": "root\n",
    "src/CLAUDE.md": "src\n",
  });
  try {
    // Trailing slash marks the target as a directory.
    assert.deepEqual(
      claudeLayers(explain(fx.root, "src/")).map((l) => l.file),
      ["CLAUDE.md", "src/CLAUDE.md"],
    );
    assert.deepEqual(
      claudeLayers(explain(fx.root, "")).map((l) => l.file),
      ["CLAUDE.md"],
    );
  } finally {
    fx.cleanup();
  }
});

test("a repo with no memory files yields an empty claude trace", () => {
  const fx = mktree({ "src/a.ts": "" });
  try {
    assert.deepEqual(claudeLayers(explain(fx.root, "src/a.ts")), []);
  } finally {
    fx.cleanup();
  }
});
