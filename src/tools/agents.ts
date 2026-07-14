/**
 * AGENTS.md layer resolution. The agents.md convention is nearest-wins:
 * every AGENTS.md in an ancestor directory is discovered, but the one
 * closest to the target takes precedence, and many agents read only that
 * one. ruletrace lists the whole chain and marks who overrides whom, which
 * is exactly the part that is hard to see by eyeballing a tree.
 */

import type { Inventory, RuleLayer, ToolTrace } from "../types.js";
import { ancestorDirs } from "./shared.js";

export function traceAgents(inv: Inventory, targetRel: string): ToolTrace {
  const present = new Set(inv.agentsFiles);
  const chain: string[] = [];
  for (const dir of ancestorDirs(targetRel)) {
    const rel = dir === "" ? "AGENTS.md" : `${dir}/AGENTS.md`;
    if (present.has(rel)) chain.push(rel);
  }
  const nearest = chain.length > 0 ? (chain[chain.length - 1] as string) : null;
  const layers: RuleLayer[] = chain.map((rel, i) => {
    const isNearest = rel === nearest;
    const layer: RuleLayer = {
      tool: "agents",
      file: rel,
      attachment: "nesting",
      detail: isNearest
        ? "nearest AGENTS.md — takes precedence"
        : "ancestor AGENTS.md — overridden where they conflict",
      applied: true,
      precedence: i + 1,
    };
    if (!isNearest && nearest !== null) layer.overriddenBy = nearest;
    return layer;
  });
  return {
    tool: "agents",
    layers,
    note: "nearest file wins on conflicts; some agents read only the nearest one",
  };
}
