/**
 * Minimal YAML-frontmatter reader for the tiny dialect rule files actually
 * use: scalar `key: value` pairs, `[a, b]` inline lists, `- item` block
 * lists, booleans, and quoted strings. Anything richer is recorded as an
 * error instead of being silently misread — `ruletrace check` surfaces it.
 */

export interface Frontmatter {
  /** True when the file opens with a `---` fence. */
  present: boolean;
  data: Record<string, unknown>;
  /** File content after the closing fence (whole file when absent). */
  body: string;
  errors: string[];
  /** 1-based line number of the closing `---` (0 when absent). */
  endLine: number;
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~" || v === "") return null;
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function parseInlineList(raw: string): unknown[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((part) => parseScalar(part));
}

/** Parse the leading frontmatter block of `text`, tolerating imperfection. */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n");
  if ((lines[0] ?? "").trim() !== "---") {
    return { present: false, data: {}, body: text, errors: [], endLine: 0 };
  }
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  let pendingListKey: string | null = null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string;
    const trimmed = line.trim();
    if (trimmed === "---" || trimmed === "...") {
      end = i;
      break;
    }
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("- ") || trimmed === "-") {
      if (pendingListKey === null) {
        errors.push(`line ${i + 1}: list item without a preceding key`);
        continue;
      }
      (data[pendingListKey] as unknown[]).push(parseScalar(trimmed.replace(/^-\s?/, "")));
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      errors.push(`line ${i + 1}: expected "key: value", got ${JSON.stringify(trimmed)}`);
      pendingListKey = null;
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();
    if (rawValue === "") {
      // Either an empty value or the start of a block list.
      data[key] = [];
      pendingListKey = key;
      continue;
    }
    pendingListKey = null;
    if (rawValue.startsWith("[")) {
      if (!rawValue.endsWith("]")) {
        errors.push(`line ${i + 1}: unterminated inline list for "${key}"`);
        data[key] = rawValue;
      } else {
        data[key] = parseInlineList(rawValue);
      }
      continue;
    }
    data[key] = parseScalar(rawValue);
  }
  if (end === -1) {
    return {
      present: true,
      data,
      body: "",
      errors: [...errors, "frontmatter opened with --- but never closed"],
      endLine: 0,
    };
  }
  // Keys whose value stayed [] from an empty scalar are fine as empty lists.
  return {
    present: true,
    data,
    body: lines.slice(end + 1).join("\n"),
    errors,
    endLine: end + 1,
  };
}

/**
 * Normalize a frontmatter value that editors accept as either a single
 * comma-separated string or a YAML list into a clean string array.
 */
export function normalizeStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const parts: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === "string") {
      for (const piece of v.split(",")) {
        const trimmed = piece.trim();
        if (trimmed !== "") parts.push(trimmed);
      }
    } else if (typeof v === "boolean" || typeof v === "number") {
      parts.push(String(v));
    }
  };
  if (Array.isArray(value)) for (const v of value) push(v);
  else push(value);
  return parts;
}
