/**
 * Rendering: plain-text reports designed to be read in a terminal and
 * diffed in a test, plus stable JSON (`schema_version: 1`) for scripts.
 * No ANSI colors — output is identical everywhere, pipes included.
 */

import type { Diagnostic, ImportNode, Inventory, RuleLayer, Trace } from "./types.js";
import { TOOL_LABELS } from "./types.js";
import type { ContentPiece } from "./resolve.js";

const IMPORT_STATUS_LABEL: Readonly<Record<ImportNode["status"], string>> = {
  ok: "ok",
  missing: "MISSING",
  cycle: "CYCLE",
  "depth-exceeded": "depth>5, not expanded",
  "outside-root": "OUTSIDE ROOT",
  home: "~ personal, unresolved",
};

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function renderImports(nodes: readonly ImportNode[], indent: string, out: string[]): void {
  for (const node of nodes) {
    const label = IMPORT_STATUS_LABEL[node.status];
    const target = node.resolved ?? node.spec;
    out.push(`${indent}-> @${node.spec}  [${label}]  ${target} (line ${node.line})`);
    renderImports(node.children, indent + "   ", out);
  }
}

function layerMark(layer: RuleLayer): string {
  if (layer.applied) return `${layer.precedence}.`;
  return layer.attachment === "agent-requested" ? "~" : "-";
}

/** The default human-readable explain report. */
export function renderExplainText(trace: Trace, version: string): string {
  const out: string[] = [];
  out.push(`ruletrace ${version} — effective instruction stack`);
  out.push(`root:   ${trace.root}`);
  out.push(`target: ${trace.target === "" ? "." : trace.target}`);
  for (const toolTrace of trace.tools) {
    const applied = toolTrace.layers.filter((l) => l.applied).length;
    out.push("");
    if (toolTrace.layers.length === 0) {
      out.push(`${TOOL_LABELS[toolTrace.tool]} — no rule files apply`);
      continue;
    }
    const suffix = applied === 1 ? "1 layer" : `${applied} layers`;
    out.push(`${TOOL_LABELS[toolTrace.tool]} — ${suffix} (${toolTrace.note})`);
    const width = Math.max(...toolTrace.layers.map((l) => l.file.length)) + 2;
    for (const layer of toolTrace.layers) {
      const mark = pad(layerMark(layer), 3);
      out.push(`  ${mark}${pad(layer.file, width)}${pad(layer.attachment, 17)}${layer.detail}`);
      if (layer.imports !== undefined && layer.imports.length > 0) {
        renderImports(layer.imports, "       ", out);
      }
    }
  }
  return out.join("\n") + "\n";
}

/** Machine-readable explain report. Stable field order, schema_version 1. */
export function renderExplainJson(trace: Trace): string {
  return JSON.stringify(
    {
      schema_version: 1,
      root: trace.root,
      target: trace.target,
      tools: trace.tools.map((toolTrace) => ({
        tool: toolTrace.tool,
        note: toolTrace.note,
        layers: toolTrace.layers,
      })),
    },
    null,
    2,
  );
}

/** `ruletrace tree`: the inventory of every rule file discovered. */
export function renderTree(inv: Inventory, version: string): string {
  const out: string[] = [];
  out.push(`ruletrace ${version} — rule files under ${inv.root}`);
  out.push("");
  out.push(`claude-code (${inv.claudeFiles.length})`);
  for (const rel of inv.claudeFiles) {
    const kind = rel.endsWith("CLAUDE.local.md") ? "personal memory" : "memory";
    out.push(`  ${pad(rel, 44)}${kind}`);
  }
  const cursorCount = inv.cursorRules.length + (inv.cursorLegacy !== null ? 1 : 0);
  out.push(`cursor (${cursorCount})`);
  if (inv.cursorLegacy !== null) {
    out.push(`  ${pad(inv.cursorLegacy, 44)}legacy, deprecated`);
  }
  for (const rule of inv.cursorRules) {
    const kind = rule.alwaysApply
      ? "always"
      : rule.globs.length > 0
        ? `auto (${rule.globs.join(", ")})`
        : rule.description !== null
          ? "agent-requested"
          : "manual";
    out.push(`  ${pad(rule.file, 44)}${kind}`);
  }
  const copilotCount = inv.copilotInstructions.length + (inv.copilotMain !== null ? 1 : 0);
  out.push(`copilot (${copilotCount})`);
  if (inv.copilotMain !== null) {
    out.push(`  ${pad(inv.copilotMain, 44)}always`);
  }
  for (const instr of inv.copilotInstructions) {
    const kind = instr.applyTo.length > 0 ? `auto (${instr.applyTo.join(", ")})` : "manual";
    out.push(`  ${pad(instr.file, 44)}${kind}`);
  }
  out.push(`agents.md (${inv.agentsFiles.length})`);
  for (const rel of inv.agentsFiles) {
    out.push(`  ${pad(rel, 44)}nearest-wins`);
  }
  return out.join("\n") + "\n";
}

/** JSON form of the tree inventory. */
export function renderTreeJson(inv: Inventory): string {
  return JSON.stringify(
    {
      schema_version: 1,
      root: inv.root,
      claude: inv.claudeFiles,
      cursor: {
        legacy: inv.cursorLegacy,
        rules: inv.cursorRules.map((r) => ({
          file: r.file,
          scope: r.scope,
          alwaysApply: r.alwaysApply,
          globs: r.globs,
          description: r.description,
        })),
      },
      copilot: {
        main: inv.copilotMain,
        instructions: inv.copilotInstructions.map((i) => ({ file: i.file, applyTo: i.applyTo })),
      },
      agents: inv.agentsFiles,
    },
    null,
    2,
  );
}

/** `ruletrace check` text output. */
export function renderCheck(diagnostics: readonly Diagnostic[], version: string): string {
  const out: string[] = [];
  if (diagnostics.length === 0) {
    return `ruletrace ${version} — check: no problems found\n`;
  }
  for (const d of diagnostics) {
    const where = d.line !== undefined ? `${d.file}:${d.line}` : d.file;
    out.push(`${pad(d.severity, 8)}${pad(d.code, 24)}${where}: ${d.message}`);
  }
  const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const notes = diagnostics.filter((d) => d.severity === "note").length;
  out.push(`${count(errors, "error")}, ${count(warnings, "warning")}, ${count(notes, "note")}`);
  return out.join("\n") + "\n";
}

/** JSON form of check results. */
export function renderCheckJson(diagnostics: readonly Diagnostic[]): string {
  return JSON.stringify({ schema_version: 1, diagnostics }, null, 2);
}

/** `--content`: assembled instruction text with provenance banners. */
export function renderContent(pieces: readonly ContentPiece[]): string {
  const out: string[] = [];
  for (const piece of pieces) {
    out.push(`===== ${piece.file} (${piece.provenance}) =====`);
    out.push(piece.text.endsWith("\n") ? piece.text.slice(0, -1) : piece.text);
    out.push("");
  }
  return out.join("\n");
}
