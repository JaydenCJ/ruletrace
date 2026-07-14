/**
 * Claude Code memory-file `@path` import scanning and recursive resolution.
 *
 * The scanner follows the documented evaluation rules: an import is an
 * `@path` token at a word boundary, imports are not evaluated inside fenced
 * code blocks or inline code spans, and expansion stops after
 * MAX_IMPORT_DEPTH hops. On top of that, ruletrace applies one anti-noise
 * heuristic: the path must contain a `/` or a `.`, so prose like
 * "thanks @alice" is never treated as an import (documented in
 * docs/resolution.md).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ImportNode } from "./types.js";

/** Claude Code stops expanding imports after this many hops. */
export const MAX_IMPORT_DEPTH = 5;

export interface FoundImport {
  /** Spec without the leading `@`. */
  spec: string;
  /** 1-based line number. */
  line: number;
}

const FENCE_RE = /^(`{3,}|~{3,})/;
/** `@` at start-of-line or after whitespace/punctuation-open, then a path. */
const IMPORT_RE = /(^|[\s(])@([A-Za-z0-9_~./\\-][^\s]*)/g;
const TRAILING_PUNCTUATION = /[,;:!?)"'\]]+$/;

function stripInlineCode(line: string): string {
  // Replace `code spans` with spaces of equal length so column math and
  // word boundaries survive but their content can never look like an import.
  return line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
}

function cleanSpec(raw: string): string {
  let spec = raw.replace(TRAILING_PUNCTUATION, "");
  // A sentence-ending dot: `see @docs/style.md.` — strip exactly one.
  if (spec.endsWith(".") && !spec.endsWith("..")) spec = spec.slice(0, -1);
  return spec;
}

/** Find `@path` import tokens in markdown, skipping code blocks and spans. */
export function scanImports(markdown: string): FoundImport[] {
  const found: FoundImport[] = [];
  let fence: string | null = null;
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const fenceMatch = FENCE_RE.exec(line.trimStart());
    if (fenceMatch) {
      const marker = fenceMatch[1] as string;
      if (fence === null) fence = marker[0] as string;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const haystack = stripInlineCode(line);
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(haystack)) !== null) {
      const spec = cleanSpec(m[2] as string);
      // Heuristic: real imports look like paths, mentions do not.
      if (spec === "" || (!spec.includes("/") && !spec.includes("."))) continue;
      found.push({ spec, line: i + 1 });
    }
  }
  return found;
}

export interface ImportContext {
  /** Absolute project root; imports may not escape it. */
  root: string;
  /** Optional home directory `@~/…` resolves against. */
  home?: string;
}

function isReadableFile(absPath: string): boolean {
  const st = statSync(absPath, { throwIfNoEntry: false });
  return st !== undefined && st.isFile();
}

function resolveOne(
  found: FoundImport,
  importerAbs: string,
  ctx: ImportContext,
  stack: readonly string[],
  depth: number,
): ImportNode {
  const node: ImportNode = {
    spec: found.spec,
    line: found.line,
    resolved: null,
    status: "missing",
    children: [],
  };
  let absTarget: string;
  if (found.spec.startsWith("~/") || found.spec === "~") {
    if (ctx.home === undefined) {
      node.status = "home";
      return node;
    }
    absTarget = resolve(join(ctx.home, found.spec === "~" ? "." : found.spec.slice(2)));
  } else if (isAbsolute(found.spec)) {
    absTarget = resolve(found.spec);
  } else {
    absTarget = resolve(join(dirname(importerAbs), found.spec));
  }
  const rel = relative(ctx.root, absTarget);
  const insideRoot = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  if (!insideRoot && !found.spec.startsWith("~/")) {
    node.status = "outside-root";
    node.resolved = null;
    return node;
  }
  if (!isReadableFile(absTarget)) {
    node.status = "missing";
    node.resolved = insideRoot ? rel.split("\\").join("/") : null;
    return node;
  }
  // Home imports that resolve outside the root keep the absolute path so
  // callers (e.g. --content) can still read the file.
  node.resolved = insideRoot ? rel.split("\\").join("/") : absTarget;
  if (stack.includes(absTarget)) {
    node.status = "cycle";
    return node;
  }
  if (depth > MAX_IMPORT_DEPTH) {
    node.status = "depth-exceeded";
    return node;
  }
  node.status = "ok";
  const content = readFileSync(absTarget, "utf8");
  node.children = resolveChildren(content, absTarget, ctx, [...stack, absTarget], depth + 1);
  return node;
}

function resolveChildren(
  markdown: string,
  importerAbs: string,
  ctx: ImportContext,
  stack: readonly string[],
  depth: number,
): ImportNode[] {
  return scanImports(markdown).map((found) => resolveOne(found, importerAbs, ctx, stack, depth));
}

/**
 * Resolve the full import tree of a memory file. `fileAbs` must exist; the
 * returned nodes cover every `@` token found, resolvable or not.
 */
export function resolveImports(fileAbs: string, ctx: ImportContext): ImportNode[] {
  if (!existsSync(fileAbs)) return [];
  const content = readFileSync(fileAbs, "utf8");
  return resolveChildren(content, fileAbs, ctx, [resolve(fileAbs)], 1);
}

/** Depth-first flatten of an import tree, tagging each node's depth. */
export function flattenImports(nodes: readonly ImportNode[]): Array<{ node: ImportNode; depth: number }> {
  const out: Array<{ node: ImportNode; depth: number }> = [];
  const visit = (list: readonly ImportNode[], depth: number): void => {
    for (const node of list) {
      out.push({ node, depth });
      visit(node.children, depth + 1);
    }
  };
  visit(nodes, 1);
  return out;
}
