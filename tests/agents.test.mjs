/**
 * AGENTS.md resolution tests: the whole ancestor chain is listed, the
 * nearest file is marked as taking precedence, and overridden ancestors
 * point at their overrider.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { explain } from "../dist/index.js";
import { mktree } from "./helpers.mjs";

function agentsLayers(trace) {
  return trace.tools.find((t) => t.tool === "agents").layers;
}

test("a lone root AGENTS.md is the nearest file and applies", () => {
  const fx = mktree({ "AGENTS.md": "root\n", "src/a.ts": "" });
  try {
    const layers = agentsLayers(explain(fx.root, "src/a.ts"));
    assert.equal(layers.length, 1);
    assert.match(layers[0].detail, /takes precedence/);
    assert.equal(layers[0].overriddenBy, undefined);
    assert.equal(layers[0].applied, true);
  } finally {
    fx.cleanup();
  }
});

test("nearest wins: ancestors are marked overridden by the nearest file", () => {
  const fx = mktree({
    "AGENTS.md": "root\n",
    "src/AGENTS.md": "src\n",
    "src/parser/AGENTS.md": "parser\n",
    "src/parser/lex.ts": "",
  });
  try {
    const layers = agentsLayers(explain(fx.root, "src/parser/lex.ts"));
    assert.deepEqual(
      layers.map((l) => [l.file, l.overriddenBy ?? null]),
      [
        ["AGENTS.md", "src/parser/AGENTS.md"],
        ["src/AGENTS.md", "src/parser/AGENTS.md"],
        ["src/parser/AGENTS.md", null],
      ],
    );
  } finally {
    fx.cleanup();
  }
});

test("an AGENTS.md in a sibling subtree is not part of the chain", () => {
  const fx = mktree({
    "lib/AGENTS.md": "lib\n",
    "src/a.ts": "",
  });
  try {
    assert.deepEqual(agentsLayers(explain(fx.root, "src/a.ts")), []);
  } finally {
    fx.cleanup();
  }
});

test("nearest file in the target's own directory wins; numbering runs shallow to deep", () => {
  const fx = mktree({
    "AGENTS.md": "root\n",
    "src/AGENTS.md": "src\n",
    "src/a.ts": "",
  });
  try {
    const layers = agentsLayers(explain(fx.root, "src/a.ts"));
    assert.equal(layers[1].file, "src/AGENTS.md");
    assert.match(layers[1].detail, /takes precedence/);
    assert.deepEqual(
      layers.map((l) => l.precedence),
      [1, 2],
    );
  } finally {
    fx.cleanup();
  }
});
