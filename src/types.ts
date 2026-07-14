/**
 * Shared types for ruletrace. Everything downstream (resolvers, reporters,
 * the public API) speaks in these shapes; keeping them in one place is what
 * makes `--json` output a stable, documentable schema.
 */

/** Tools whose rule formats ruletrace understands. */
export type ToolId = "claude" | "cursor" | "copilot" | "agents";

export const ALL_TOOLS: readonly ToolId[] = ["claude", "cursor", "copilot", "agents"];

/** Human-facing display names, used by the text reporter. */
export const TOOL_LABELS: Readonly<Record<ToolId, string>> = {
  claude: "claude-code",
  cursor: "cursor",
  copilot: "copilot",
  agents: "agents.md",
};

/** Outcome of resolving one `@path` import edge. */
export type ImportStatus =
  | "ok" // target exists inside the root and was expanded
  | "missing" // target does not exist
  | "cycle" // target is already on the current import stack
  | "depth-exceeded" // more than MAX_IMPORT_DEPTH hops from the memory file
  | "outside-root" // absolute path escaping the project root
  | "home"; // @~/… import; personal, not part of the repository

/** One node of a resolved import tree. */
export interface ImportNode {
  /** Raw spec as written, without the leading `@`. */
  spec: string;
  /** 1-based line number of the `@spec` token in the importing file. */
  line: number;
  /** Root-relative path when resolvable, otherwise null. */
  resolved: string | null;
  status: ImportStatus;
  /** Imports found inside the imported file (empty unless status is "ok"). */
  children: ImportNode[];
}

/** Why a layer is (or is not) part of the stack. */
export type Attachment =
  | "nesting" // rule file in an ancestor directory of the target
  | "local" // CLAUDE.local.md personal memory
  | "always" // unconditional (alwaysApply, copilot-instructions, .cursorrules)
  | "auto" // attached because a glob matched the target path
  | "agent-requested" // description-only Cursor rule; the model decides
  | "manual"; // only attaches when explicitly mentioned

/** One instruction file in the effective stack of a target path. */
export interface RuleLayer {
  tool: ToolId;
  /** Root-relative path of the rule file. */
  file: string;
  attachment: Attachment;
  /** Human-readable reason, e.g. `glob src/**\/*.ts matched`. */
  detail: string;
  /**
   * True when the file's content is injected for this target without further
   * conditions. Agent-requested and manual layers are listed but not applied.
   */
  applied: boolean;
  /** 1-based reading order among this tool's applied layers; 0 if not applied. */
  precedence: number;
  /** Resolved `@path` import tree (Claude memory files only). */
  imports?: ImportNode[];
  /** Set on agents.md layers that a nearer file takes precedence over. */
  overriddenBy?: string;
}

/** All layers one tool contributes for the target, plus a semantics note. */
export interface ToolTrace {
  tool: ToolId;
  layers: RuleLayer[];
  /** One-line reminder of the tool's precedence semantics. */
  note: string;
}

/** The full answer to "what does this path get?". */
export interface Trace {
  /** Absolute project root the resolution ran against. */
  root: string;
  /** Root-relative target path (may not exist yet; resolution is by path). */
  target: string;
  tools: ToolTrace[];
}

/** A problem found by `ruletrace check` (or surfaced inline by explain). */
export interface Diagnostic {
  severity: "error" | "warning" | "note";
  tool: ToolId;
  /** Root-relative file the problem lives in. */
  file: string;
  /** 1-based line, when the problem is anchored to one. */
  line?: number;
  /** Stable machine-readable code, e.g. "import-missing". */
  code: string;
  message: string;
}

/** A parsed `.cursor/rules/*.mdc` file. */
export interface CursorRule {
  file: string;
  /** Root-relative directory the owning `.cursor` sits in ("" = root). */
  scope: string;
  description: string | null;
  globs: string[];
  alwaysApply: boolean;
  hasFrontmatter: boolean;
  frontmatterErrors: string[];
  bodyEmpty: boolean;
}

/** A parsed `.github/instructions/*.instructions.md` file. */
export interface CopilotInstruction {
  file: string;
  /** Normalized applyTo globs; empty when the key is absent. */
  applyTo: string[];
  hasFrontmatter: boolean;
  frontmatterErrors: string[];
}

/** Every rule file discovered under the root, pre-parsed once. */
export interface Inventory {
  root: string;
  /** Root-relative CLAUDE.md / CLAUDE.local.md paths, sorted. */
  claudeFiles: string[];
  /** Root-relative AGENTS.md paths, sorted. */
  agentsFiles: string[];
  cursorRules: CursorRule[];
  /** Root-relative `.cursorrules` path when the legacy file exists. */
  cursorLegacy: string | null;
  /** Root-relative `.github/copilot-instructions.md` when present. */
  copilotMain: string | null;
  copilotInstructions: CopilotInstruction[];
  /** Every regular file under the root (bounded), for dead-glob checking. */
  allFiles: string[];
  /** True when the walk stopped early because MAX_WALK_FILES was hit. */
  truncated: boolean;
}

/** Options accepted by the resolver entry points. */
export interface ResolveOptions {
  /** Directory `@~/…` imports resolve against; unset leaves them opaque. */
  home?: string;
  /** Restrict resolution to these tools (default: all). */
  tools?: readonly ToolId[];
}
