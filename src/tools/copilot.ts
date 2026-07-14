/**
 * GitHub Copilot layer resolution. `.github/copilot-instructions.md`
 * applies to every request; `.github/instructions/*.instructions.md`
 * files attach when one of their `applyTo` globs matches the target path
 * (root-relative). A file without `applyTo` is listed as manual — VS Code
 * only injects it when the user attaches it by hand.
 */

import { firstMatch } from "../glob.js";
import type { Inventory, RuleLayer, ToolTrace } from "../types.js";

export function traceCopilot(inv: Inventory, targetRel: string): ToolTrace {
  const layers: RuleLayer[] = [];
  let precedence = 0;
  if (inv.copilotMain !== null) {
    layers.push({
      tool: "copilot",
      file: inv.copilotMain,
      attachment: "always",
      detail: "applies to every request in this repository",
      applied: true,
      precedence: ++precedence,
    });
  }
  for (const instr of inv.copilotInstructions) {
    if (instr.applyTo.length === 0) {
      layers.push({
        tool: "copilot",
        file: instr.file,
        attachment: "manual",
        detail: "no applyTo — attaches only when added by hand",
        applied: false,
        precedence: 0,
      });
      continue;
    }
    const matched = firstMatch(instr.applyTo, targetRel);
    if (matched === null) continue;
    layers.push({
      tool: "copilot",
      file: instr.file,
      attachment: "auto",
      detail: `applyTo ${matched} matched`,
      applied: true,
      precedence: ++precedence,
    });
  }
  return {
    tool: "copilot",
    layers,
    note: "repository instructions first, then every matching .instructions.md",
  };
}
