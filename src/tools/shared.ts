/** Helpers shared by the per-tool resolvers. */

/**
 * Ancestor directories of a root-relative path, shallow to deep, starting
 * with "" (the root itself). For `src/parser/lex.ts` this yields
 * `["", "src", "src/parser"]`. A trailing slash marks the input as a
 * directory, in which case the directory itself is included.
 */
export function ancestorDirs(targetRel: string): string[] {
  const isDir = targetRel.endsWith("/");
  const clean = targetRel.replace(/\/+$/, "");
  const segments = clean === "" ? [] : clean.split("/");
  const upto = isDir ? segments.length : segments.length - 1;
  const dirs = [""];
  for (let i = 1; i <= upto; i++) {
    dirs.push(segments.slice(0, i).join("/"));
  }
  return dirs;
}

/** Is `path` equal to `dir` or inside it? `dir === ""` means the root. */
export function withinDir(dir: string, path: string): boolean {
  if (dir === "") return true;
  return path === dir || path.startsWith(dir + "/");
}

/** Path of `rel` relative to `scope` ("" scope returns `rel` unchanged). */
export function relativeToScope(scope: string, rel: string): string {
  if (scope === "") return rel;
  return rel.slice(scope.length + 1);
}
