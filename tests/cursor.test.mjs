/**
 * Cursor rule resolution tests: the four attachment modes, nested
 * .cursor/rules scoping, scope-relative glob matching, and the legacy
 * .cursorrules file.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { explain } from "../dist/index.js";
import { mktree } from "./helpers.mjs";

function cursorLayers(trace) {
  return trace.tools.find((t) => t.tool === "cursor").layers;
}

const ALWAYS = "---\ndescription: base\nalwaysApply: true\n---\nbody\n";

test("alwaysApply rules attach to every path", () => {
  const fx = mktree({ ".cursor/rules/base.mdc": ALWAYS, "any/where/file.py": "" });
  try {
    const layers = cursorLayers(explain(fx.root, "any/where/file.py"));
    assert.deepEqual(
      layers.map((l) => [l.file, l.attachment, l.applied]),
      [[".cursor/rules/base.mdc", "always", true]],
    );
  } finally {
    fx.cleanup();
  }
});

test("glob rules attach only when a glob matches; CSV glob strings work", () => {
  const rule = "---\nglobs: src/**/*.ts\nalwaysApply: false\n---\nbody\n";
  const csv = "---\nglobs: '*.md, *.markdown'\n---\nbody\n";
  const fx = mktree({
    ".cursor/rules/ts.mdc": rule,
    ".cursor/rules/docs.mdc": csv,
    "src/a.ts": "",
    "notes.markdown": "",
  });
  try {
    const hit = cursorLayers(explain(fx.root, "src/a.ts"));
    assert.equal(hit.length, 1);
    assert.equal(hit[0].attachment, "auto");
    assert.match(hit[0].detail, /src\/\*\*\/\*\.ts matched/);
    const csvHit = cursorLayers(explain(fx.root, "notes.markdown"));
    assert.equal(csvHit.length, 1);
    assert.match(csvHit[0].detail, /\*\.markdown matched/);
    // Neither rule's globs match a path outside both patterns.
    assert.deepEqual(cursorLayers(explain(fx.root, "src/a.css")), []);
  } finally {
    fx.cleanup();
  }
});

test("description-only rules are listed as agent-requested, not applied", () => {
  const rule = "---\ndescription: reviews\n---\nbody\n";
  const fx = mktree({ ".cursor/rules/reviews.mdc": rule, "a.ts": "" });
  try {
    const layers = cursorLayers(explain(fx.root, "a.ts"));
    assert.equal(layers[0].attachment, "agent-requested");
    assert.equal(layers[0].applied, false);
    assert.equal(layers[0].precedence, 0);
  } finally {
    fx.cleanup();
  }
});

test("rules with no frontmatter signal are manual", () => {
  const fx = mktree({ ".cursor/rules/scratch.mdc": "just text\n", "a.ts": "" });
  try {
    const layers = cursorLayers(explain(fx.root, "a.ts"));
    assert.equal(layers[0].attachment, "manual");
    assert.equal(layers[0].applied, false);
  } finally {
    fx.cleanup();
  }
});

test("nested .cursor/rules only scope their own subtree", () => {
  const fx = mktree({
    "packages/web/.cursor/rules/web.mdc": ALWAYS,
    "packages/web/src/a.ts": "",
    "packages/api/src/b.ts": "",
  });
  try {
    const inScope = cursorLayers(explain(fx.root, "packages/web/src/a.ts"));
    assert.deepEqual(
      inScope.map((l) => l.file),
      ["packages/web/.cursor/rules/web.mdc"],
    );
    const outOfScope = cursorLayers(explain(fx.root, "packages/api/src/b.ts"));
    assert.deepEqual(outOfScope, []);
  } finally {
    fx.cleanup();
  }
});

test("nested rule globs match relative to their scope", () => {
  const rule = "---\nglobs: src/**/*.ts\n---\nbody\n";
  const fx = mktree({
    "packages/web/.cursor/rules/ts.mdc": rule,
    "packages/web/src/a.ts": "",
  });
  try {
    // Root-relative path is packages/web/src/a.ts; the glob matches the
    // scope-relative src/a.ts.
    const layers = cursorLayers(explain(fx.root, "packages/web/src/a.ts"));
    assert.equal(layers.length, 1);
    assert.equal(layers[0].attachment, "auto");
  } finally {
    fx.cleanup();
  }
});

test("root rules come before nested rules and precedence counts applied only", () => {
  const fx = mktree({
    ".cursor/rules/base.mdc": ALWAYS,
    ".cursor/rules/manual.mdc": "no frontmatter\n",
    "sub/.cursor/rules/deep.mdc": ALWAYS,
    "sub/a.ts": "",
  });
  try {
    const layers = cursorLayers(explain(fx.root, "sub/a.ts"));
    assert.deepEqual(
      layers.map((l) => [l.file, l.precedence]),
      [
        [".cursor/rules/base.mdc", 1],
        [".cursor/rules/manual.mdc", 0],
        ["sub/.cursor/rules/deep.mdc", 2],
      ],
    );
  } finally {
    fx.cleanup();
  }
});

test("a directory merely ending in .cursor is not a rules directory", () => {
  // `my.cursor/rules/` must not be mistaken for `<scope>/.cursor/rules/`.
  const fx = mktree({ "my.cursor/rules/fake.mdc": ALWAYS, "a.ts": "" });
  try {
    assert.deepEqual(cursorLayers(explain(fx.root, "a.ts")), []);
  } finally {
    fx.cleanup();
  }
});

test("legacy .cursorrules applies to everything and sorts first", () => {
  const fx = mktree({
    ".cursorrules": "old style\n",
    ".cursor/rules/base.mdc": ALWAYS,
    "a.ts": "",
  });
  try {
    const layers = cursorLayers(explain(fx.root, "a.ts"));
    assert.equal(layers[0].file, ".cursorrules");
    assert.equal(layers[0].applied, true);
    assert.match(layers[0].detail, /deprecated/);
    assert.equal(layers[1].file, ".cursor/rules/base.mdc");
  } finally {
    fx.cleanup();
  }
});

