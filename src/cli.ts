#!/usr/bin/env node
/**
 * ruletrace CLI entry point. Thin: parse argv, find the root, call the
 * library, print, set the exit code. All interesting logic lives in pure
 * modules so it stays unit-testable.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { hasBlocking, runCheck } from "./check.js";
import { parseArgs, USAGE, UsageError, type CliOptions } from "./cliargs.js";
import { buildInventory } from "./discover.js";
import { assembleContent, explainWithInventory, normalizeTarget } from "./resolve.js";
import {
  renderCheck,
  renderCheckJson,
  renderContent,
  renderExplainJson,
  renderExplainText,
  renderTree,
  renderTreeJson,
} from "./report.js";
import { VERSION } from "./version.js";

/** Nearest ancestor of `start` containing `.git`; falls back to `start`. */
export function findRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

function resolveRoot(opts: CliOptions, cwd: string): string {
  const root = opts.root !== null ? resolve(cwd, opts.root) : findRoot(cwd);
  if (!existsSync(root)) {
    throw new UsageError(`root ${root} does not exist`);
  }
  return realpathSync(root);
}

export function main(argv: readonly string[], cwd: string): number {
  let command;
  try {
    command = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`ruletrace: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (command.kind === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (command.kind === "version") {
    process.stdout.write(`ruletrace ${VERSION}\n`);
    return 0;
  }
  try {
    const root = resolveRoot(command.opts, cwd);
    const resolveOpts = {
      home: command.opts.home ?? undefined,
      tools: command.opts.tools ?? undefined,
    };
    if (command.kind === "tree") {
      const inv = buildInventory(root);
      process.stdout.write(command.opts.json ? renderTreeJson(inv) + "\n" : renderTree(inv, VERSION));
      return 0;
    }
    if (command.kind === "check") {
      const diagnostics = runCheck(root, resolveOpts);
      process.stdout.write(
        command.opts.json ? renderCheckJson(diagnostics) + "\n" : renderCheck(diagnostics, VERSION),
      );
      return hasBlocking(diagnostics, command.opts.strict) ? 1 : 0;
    }
    const targetRel = normalizeTarget(root, command.target, cwd);
    const inv = buildInventory(root);
    const trace = explainWithInventory(inv, targetRel, resolveOpts);
    if (command.opts.content) {
      process.stdout.write(renderContent(assembleContent(trace)));
      return 0;
    }
    process.stdout.write(
      command.opts.json ? renderExplainJson(trace) + "\n" : renderExplainText(trace, VERSION),
    );
    return 0;
  } catch (err) {
    process.stderr.write(`ruletrace: ${(err as Error).message}\n`);
    return 2;
  }
}

process.exit(main(process.argv.slice(2), process.cwd()));
