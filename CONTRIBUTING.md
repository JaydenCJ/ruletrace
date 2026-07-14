# Contributing to ruletrace

Issues, discussions and pull requests are all welcome.

## Getting started

You need Node.js ≥22.13 and git; nothing else. The only devDependency is `typescript`.

```bash
git clone https://github.com/JaydenCJ/ruletrace && cd ruletrace
npm install
npm test
bash scripts/smoke.sh
```

`scripts/smoke.sh` builds the CLI, fabricates a layered rule repository in a
temp directory, and asserts on real output from every subcommand (explain,
`--json`, `--content`, `tree`, `check`, exit codes); it must finish by
printing `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` compiles with zero errors under `strict`.
2. `npm test` passes (92 deterministic tests, no network, no wall clock).
3. `bash scripts/smoke.sh` prints `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable modules
   (only `discover.ts`, `imports.ts`, `resolve.ts` and the CLI touch the filesystem).

## Ground rules

- Keep runtime dependencies at zero; adding one needs strong justification in the PR.
- No network calls, ever — ruletrace only reads local files. No telemetry.
- ruletrace is **read-only** by design: it must never create, modify or delete
  a rule file. Anything that writes belongs in a different tool.
- Resolution semantics are data: when a tool changes how it loads rules, update
  the matching resolver in `src/tools/`, the table in `docs/resolution.md`, and
  add a fixture test reproducing the new behavior.
- Code comments and doc comments are written in English.
- Determinism first: identical trees must produce byte-identical reports,
  including all orderings.

## Reporting bugs

Include the output of `ruletrace --version`, the full command you ran, the
report you got, and a minimal fixture tree (paths + file contents) that
reproduces it — that is exactly what the resolver sees, and it becomes the
regression test.

## Security

Please do not open public issues for security problems; use GitHub's private
vulnerability reporting on this repository instead.
