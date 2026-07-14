/**
 * `ruletrace check` diagnostics tests. Each rule family gets a fixture
 * that provokes exactly one finding; the "clean repo" case pins the
 * absence of false positives.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { hasBlocking, runCheck } from "../dist/index.js";
import { mktree } from "./helpers.mjs";

function codes(diagnostics) {
  return diagnostics.map((d) => d.code);
}

test("a healthy repository produces no diagnostics", () => {
  const fx = mktree({
    "CLAUDE.md": "see @docs/style.md\n",
    "docs/style.md": "style\n",
    ".cursor/rules/ts.mdc": "---\nglobs: src/**/*.ts\n---\nbody\n",
    ".github/copilot-instructions.md": "repo\n",
    "src/a.ts": "",
    "AGENTS.md": "notes\n",
  });
  try {
    assert.deepEqual(runCheck(fx.root), []);
  } finally {
    fx.cleanup();
  }
});

test("missing imports blame the file that contains the @token", () => {
  const fx = mktree({
    "CLAUDE.md": "intro\n@docs/missing.md\nalso @docs/style.md\n",
    "docs/style.md": "fine\nnested @gone.md\n",
  });
  try {
    const diagnostics = runCheck(fx.root);
    assert.deepEqual(
      diagnostics.map((d) => [d.code, d.file, d.line]),
      [
        ["import-missing", "CLAUDE.md", 2],
        // The nested break is attributed to docs/style.md, not CLAUDE.md.
        ["import-missing", "docs/style.md", 2],
      ],
    );
    assert.equal(diagnostics.every((d) => d.severity === "error"), true);
  } finally {
    fx.cleanup();
  }
});

test("import cycles are reported as errors", () => {
  const fx = mktree({
    "CLAUDE.md": "@a.md\n",
    "a.md": "@CLAUDE.md\n",
  });
  try {
    const found = codes(runCheck(fx.root));
    assert.ok(found.includes("import-cycle"));
  } finally {
    fx.cleanup();
  }
});

test("dead cursor globs and empty bodies are warnings", () => {
  const fx = mktree({
    ".cursor/rules/dead.mdc": "---\nglobs: nothing/**/*.xyz\n---\n",
    "src/a.ts": "",
  });
  try {
    const diagnostics = runCheck(fx.root);
    assert.deepEqual(codes(diagnostics).sort(), ["glob-dead", "mdc-empty"]);
    assert.equal(diagnostics.every((d) => d.severity === "warning"), true);
  } finally {
    fx.cleanup();
  }
});

test("alwaysApply plus globs earns a note that the globs are ignored", () => {
  const fx = mktree({
    ".cursor/rules/both.mdc": "---\nalwaysApply: true\nglobs: src/**\n---\nbody\n",
    "src/a.ts": "",
  });
  try {
    assert.deepEqual(codes(runCheck(fx.root)), ["mdc-globs-ignored"]);
  } finally {
    fx.cleanup();
  }
});

test("copilot instructions without applyTo warn; dead applyTo warns", () => {
  const fx = mktree({
    ".github/instructions/adhoc.instructions.md": "no frontmatter\n",
    ".github/instructions/dead.instructions.md": '---\napplyTo: "gone/**"\n---\nbody\n',
    "src/a.ts": "",
  });
  try {
    const byFile = Object.fromEntries(runCheck(fx.root).map((d) => [d.file, d.code]));
    assert.equal(byFile[".github/instructions/adhoc.instructions.md"], "applyto-missing");
    assert.equal(byFile[".github/instructions/dead.instructions.md"], "glob-dead");
  } finally {
    fx.cleanup();
  }
});

test("legacy .cursorrules and CLAUDE.local.md are flagged", () => {
  const fx = mktree({
    ".cursorrules": "old\n",
    "CLAUDE.local.md": "personal\n",
  });
  try {
    const diagnostics = runCheck(fx.root);
    const byCode = Object.fromEntries(diagnostics.map((d) => [d.code, d.severity]));
    assert.equal(byCode["cursorrules-deprecated"], "warning");
    assert.equal(byCode["local-memory"], "note");
  } finally {
    fx.cleanup();
  }
});

test("hasBlocking: errors always block, warnings only under --strict", () => {
  const warning = [{ severity: "warning", tool: "cursor", file: "x", code: "c", message: "m" }];
  const error = [{ severity: "error", tool: "claude", file: "x", code: "c", message: "m" }];
  const note = [{ severity: "note", tool: "claude", file: "x", code: "c", message: "m" }];
  assert.equal(hasBlocking(error, false), true);
  assert.equal(hasBlocking(warning, false), false);
  assert.equal(hasBlocking(warning, true), true);
  assert.equal(hasBlocking(note, true), false);
});

test("broken .mdc frontmatter errors; diagnostics sort by file, then line", () => {
  const fx = mktree({
    "CLAUDE.md": "@zz-missing.md\n@aa-missing.md\n",
    ".cursor/rules/broken.mdc": "---\nbad line\n---\nbody\n",
  });
  try {
    const diagnostics = runCheck(fx.root);
    const keys = diagnostics.map((d) => `${d.file}:${d.line ?? 0}`);
    assert.deepEqual(keys, [...keys].sort());
    const broken = diagnostics.find((d) => d.file === ".cursor/rules/broken.mdc");
    assert.equal(broken.code, "mdc-frontmatter");
    assert.equal(broken.severity, "error");
    // Both imports on their own lines, in line order.
    const claude = diagnostics.filter((d) => d.file === "CLAUDE.md");
    assert.deepEqual(
      claude.map((d) => d.line),
      [1, 2],
    );
  } finally {
    fx.cleanup();
  }
});
