/**
 * Cursor layer resolution. `.cursor/rules/*.mdc` files come in four
 * attachment modes derived from frontmatter: alwaysApply → always;
 * globs matching the target → auto; description-only → agent-requested
 * (the model decides at runtime); nothing → manual (@-mention only).
 * Nested `.cursor/rules` directories scope to their subtree, and their
 * globs match against paths relative to that scope. The legacy root
 * `.cursorrules` file, when present, applies unconditionally.
 */

import { firstMatch } from "../glob.js";
import type { Attachment, Inventory, RuleLayer, ToolTrace } from "../types.js";
import { relativeToScope, withinDir } from "./shared.js";

const MODE_ORDER: Readonly<Record<string, number>> = {
  always: 0,
  auto: 1,
  "agent-requested": 2,
  manual: 3,
};

export function traceCursor(inv: Inventory, targetRel: string): ToolTrace {
  const layers: RuleLayer[] = [];
  if (inv.cursorLegacy !== null) {
    layers.push({
      tool: "cursor",
      file: inv.cursorLegacy,
      attachment: "always",
      detail: "legacy .cursorrules (deprecated) — applies to everything",
      applied: true,
      precedence: 0,
    });
  }
  for (const rule of inv.cursorRules) {
    if (!withinDir(rule.scope, targetRel)) continue;
    const scoped = relativeToScope(rule.scope, targetRel);
    let attachment: Attachment;
    let detail: string;
    let applied: boolean;
    if (rule.alwaysApply) {
      attachment = "always";
      detail = "alwaysApply: true";
      applied = true;
    } else if (rule.globs.length > 0) {
      const matched = firstMatch(rule.globs, scoped);
      if (matched === null) continue; // auto rule whose globs miss: not a layer
      attachment = "auto";
      detail = `glob ${matched} matched`;
      applied = true;
    } else if (rule.description !== null) {
      attachment = "agent-requested";
      detail = "model decides from description";
      applied = false;
    } else {
      attachment = "manual";
      detail = "attaches only when @-mentioned";
      applied = false;
    }
    layers.push({ tool: "cursor", file: rule.file, attachment, detail, applied, precedence: 0 });
  }
  // Root scope before nested scopes, then always → auto → agent → manual,
  // then filename: a stable, explainable order.
  layers.sort((a, b) => {
    const depthA = a.file.split("/").length;
    const depthB = b.file.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    const modeA = MODE_ORDER[a.attachment] ?? 4;
    const modeB = MODE_ORDER[b.attachment] ?? 4;
    if (modeA !== modeB) return modeA - modeB;
    return a.file < b.file ? -1 : 1;
  });
  let precedence = 0;
  for (const layer of layers) {
    layer.precedence = layer.applied ? ++precedence : 0;
  }
  return {
    tool: "cursor",
    layers,
    note: "always + matching-glob rules are injected; agent-requested rules depend on the model",
  };
}
