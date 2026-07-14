/**
 * ruletrace public API. Everything the CLI does is available as a library:
 * build an inventory, explain a path, assemble the content view, run checks.
 */

export { buildInventory, MAX_WALK_FILES } from "./discover.js";
export {
  assembleContent,
  explain,
  explainWithInventory,
  normalizeTarget,
  type ContentPiece,
} from "./resolve.js";
export { hasBlocking, runCheck } from "./check.js";
export {
  flattenImports,
  MAX_IMPORT_DEPTH,
  resolveImports,
  scanImports,
  type FoundImport,
  type ImportContext,
} from "./imports.js";
export { compileGlob, expandBraces, firstMatch, globMatches } from "./glob.js";
export { normalizeStringList, parseFrontmatter, type Frontmatter } from "./frontmatter.js";
export {
  renderCheck,
  renderCheckJson,
  renderContent,
  renderExplainJson,
  renderExplainText,
  renderTree,
  renderTreeJson,
} from "./report.js";
export { parseArgs, USAGE, UsageError, type CliOptions, type Command } from "./cliargs.js";
export { ancestorDirs, relativeToScope, withinDir } from "./tools/shared.js";
export { VERSION } from "./version.js";
export type {
  Attachment,
  CopilotInstruction,
  CursorRule,
  Diagnostic,
  ImportNode,
  ImportStatus,
  Inventory,
  ResolveOptions,
  RuleLayer,
  ToolId,
  ToolTrace,
  Trace,
} from "./types.js";
export { ALL_TOOLS, TOOL_LABELS } from "./types.js";
