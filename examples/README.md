# ruletrace examples

`demo-project/` is a miniature repository that layers every rule format
ruletrace understands: nested `CLAUDE.md` files with a two-hop `@` import
chain, a personal `CLAUDE.local.md`, three Cursor rules covering the
always / auto / agent-requested attachment modes, Copilot repository
instructions plus two scoped `.instructions.md` files, and an `AGENTS.md`
chain where the nested file overrides the root one. The Copilot files live
under `.github/`, which this repository does not check in — a one-time
setup script generates them (the path is gitignored).

Run everything from the repository root (after `npm install && npm run build`):

```bash
# One-time: materialise the Copilot fixture (.github/) inside demo-project
bash examples/setup-demo.sh

# What does the lexer actually get, across all four tools?
node dist/cli.js src/parser/lexer.ts --root examples/demo-project

# Same question, but show me the exact concatenated text Claude Code reads
node dist/cli.js src/parser/lexer.ts --root examples/demo-project --content --tool claude

# What would a *new* file under tests/ get? (the path does not exist yet)
node dist/cli.js tests/future.test.ts --root examples/demo-project

# Inventory of every rule file in the repo, labelled by kind
node dist/cli.js tree --root examples/demo-project

# Health check: broken imports, dead globs, deprecated formats
node dist/cli.js check --root examples/demo-project
```

Things worth trying:

- Delete `demo-project/docs/naming.md` and re-run `check` — the nested
  import from `docs/style.md` is reported as `import-missing` with the line.
- Edit `typescript.mdc`'s glob to `src/**/*.rs` and re-run `check` — the
  glob goes dead and `explain` stops attaching the rule.
- Compare `src/parser/lexer.ts` with `docs/style.md` as targets: the Cursor
  auto rule and the Copilot parser instructions apply to one but not the other.
