/**
 * Test helpers: build throwaway fixture repositories from a plain object
 * mapping relative paths to file contents. Everything lives under a
 * mkdtemp directory and is removed again by the returned cleanup hook,
 * so tests are hermetic, offline and order-independent.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { realpathSync } from "node:fs";

/** Create a fixture tree; returns { root, cleanup }. */
export function mktree(files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ruletrace-test-")));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Shorthand for a fixture whose files do not matter beyond existing. */
export function touch(...paths) {
  return Object.fromEntries(paths.map((p) => [p, ""]));
}
