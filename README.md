# ruletrace

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node >=22.13](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen) [![Version 0.1.0](https://img.shields.io/badge/version-0.1.0-blue)](CHANGELOG.md) ![Tests](https://img.shields.io/badge/tests-92%20passed-brightgreen) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

**ruletrace：an open-source, read-only resolver and debugger for AI coding-agent rule files — prints the exact instruction stack any path gets: nested CLAUDE.md, @-imports, Cursor globs, Copilot applyTo.**

![Demo](docs/assets/demo.svg)

```bash
git clone https://github.com/JaydenCJ/ruletrace.git && cd ruletrace && npm install && npm run build
node dist/cli.js --help   # or: npm link && ruletrace --help
```

> Pre-release: v0.1.0 is not yet published to npm; install from source as above. Zero runtime dependencies — `typescript` is the only devDependency.

## Why ruletrace?

Agent rule files have quietly become a config language with no debugger. A single repository can carry a root `CLAUDE.md`, nested ones per subdirectory, `@`-imports fanning out five hops deep, a personal `CLAUDE.local.md`, Cursor `.mdc` rules in four different attachment modes with scoped globs, Copilot `applyTo` instructions, and an `AGENTS.md` chain where only the nearest file wins — and the question "what does the agent actually see when it edits *this* file?" has no answer short of simulating each tool's loader in your head. Existing tooling attacks the opposite problem: generators like rulesync and Ruler *write* rule files from a master copy, which helps you author them but tells you nothing about how they resolve — and nothing at all when the files were written by hand, by three teammates, and by last year's conventions. ruletrace is the missing read path: one command that resolves nesting, imports, scopes and globs exactly the way each tool does, shows *why* every layer attached, and never writes a byte.

| | ruletrace | rulesync | Ruler | grep + eyeballs |
| --- | --- | --- | --- | --- |
| Direction | read-only: explain what resolves | generate/convert rule files | generate from master copy | read, slowly |
| Per-path answer ("what applies to src/a.ts?") | yes — one command, per tool | no | no | manual tree-walking |
| `@`-import expansion with cycles/depth/missing | yes, full tree with line numbers | no | no | by hand |
| Cursor attachment modes (always/auto/agent/manual) | classified per rule, globs evaluated | writes .mdc files | writes .mdc files | read the frontmatter yourself |
| Broken-reference linting (`check`, exit 1) | yes — imports, dead globs, frontmatter | drift between outputs | drift between outputs | none |
| Exact assembled context (`--content`) | yes, with provenance banners | no | no | cat, in the right order, hopefully |
| Runtime dependencies | none (Node stdlib) | npm dependency tree | npm dependency tree | none |

<sub>Comparison reflects upstream documentation as of 2026-07. rulesync and Ruler solve authoring — keeping many rule formats in sync from one source; ruletrace solves inspection, and works on repositories those tools never touched.</sub>

## Features

- **Four ecosystems, one trace** — Claude Code (`CLAUDE.md`, `CLAUDE.local.md`), Cursor (`.cursor/rules/*.mdc`, legacy `.cursorrules`), GitHub Copilot (`copilot-instructions.md`, `*.instructions.md`) and `AGENTS.md`, each resolved with its own tool's semantics, side by side.
- **Real import resolution** — `@path` imports expand recursively with the documented rules: code blocks and inline spans skipped, five-hop limit, cycles cut and labelled, `@~/` home imports kept opaque unless you opt in with `--home`.
- **Why, not just what** — every layer states its reason: `ancestor directory src/`, `glob src/**/*.ts matched`, `nearest AGENTS.md — takes precedence`, `model decides from description`.
- **The assembled context, verbatim** — `--content` prints the exact concatenated instruction text a path receives, imports inlined depth-first, a provenance banner over every piece.
- **A linter for rule rot** — `ruletrace check` finds missing and cyclic imports, dead globs, malformed frontmatter and deprecated formats, exits 1 on errors (`--strict` for warnings), and `--json` feeds it to scripts.
- **What-if mode** — the target path does not have to exist yet: ask what a planned file *would* get before you create it.
- **Read-only, offline, zero dependencies** — ruletrace only ever reads files; no network, no telemetry, no packages at runtime, byte-identical output for identical trees.

## Quickstart

Ask what a deeply nested file actually gets (run `bash examples/setup-demo.sh` once to generate the gitignored Copilot fixture, then run inside [`examples/demo-project`](examples/demo-project)):

```bash
ruletrace src/parser/lexer.ts
```

Real captured output:

```text
ruletrace 0.1.0 — effective instruction stack
root:   /work/demo-project
target: src/parser/lexer.ts

claude-code — 3 layers (read shallow to deep; deeper files are more specific and read later)
  1. CLAUDE.md        nesting          project root memory
       -> @docs/style.md  [ok]  docs/style.md (line 6)
          -> @naming.md  [ok]  docs/naming.md (line 3)
       -> @docs/release.md  [ok]  docs/release.md (line 7)
  2. CLAUDE.local.md  local            personal memory at project root (not shared)
  3. src/CLAUDE.md    nesting          ancestor directory src/

cursor — 2 layers (always + matching-glob rules are injected; agent-requested rules depend on the model)
  1. .cursor/rules/base.mdc        always           alwaysApply: true
  2. .cursor/rules/typescript.mdc  auto             glob src/**/*.ts matched
  ~  .cursor/rules/reviews.mdc     agent-requested  model decides from description

copilot — 2 layers (repository instructions first, then every matching .instructions.md)
  1. .github/copilot-instructions.md              always           applies to every request in this repository
  2. .github/instructions/parser.instructions.md  auto             applyTo src/parser/**/*.ts matched

agents.md — 2 layers (nearest file wins on conflicts; some agents read only the nearest one)
  1. AGENTS.md             nesting          ancestor AGENTS.md — overridden where they conflict
  2. src/parser/AGENTS.md  nesting          nearest AGENTS.md — takes precedence
```

Then lint the whole repository for rule rot — a broken import fails the run (real output after deleting `docs/naming.md`):

```text
note    local-memory            CLAUDE.local.md: CLAUDE.local.md is personal memory; collaborators do not see it
error   import-missing          docs/style.md:3: @naming.md does not resolve to a file
1 error, 0 warnings, 1 note
```

`ruletrace tree` lists every rule file with its kind, and `--content` prints the assembled text each tool injects. All three commands take `--json`.

## Commands and options

| Command / flag | Default | Effect |
| --- | --- | --- |
| `ruletrace <path>` | — | explain: which rule files apply to `<path>`, per tool, and why |
| `ruletrace tree` | — | inventory of every rule file discovered under the root |
| `ruletrace check` | — | diagnostics; exit 1 on errors, `--strict` promotes warnings |
| `--root <dir>` | nearest `.git` ancestor, else cwd | project root the resolution runs against |
| `--tool <list>` | `all` | restrict to `claude`, `cursor`, `copilot`, `agents` (CSV, repeatable) |
| `--json` | off | machine-readable output, `schema_version: 1` |
| `--content` | off | explain only: assembled instruction text with provenance banners |
| `--home <dir>` | unset | resolve `@~/` imports against `<dir>` instead of leaving them opaque |

Exit codes: `0` ok, `1` check found problems, `2` usage or I/O error. The full per-tool semantics — attachment modes, scoping, the glob dialect, determinism guarantees — are specified in [docs/resolution.md](docs/resolution.md).

## Architecture

```mermaid
flowchart LR
    CLI[cli<br/>argv, exit codes] --> DISC[discover<br/>one-pass walk]
    DISC --> FM[frontmatter<br/>mdc + applyTo]
    DISC --> T[tools/*<br/>claude · cursor · copilot · agents]
    T --> IMP[imports<br/>@-tree, cycles, depth]
    T --> GLOB[glob<br/>*, **, braces, classes]
    T --> TRACE[resolve<br/>Trace + content view]
    TRACE --> REP[report<br/>text · json]
    DISC --> CHK[check<br/>diagnostics]
    CHK --> REP
```

`explain`, `tree` and `check` all consume the same single-pass inventory; the resolvers and matchers are pure functions, so the filesystem is touched exactly once per invocation.

## Roadmap

- [x] v0.1.0 — explain/tree/check across Claude Code, Cursor, Copilot and AGENTS.md; recursive `@`-import trees; attachment-mode classification; `--content` assembly; `--json`; zero dependencies; 92 tests + smoke script
- [ ] More ecosystems: Windsurf `.windsurf/rules`, Cline `.clinerules`, Codex config
- [ ] `--why <rule-file>` — invert the question: which paths does this rule reach?
- [ ] Diff mode: how the stack changes between two git revisions
- [ ] Overlap report: pairs of layers that likely contradict each other
- [ ] Watch mode for editing sessions

See the [open issues](https://github.com/JaydenCJ/ruletrace/issues) for the full list.

## Contributing

Bug reports, resolver corrections and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow (`npm test` plus `scripts/smoke.sh` printing `SMOKE OK`; this repository intentionally ships no CI). Good entry points are labelled [good first issue](https://github.com/JaydenCJ/ruletrace/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), and design questions live in [Discussions](https://github.com/JaydenCJ/ruletrace/discussions).

## License

[MIT](LICENSE)
