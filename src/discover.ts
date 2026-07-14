/**
 * Repository walker: finds every rule file under the root in one pass and
 * pre-parses the ones that carry frontmatter. The inventory is the shared
 * input for `explain`, `tree` and `check`, so the filesystem is only
 * touched once per invocation.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalizeStringList, parseFrontmatter } from "./frontmatter.js";
import type { CopilotInstruction, CursorRule, Inventory } from "./types.js";

/** Directories that never contain project rule files worth tracing. */
const SKIP_DIRS = new Set([".git", ".hg", ".svn", "node_modules"]);

/** Hard cap on walked files so pathological trees stay fast. */
export const MAX_WALK_FILES = 50_000;

function parseCursorRule(root: string, rel: string): CursorRule {
  const text = readFileSync(join(root, rel), "utf8");
  const fm = parseFrontmatter(text);
  const scopeEnd = rel.indexOf("/.cursor/rules/");
  const scope = scopeEnd === -1 ? "" : rel.slice(0, scopeEnd);
  const globs = normalizeStringList(fm.data["globs"]);
  const description =
    typeof fm.data["description"] === "string" && (fm.data["description"] as string).trim() !== ""
      ? (fm.data["description"] as string)
      : null;
  return {
    file: rel,
    scope,
    description,
    globs,
    alwaysApply: fm.data["alwaysApply"] === true,
    hasFrontmatter: fm.present,
    frontmatterErrors: fm.errors,
    bodyEmpty: fm.body.trim() === "",
  };
}

function parseCopilotInstruction(root: string, rel: string): CopilotInstruction {
  const text = readFileSync(join(root, rel), "utf8");
  const fm = parseFrontmatter(text);
  return {
    file: rel,
    applyTo: normalizeStringList(fm.data["applyTo"]),
    hasFrontmatter: fm.present,
    frontmatterErrors: fm.errors,
  };
}

/** Walk `root` once and classify every rule file ruletrace understands. */
export function buildInventory(root: string): Inventory {
  const inv: Inventory = {
    root,
    claudeFiles: [],
    agentsFiles: [],
    cursorRules: [],
    cursorLegacy: null,
    copilotMain: null,
    copilotInstructions: [],
    allFiles: [],
    truncated: false,
  };
  const stack: string[] = [""];
  while (stack.length > 0) {
    const dirRel = stack.pop() as string;
    const dirAbs = dirRel === "" ? root : join(root, dirRel);
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      continue; // unreadable directory: skip rather than abort the trace
    }
    // Sort for deterministic output on every filesystem.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const rel = dirRel === "" ? entry.name : `${dirRel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(rel);
        continue;
      }
      if (entry.isSymbolicLink()) {
        // Only follow file symlinks; a dangling one is simply skipped.
        const st = statSync(join(root, rel), { throwIfNoEntry: false });
        if (st === undefined || !st.isFile()) continue;
      } else if (!entry.isFile()) {
        continue;
      }
      if (inv.allFiles.length >= MAX_WALK_FILES) {
        inv.truncated = true;
        continue;
      }
      inv.allFiles.push(rel);
      classify(inv, rel);
    }
  }
  inv.allFiles.sort();
  inv.claudeFiles.sort();
  inv.agentsFiles.sort();
  inv.cursorRules.sort((a, b) => (a.file < b.file ? -1 : 1));
  inv.copilotInstructions.sort((a, b) => (a.file < b.file ? -1 : 1));
  return inv;
}

function classify(inv: Inventory, rel: string): void {
  const base = rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;
  if (base === "CLAUDE.md" || base === "CLAUDE.local.md") {
    inv.claudeFiles.push(rel);
    return;
  }
  if (base === "AGENTS.md") {
    inv.agentsFiles.push(rel);
    return;
  }
  if (rel === ".cursorrules") {
    inv.cursorLegacy = rel;
    return;
  }
  if (rel.endsWith(".mdc") && (rel.startsWith(".cursor/rules/") || rel.includes("/.cursor/rules/"))) {
    inv.cursorRules.push(parseCursorRule(inv.root, rel));
    return;
  }
  if (rel === ".github/copilot-instructions.md") {
    inv.copilotMain = rel;
    return;
  }
  if (rel.startsWith(".github/instructions/") && rel.endsWith(".instructions.md")) {
    inv.copilotInstructions.push(parseCopilotInstruction(inv.root, rel));
  }
}
