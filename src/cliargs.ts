/**
 * Argument parsing for the ruletrace CLI. Kept as a pure function from
 * argv to a structured command so it can be unit-tested without spawning
 * a process. Throws UsageError with a helpful message on bad input.
 */

import { ALL_TOOLS, type ToolId } from "./types.js";

export class UsageError extends Error {}

export type Command =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "explain"; target: string; opts: CliOptions }
  | { kind: "tree"; opts: CliOptions }
  | { kind: "check"; opts: CliOptions };

export interface CliOptions {
  root: string | null;
  tools: ToolId[] | null;
  json: boolean;
  content: boolean;
  strict: boolean;
  home: string | null;
}

const TOOL_ALIASES: Readonly<Record<string, ToolId>> = {
  claude: "claude",
  "claude-code": "claude",
  cursor: "cursor",
  copilot: "copilot",
  agents: "agents",
  "agents-md": "agents",
};

function parseTools(value: string): ToolId[] {
  const tools: ToolId[] = [];
  for (const raw of value.split(",")) {
    const name = raw.trim().toLowerCase();
    if (name === "") continue;
    if (name === "all") return [...ALL_TOOLS];
    const tool = TOOL_ALIASES[name];
    if (tool === undefined) {
      throw new UsageError(
        `unknown tool "${raw.trim()}" (expected: claude, cursor, copilot, agents, all)`,
      );
    }
    if (!tools.includes(tool)) tools.push(tool);
  }
  if (tools.length === 0) throw new UsageError("--tool requires at least one tool name");
  return tools;
}

/** Parse everything after `node cli.js`. */
export function parseArgs(argv: readonly string[]): Command {
  const opts: CliOptions = {
    root: null,
    tools: null,
    json: false,
    content: false,
    strict: false,
    home: null,
  };
  const positional: string[] = [];
  let i = 0;
  const takeValue = (flag: string): string => {
    const value = argv[i + 1];
    if (value === undefined) throw new UsageError(`${flag} requires a value`);
    i += 1;
    return value;
  };
  for (; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "-h":
      case "--help":
        return { kind: "help" };
      case "-V":
      case "--version":
        return { kind: "version" };
      case "--root":
        opts.root = takeValue("--root");
        break;
      case "--tool": {
        const parsed = parseTools(takeValue("--tool"));
        opts.tools = opts.tools === null ? parsed : [...opts.tools, ...parsed.filter((t) => !(opts.tools as ToolId[]).includes(t))];
        break;
      }
      case "--json":
        opts.json = true;
        break;
      case "--content":
        opts.content = true;
        break;
      case "--strict":
        opts.strict = true;
        break;
      case "--home":
        opts.home = takeValue("--home");
        break;
      default:
        if (arg.startsWith("-") && arg !== "-") {
          throw new UsageError(`unknown option ${arg}`);
        }
        positional.push(arg);
    }
  }
  const [first, extra] = positional;
  if (extra !== undefined) {
    throw new UsageError(`unexpected extra argument ${extra}`);
  }
  if (first === "tree" || first === "check") {
    if (opts.content) throw new UsageError("--content only applies to explaining a path");
    if (opts.strict && first === "tree") {
      throw new UsageError("--strict only applies to `ruletrace check`");
    }
    return first === "tree" ? { kind: "tree", opts } : { kind: "check", opts };
  }
  if (first === undefined) {
    throw new UsageError("missing target path (or a `tree` / `check` subcommand)");
  }
  if (opts.strict) throw new UsageError("--strict only applies to `ruletrace check`");
  return { kind: "explain", target: first, opts };
}

export const USAGE = `ruletrace — print the effective instruction stack any path gets

Usage:
  ruletrace <path> [options]     explain: which rule files apply to <path>, and why
  ruletrace tree [options]       list every rule file discovered under the root
  ruletrace check [options]      diagnose broken imports, cycles, dead globs, bad frontmatter

Options:
  --root <dir>    project root (default: nearest ancestor with .git, else cwd)
  --tool <list>   comma-separated: claude, cursor, copilot, agents, all (default: all)
  --json          machine-readable output (schema_version: 1)
  --content       explain only: print the assembled instruction text with provenance
  --strict        check only: treat warnings as failures
  --home <dir>    resolve @~/ imports against <dir> instead of leaving them opaque
  -V, --version   print version
  -h, --help      show this help

Exit codes: 0 ok · 1 check found problems · 2 usage or I/O error
`;
