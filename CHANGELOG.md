# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-13

### Added

- `ruletrace <path>` explain command printing the effective instruction stack
  a path gets across four rule ecosystems: Claude Code (nested `CLAUDE.md` +
  `CLAUDE.local.md`), Cursor (`.cursor/rules/*.mdc` + legacy `.cursorrules`),
  GitHub Copilot (`copilot-instructions.md` + `*.instructions.md` with
  `applyTo`), and `AGENTS.md` (nearest-wins chains).
- Recursive `@path` import resolution for Claude memory files with the
  documented semantics: code blocks and inline code spans skipped, five-hop
  depth limit, cycle detection, `@~/` home imports (resolvable via `--home`),
  and outside-root escapes flagged.
- Cursor attachment-mode classification (always / auto / agent-requested /
  manual) from `.mdc` frontmatter, nested `.cursor/rules` scoping with
  scope-relative glob matching, and a dependency-free glob engine
  (`*`, `**`, `?`, `[...]`, `{a,b}`, basename patterns).
- `--content` view assembling the exact concatenated instruction text with a
  provenance banner over every layer and every inlined import.
- `--json` output (`schema_version: 1`) for explain, `tree` and `check`;
  `--tool` filtering with aliases.
- `ruletrace tree` inventory of every rule file discovered, labelled by kind.
- `ruletrace check` diagnostics: missing/cyclic/too-deep/escaping imports,
  malformed or missing frontmatter, dead globs, deprecated `.cursorrules`,
  unshared `CLAUDE.local.md` — with `--strict` promoting warnings to failures.
- Deterministic walking (sorted entries, `.git`/`node_modules` skipped,
  50k-file cap) and a read-only guarantee: ruletrace never writes.
- 92 deterministic offline tests (unit + spawned-CLI integration against
  fabricated repositories) and `scripts/smoke.sh`.

[0.1.0]: https://github.com/JaydenCJ/ruletrace/releases/tag/v0.1.0
