/**
 * `ruletrace check`: static diagnostics over every rule file in the
 * repository — broken and cyclic imports, malformed frontmatter, globs
 * that can never match, deprecated formats. Read-only, like everything
 * else here: it reports, it never rewrites.
 */

import { join } from "node:path";
import { buildInventory } from "./discover.js";
import { globMatches } from "./glob.js";
import { MAX_IMPORT_DEPTH, resolveImports } from "./imports.js";
import { relativeToScope, withinDir } from "./tools/shared.js";
import type { Diagnostic, ImportNode, Inventory, ResolveOptions } from "./types.js";

const SEVERITY_ORDER: Readonly<Record<Diagnostic["severity"], number>> = {
  error: 0,
  warning: 1,
  note: 2,
};

/** Walk an import tree yielding each node with the file that imports it. */
function* withImporter(
  nodes: readonly ImportNode[],
  importer: string,
): Generator<{ node: ImportNode; importer: string }> {
  for (const node of nodes) {
    yield { node, importer };
    // Diagnostics must blame the file containing the @token, so children
    // are attributed to the resolved path of their importer.
    yield* withImporter(node.children, node.resolved ?? importer);
  }
}

function checkClaudeImports(inv: Inventory, opts: ResolveOptions, out: Diagnostic[]): void {
  for (const rel of inv.claudeFiles) {
    const nodes = resolveImports(join(inv.root, rel), { root: inv.root, home: opts.home });
    for (const { node, importer } of withImporter(nodes, rel)) {
      const at = { tool: "claude" as const, file: importer, line: node.line };
      switch (node.status) {
        case "missing":
          out.push({
            ...at,
            severity: "error",
            code: "import-missing",
            message: `@${node.spec} does not resolve to a file`,
          });
          break;
        case "cycle":
          out.push({
            ...at,
            severity: "error",
            code: "import-cycle",
            message: `@${node.spec} re-imports ${node.resolved ?? node.spec}, forming a cycle`,
          });
          break;
        case "depth-exceeded":
          out.push({
            ...at,
            severity: "warning",
            code: "import-depth",
            message: `@${node.spec} is more than ${MAX_IMPORT_DEPTH} hops deep and will not be expanded`,
          });
          break;
        case "outside-root":
          out.push({
            ...at,
            severity: "warning",
            code: "import-outside-root",
            message: `@${node.spec} points outside the project root`,
          });
          break;
        case "home":
          out.push({
            ...at,
            severity: "note",
            code: "import-home",
            message: `@${node.spec} is a personal home import; not verifiable from the repository`,
          });
          break;
        case "ok":
          break;
      }
    }
    if (rel.endsWith("CLAUDE.local.md")) {
      out.push({
        severity: "note",
        tool: "claude",
        file: rel,
        code: "local-memory",
        message: "CLAUDE.local.md is personal memory; collaborators do not see it",
      });
    }
  }
}

function globIsDead(inv: Inventory, scope: string, glob: string): boolean {
  for (const file of inv.allFiles) {
    if (!withinDir(scope, file)) continue;
    if (globMatches(glob, relativeToScope(scope, file))) return false;
  }
  return true;
}

function checkCursor(inv: Inventory, out: Diagnostic[]): void {
  if (inv.cursorLegacy !== null) {
    out.push({
      severity: "warning",
      tool: "cursor",
      file: inv.cursorLegacy,
      code: "cursorrules-deprecated",
      message: "legacy .cursorrules file; Cursor recommends .cursor/rules/*.mdc",
    });
  }
  for (const rule of inv.cursorRules) {
    const at = { tool: "cursor" as const, file: rule.file };
    for (const err of rule.frontmatterErrors) {
      out.push({ ...at, severity: "error", code: "mdc-frontmatter", message: err });
    }
    if (!rule.hasFrontmatter) {
      out.push({
        ...at,
        severity: "warning",
        code: "mdc-no-frontmatter",
        message: "no frontmatter; the rule can only be attached manually",
      });
    }
    if (rule.bodyEmpty) {
      out.push({ ...at, severity: "warning", code: "mdc-empty", message: "rule body is empty" });
    }
    if (rule.alwaysApply && rule.globs.length > 0) {
      out.push({
        ...at,
        severity: "note",
        code: "mdc-globs-ignored",
        message: "alwaysApply: true makes the globs list irrelevant",
      });
    }
    if (!rule.alwaysApply && !inv.truncated) {
      for (const glob of rule.globs) {
        if (globIsDead(inv, rule.scope, glob)) {
          out.push({
            ...at,
            severity: "warning",
            code: "glob-dead",
            message: `glob ${glob} matches no file currently in the repository`,
          });
        }
      }
    }
  }
}

function checkCopilot(inv: Inventory, out: Diagnostic[]): void {
  for (const instr of inv.copilotInstructions) {
    const at = { tool: "copilot" as const, file: instr.file };
    for (const err of instr.frontmatterErrors) {
      out.push({ ...at, severity: "error", code: "instructions-frontmatter", message: err });
    }
    if (instr.applyTo.length === 0) {
      out.push({
        ...at,
        severity: "warning",
        code: "applyto-missing",
        message: "no applyTo frontmatter; the file is never attached automatically",
      });
      continue;
    }
    if (!inv.truncated) {
      for (const glob of instr.applyTo) {
        if (globIsDead(inv, "", glob)) {
          out.push({
            ...at,
            severity: "warning",
            code: "glob-dead",
            message: `applyTo ${glob} matches no file currently in the repository`,
          });
        }
      }
    }
  }
}

/** Run every diagnostic over the repository. Sorted, deterministic. */
export function runCheck(root: string, opts: ResolveOptions = {}): Diagnostic[] {
  const inv = buildInventory(root);
  const out: Diagnostic[] = [];
  checkClaudeImports(inv, opts, out);
  checkCursor(inv, out);
  checkCopilot(inv, out);
  out.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    const la = a.line ?? 0;
    const lb = b.line ?? 0;
    if (la !== lb) return la - lb;
    const sa = SEVERITY_ORDER[a.severity];
    const sb = SEVERITY_ORDER[b.severity];
    if (sa !== sb) return sa - sb;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  return out;
}

/** Does the diagnostic list warrant a non-zero exit? */
export function hasBlocking(diagnostics: readonly Diagnostic[], strict: boolean): boolean {
  return diagnostics.some(
    (d) => d.severity === "error" || (strict && d.severity === "warning"),
  );
}
