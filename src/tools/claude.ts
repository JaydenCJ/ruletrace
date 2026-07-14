/**
 * Claude Code layer resolution: every CLAUDE.md in an ancestor directory of
 * the target is read, shallow to deep, and CLAUDE.local.md personal memory
 * rides alongside its sibling. `@path` imports are resolved recursively so
 * the trace shows the whole expansion, not just the entry file.
 */

import { join } from "node:path";
import { resolveImports } from "../imports.js";
import type { Inventory, ResolveOptions, RuleLayer, ToolTrace } from "../types.js";
import { ancestorDirs } from "./shared.js";

export function traceClaude(inv: Inventory, targetRel: string, opts: ResolveOptions): ToolTrace {
  const layers: RuleLayer[] = [];
  const present = new Set(inv.claudeFiles);
  let precedence = 0;
  for (const dir of ancestorDirs(targetRel)) {
    for (const base of ["CLAUDE.md", "CLAUDE.local.md"] as const) {
      const rel = dir === "" ? base : `${dir}/${base}`;
      if (!present.has(rel)) continue;
      precedence += 1;
      layers.push({
        tool: "claude",
        file: rel,
        attachment: base === "CLAUDE.local.md" ? "local" : "nesting",
        detail:
          base === "CLAUDE.local.md"
            ? dir === ""
              ? "personal memory at project root (not shared)"
              : `personal memory in ${dir}/ (not shared)`
            : dir === ""
              ? "project root memory"
              : `ancestor directory ${dir}/`,
        applied: true,
        precedence,
        imports: resolveImports(join(inv.root, rel), { root: inv.root, home: opts.home }),
      });
    }
  }
  return {
    tool: "claude",
    layers,
    note: "read shallow to deep; deeper files are more specific and read later",
  };
}
