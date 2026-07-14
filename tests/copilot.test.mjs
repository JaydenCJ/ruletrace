/**
 * Copilot resolution tests: the always-on repository instructions file,
 * applyTo glob matching for scoped instruction files, and the manual
 * status of files that lack applyTo.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { explain } from "../dist/index.js";
import { mktree } from "./helpers.mjs";

function copilotLayers(trace) {
  return trace.tools.find((t) => t.tool === "copilot").layers;
}

test("copilot-instructions.md applies to every path", () => {
  const fx = mktree({ ".github/copilot-instructions.md": "repo-wide\n", "deep/a.py": "" });
  try {
    const layers = copilotLayers(explain(fx.root, "deep/a.py"));
    assert.deepEqual(
      layers.map((l) => [l.file, l.attachment]),
      [[".github/copilot-instructions.md", "always"]],
    );
  } finally {
    fx.cleanup();
  }
});

test("instructions files attach when an applyTo glob matches, CSV multi-globs included", () => {
  const fx = mktree({
    ".github/instructions/tests.instructions.md": '---\napplyTo: "tests/**"\n---\nbody\n',
    ".github/instructions/web.instructions.md": '---\napplyTo: "**/*.tsx, **/*.jsx"\n---\nbody\n',
    "tests/a.test.ts": "",
    "ui/app.tsx": "",
    "src/a.py": "",
  });
  try {
    const hit = copilotLayers(explain(fx.root, "tests/a.test.ts"));
    assert.equal(hit.length, 1);
    assert.equal(hit[0].attachment, "auto");
    assert.match(hit[0].detail, /tests\/\*\* matched/);
    const csvHit = copilotLayers(explain(fx.root, "ui/app.tsx"));
    assert.equal(csvHit.length, 1);
    assert.match(csvHit[0].detail, /\*\*\/\*\.tsx matched/);
    assert.deepEqual(copilotLayers(explain(fx.root, "src/a.py")), []);
  } finally {
    fx.cleanup();
  }
});

test("instructions without applyTo are listed as manual, never applied", () => {
  const fx = mktree({
    ".github/instructions/adhoc.instructions.md": "no frontmatter\n",
    "a.ts": "",
  });
  try {
    const layers = copilotLayers(explain(fx.root, "a.ts"));
    assert.equal(layers[0].attachment, "manual");
    assert.equal(layers[0].applied, false);
  } finally {
    fx.cleanup();
  }
});

test("main instructions precede matching scoped instructions", () => {
  const fx = mktree({
    ".github/copilot-instructions.md": "repo\n",
    ".github/instructions/src.instructions.md": '---\napplyTo: "src/**"\n---\nbody\n',
    "src/a.ts": "",
  });
  try {
    const layers = copilotLayers(explain(fx.root, "src/a.ts"));
    assert.deepEqual(
      layers.map((l) => [l.file, l.precedence]),
      [
        [".github/copilot-instructions.md", 1],
        [".github/instructions/src.instructions.md", 2],
      ],
    );
  } finally {
    fx.cleanup();
  }
});

test("an instructions-style file outside .github/instructions is ignored", () => {
  const fx = mktree({
    "docs/notes.instructions.md": '---\napplyTo: "**"\n---\nbody\n',
    "a.ts": "",
  });
  try {
    assert.deepEqual(copilotLayers(explain(fx.root, "a.ts")), []);
  } finally {
    fx.cleanup();
  }
});
