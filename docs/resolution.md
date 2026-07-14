# Resolution semantics

This document pins down exactly how ruletrace decides which rule files apply
to a target path, per tool. When an upstream tool changes its loading rules,
the matching resolver in `src/tools/` and this table change together.

The target path does not have to exist — resolution is purely by path, so
"what would a new file here get?" is a supported question. A trailing slash
(`src/parser/`) marks the target as a directory, in which case rule files in
the directory itself count as well.

## Claude Code (`--tool claude`)

| Aspect | Behavior |
| --- | --- |
| Files | `CLAUDE.md` and `CLAUDE.local.md` in every ancestor directory of the target, root included |
| Order | Shallow → deep; deeper files are more specific and read later |
| Imports | `@path` tokens, resolved relative to the importing file |
| Import limits | 5 hops maximum (deeper nodes reported as `depth-exceeded`); cycles detected and cut |
| Not imports | Tokens inside fenced code blocks or inline code spans; mid-word `@` (emails) |
| Heuristic | The path must contain `/` or `.` — `@alice` is prose, `@README.md` is an import |
| `@~/…` | Personal home imports; opaque by default, resolved when `--home <dir>` is given |
| Escapes | Absolute or `../` imports leaving the root are flagged `outside-root`, never read |

ruletrace deliberately resolves only project-level memory. User-level memory
(`~/.claude/CLAUDE.md`) lives outside the repository and is out of scope for
a repo-relative trace; the `--home` flag exists purely so `@~/` imports can be
verified in controlled environments such as tests.

## Cursor (`--tool cursor`)

| Frontmatter | Attachment mode | Applied to the target? |
| --- | --- | --- |
| `alwaysApply: true` | always | yes, unconditionally |
| `globs:` matching | auto | yes, when a glob matches |
| `globs:` not matching | — | not listed as a layer (visible in `tree`) |
| only `description:` | agent-requested | listed, marked `~` — the model decides |
| none of the above | manual | listed, only attaches when @-mentioned |

Nested `.cursor/rules` directories scope to the subtree of the directory that
contains the `.cursor` folder, and their globs match against paths **relative
to that scope**. Root rules sort before nested rules. `globs:` accepts a YAML
list or a comma-separated string. The legacy root `.cursorrules` file applies
to everything and is reported as deprecated by `check`.

## GitHub Copilot (`--tool copilot`)

| File | Attachment |
| --- | --- |
| `.github/copilot-instructions.md` | always — every request in the repository |
| `.github/instructions/*.instructions.md` with `applyTo:` | auto, when an applyTo glob matches (root-relative) |
| `.github/instructions/*.instructions.md` without `applyTo:` | manual — never attached automatically |

`applyTo` accepts a single glob, a comma-separated string, or a YAML list.
Instruction files outside `.github/instructions/` are ignored, matching
editor behavior.

## AGENTS.md (`--tool agents`)

Every `AGENTS.md` in an ancestor directory of the target is part of the
chain, shallow → deep. The nearest file takes precedence on conflicts, and
ruletrace marks every farther file with `overriddenBy` pointing at it —
some agents read only the nearest file, so this is the difference between
"listed" and "actually read" in practice. ruletrace does not expand `@`
imports here: the agents.md convention does not define them.

## Glob dialect (shared by cursor globs and copilot applyTo)

| Syntax | Meaning |
| --- | --- |
| `*` | any run of characters except `/` |
| `?` | one character except `/` |
| `**` | any run including `/`; `src/**/*.ts` also matches `src/main.ts` |
| `[abc]`, `[!abc]` | character class / negated class |
| `{a,b}` | alternation, nesting allowed |
| no `/` in pattern | matches the basename anywhere (`*.ts` style) |

Matching is case-sensitive; leading `./` and `/` are stripped. An empty
pattern matches nothing.

## Determinism and limits

Directory entries are walked in sorted order, `.git`, `.hg`, `.svn` and
`node_modules` are skipped, and the walk caps at 50,000 files (dead-glob
checks are suppressed past the cap rather than reporting half-truths).
Identical trees produce byte-identical reports on every platform.
