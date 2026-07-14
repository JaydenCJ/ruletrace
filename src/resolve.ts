/**
 * Orchestration: turn (root, target, options) into a Trace, and assemble
 * the `--content` view — the concatenated instruction text a target path
 * actually receives, with a provenance header above every piece.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { buildInventory } from "./discover.js";
import type { ImportNode, Inventory, ResolveOptions, ToolId, Trace, ToolTrace } from "./types.js";
import { ALL_TOOLS, TOOL_LABELS } from "./types.js";
import { traceAgents } from "./tools/agents.js";
import { traceClaude } from "./tools/claude.js";
import { traceCopilot } from "./tools/copilot.js";
import { traceCursor } from "./tools/cursor.js";

/**
 * Normalize a user-supplied target into a root-relative `/`-separated path.
 * Relative targets resolve against `cwd` when `cwd` is inside the root
 * (the everyday case), and against the root itself otherwise (so
 * `ruletrace --root ../repo src/a.ts` reads naturally). Throws when the
 * target escapes the root. The target does not have to exist: "what would
 * a file here get?" is a legitimate question.
 */
export function normalizeTarget(root: string, target: string, cwd: string): string {
  const cwdRel = relative(root, resolve(cwd));
  const cwdInsideRoot = !cwdRel.startsWith("..") && !isAbsolute(cwdRel);
  const base = cwdInsideRoot ? resolve(cwd) : root;
  const abs = isAbsolute(target) ? resolve(target) : resolve(join(base, target));
  const rel = relative(root, abs).split("\\").join("/");
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`target ${target} is outside the root ${root}`);
  }
  // Preserve an explicit trailing slash: it marks the target as a directory.
  return target.endsWith("/") && rel !== "" ? rel + "/" : rel;
}

function traceTool(tool: ToolId, inv: Inventory, targetRel: string, opts: ResolveOptions): ToolTrace {
  switch (tool) {
    case "claude":
      return traceClaude(inv, targetRel, opts);
    case "cursor":
      return traceCursor(inv, targetRel);
    case "copilot":
      return traceCopilot(inv, targetRel);
    case "agents":
      return traceAgents(inv, targetRel);
  }
}

/** Resolve the effective instruction stack for one target path. */
export function explain(root: string, targetRel: string, opts: ResolveOptions = {}): Trace {
  const inv = buildInventory(root);
  return explainWithInventory(inv, targetRel, opts);
}

/** Same as `explain`, reusing an already-built inventory. */
export function explainWithInventory(
  inv: Inventory,
  targetRel: string,
  opts: ResolveOptions = {},
): Trace {
  const tools = opts.tools ?? ALL_TOOLS;
  return {
    root: inv.root,
    target: targetRel,
    tools: tools.map((tool) => traceTool(tool, inv, targetRel, opts)),
  };
}

/** One provenance-labelled slice of the assembled content view. */
export interface ContentPiece {
  /** Root-relative file (or the raw spec for unresolvable imports). */
  file: string;
  /** e.g. "claude-code · nesting: project root memory". */
  provenance: string;
  /** File text; a placeholder line for unresolvable imports. */
  text: string;
}

function importPieces(
  root: string,
  nodes: readonly ImportNode[],
  viaFile: string,
): ContentPiece[] {
  const out: ContentPiece[] = [];
  for (const node of nodes) {
    if (node.status === "ok" && node.resolved !== null) {
      const abs = isAbsolute(node.resolved) ? node.resolved : join(root, node.resolved);
      out.push({
        file: node.resolved,
        provenance: `imported via @${node.spec} from ${viaFile}:${node.line}`,
        text: readFileSync(abs, "utf8"),
      });
      out.push(...importPieces(root, node.children, node.resolved));
    } else {
      out.push({
        file: node.resolved ?? node.spec,
        provenance: `import @${node.spec} from ${viaFile}:${node.line}`,
        text: `[unresolved import: ${node.status}]\n`,
      });
    }
  }
  return out;
}

/**
 * The `--content` view: every applied layer's text in reading order, with
 * Claude imports inlined depth-first right after their importer.
 */
export function assembleContent(trace: Trace): ContentPiece[] {
  const pieces: ContentPiece[] = [];
  for (const toolTrace of trace.tools) {
    for (const layer of toolTrace.layers) {
      if (!layer.applied) continue;
      pieces.push({
        file: layer.file,
        provenance: `${TOOL_LABELS[layer.tool]} · ${layer.attachment}: ${layer.detail}`,
        text: readFileSync(join(trace.root, layer.file), "utf8"),
      });
      if (layer.imports !== undefined && layer.imports.length > 0) {
        pieces.push(...importPieces(trace.root, layer.imports, layer.file));
      }
    }
  }
  return pieces;
}
