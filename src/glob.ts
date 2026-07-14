/**
 * A small, dependency-free glob matcher covering the subset that Cursor
 * `globs:` and Copilot `applyTo:` values use in the wild:
 *
 *   `*`      any run of characters except `/`
 *   `?`      any single character except `/`
 *   `**`     any run of characters including `/` (whole segments)
 *   `[abc]`  character class, `[!abc]` / `[^abc]` negated
 *   `{a,b}`  alternation (nesting supported)
 *
 * A pattern with no `/` matches against the basename (Cursor's `*.ts`
 * convention); a pattern containing `/` matches against the full
 * scope-relative path. Matching is case-sensitive and paths always use `/`.
 */

const REGEX_SPECIALS = new Set([".", "+", "^", "$", "(", ")", "|", "\\"]);

/** Expand `{a,b{c,d}}` alternations into plain patterns. */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  const cuts: number[] = [];
  for (let i = open; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    } else if (ch === "," && depth === 1) {
      cuts.push(i);
    }
  }
  // Unbalanced brace: treat the `{` literally rather than failing the match.
  if (close === -1) return [pattern.slice(0, open) + "\\" + pattern.slice(open)];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const bounds = [open, ...cuts, close];
  const out: string[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const branch = pattern.slice((bounds[i] as number) + 1, bounds[i + 1]);
    for (const expanded of expandBraces(head + branch + tail)) out.push(expanded);
  }
  return out;
}

/** Translate one brace-free glob into an anchored RegExp source string. */
function translate(pattern: string): string {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] as string;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` may match zero segments; bare/trailing `**` matches anything.
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]+/)*";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      out += "[^/]";
      i += 1;
    } else if (ch === "[") {
      const end = pattern.indexOf("]", i + 2);
      if (end === -1) {
        out += "\\[";
        i += 1;
      } else {
        let body = pattern.slice(i + 1, end);
        if (body.startsWith("!") || body.startsWith("^")) body = "^" + body.slice(1);
        out += "[" + body.replace(/\\/g, "\\\\") + "]";
        i = end + 1;
      }
    } else if (ch === "\\" && i + 1 < pattern.length) {
      out += "\\" + pattern[i + 1];
      i += 2;
    } else {
      out += REGEX_SPECIALS.has(ch) ? "\\" + ch : ch;
      i += 1;
    }
  }
  return out;
}

const compiled = new Map<string, RegExp>();

/** Compile a glob (with braces) to a cached anchored RegExp. */
export function compileGlob(pattern: string): RegExp {
  const hit = compiled.get(pattern);
  if (hit) return hit;
  const sources = expandBraces(pattern).map(translate);
  const re = new RegExp("^(?:" + sources.join("|") + ")$");
  compiled.set(pattern, re);
  return re;
}

/** Normalize a pattern the way editors accept them: strip `./` and a leading `/`. */
function normalizePattern(pattern: string): string {
  let p = pattern.trim();
  if (p.startsWith("./")) p = p.slice(2);
  else if (p.startsWith("/")) p = p.slice(1);
  return p;
}

/**
 * Does `relPath` (always `/`-separated, no leading `./`) match `pattern`?
 * Basename matching kicks in only for patterns without a `/`.
 */
export function globMatches(pattern: string, relPath: string): boolean {
  const p = normalizePattern(pattern);
  if (p === "") return false;
  const re = compileGlob(p);
  if (!p.includes("/")) {
    const base = relPath.includes("/") ? relPath.slice(relPath.lastIndexOf("/") + 1) : relPath;
    return re.test(base);
  }
  return re.test(relPath);
}

/** First pattern in `patterns` that matches, or null. */
export function firstMatch(patterns: readonly string[], relPath: string): string | null {
  for (const pattern of patterns) {
    if (globMatches(pattern, relPath)) return pattern;
  }
  return null;
}
