#!/usr/bin/env bash
# End-to-end smoke test for ruletrace. No network, idempotent, runs from a
# clean tree. This script plus 'npm test' is the whole verification story —
# the repository intentionally ships no CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

fail() {
  echo "SMOKE FAIL: $*" >&2
  exit 1
}

echo "[1/9] build (reuses dist/ when present)"
if [ ! -f "$ROOT/dist/cli.js" ]; then
  (cd "$ROOT" && npm run build) || fail "build failed"
fi
RT() { node "$ROOT/dist/cli.js" "$@"; }

echo "[2/9] --version matches the manifest version"
PKG_VERSION="$(node -p "require('$ROOT/package.json').version")"
VERSION_OUT="$(RT --version)"
[ "$VERSION_OUT" = "ruletrace $PKG_VERSION" ] || fail "unexpected version output: $VERSION_OUT"

echo "[3/9] fabricate a repository with layered rules"
REPO="$WORKDIR/repo"
mkdir -p "$REPO/src/parser" "$REPO/docs" "$REPO/.cursor/rules" "$REPO/.github/instructions"
cat > "$REPO/CLAUDE.md" <<'EOF'
Root memory. Style: @docs/style.md
EOF
cat > "$REPO/docs/style.md" <<'EOF'
Two-space indent. Naming: @naming.md
EOF
printf 'camelCase everywhere.\n' > "$REPO/docs/naming.md"
printf 'src memory.\n' > "$REPO/src/CLAUDE.md"
printf 'Root agent notes.\n' > "$REPO/AGENTS.md"
printf 'Parser agent notes.\n' > "$REPO/src/parser/AGENTS.md"
cat > "$REPO/.cursor/rules/ts.mdc" <<'EOF'
---
globs: src/**/*.ts
---
Strict TypeScript.
EOF
printf 'Repo-wide instructions.\n' > "$REPO/.github/copilot-instructions.md"
cat > "$REPO/.github/instructions/parser.instructions.md" <<'EOF'
---
applyTo: "src/parser/**"
---
Parser changes need a fuzz entry.
EOF
printf 'export {};\n' > "$REPO/src/parser/lexer.ts"

echo "[4/9] explain resolves nesting, imports, globs and applyTo"
EXPLAIN="$(RT src/parser/lexer.ts --root "$REPO")"
echo "$EXPLAIN" | grep -q "claude-code — 2 layers" || fail "claude layer count wrong"
echo "$EXPLAIN" | grep -q -- "-> @docs/style.md  \[ok\]" || fail "import not resolved"
echo "$EXPLAIN" | grep -q -- "-> @naming.md  \[ok\]" || fail "nested import not resolved"
echo "$EXPLAIN" | grep -q "glob src/\*\*/\*.ts matched" || fail "cursor glob not matched"
echo "$EXPLAIN" | grep -q "applyTo src/parser/\*\* matched" || fail "copilot applyTo not matched"
echo "$EXPLAIN" | grep -q "nearest AGENTS.md — takes precedence" || fail "agents nearest not marked"

echo "[5/9] --json is schema_version 1 and machine-parseable"
RT src/parser/lexer.ts --root "$REPO" --json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);if(j.schema_version!==1||j.tools.length!==4)process.exit(1);})" \
  || fail "json output invalid"

echo "[6/9] --content inlines the whole import chain in reading order"
CONTENT="$(RT src/parser/lexer.ts --root "$REPO" --content --tool claude)"
echo "$CONTENT" | grep -q "===== docs/naming.md (imported via @naming.md from docs/style.md:1) =====" \
  || fail "content provenance banner missing"

echo "[7/9] tree lists the full inventory"
RT tree --root "$REPO" | grep -q "auto (src/\*\*/\*.ts)" || fail "tree missing cursor rule kind"

echo "[8/9] check is clean here, and fails loudly on a broken import"
RT check --root "$REPO" | grep -q "no problems found" || fail "clean repo flagged"
printf 'Broken: @docs/gone.md\n' >> "$REPO/CLAUDE.md"
set +e
CHECK_OUT="$(RT check --root "$REPO")"
CHECK_CODE=$?
set -e
[ "$CHECK_CODE" -eq 1 ] || fail "expected exit 1 on broken import, got $CHECK_CODE"
echo "$CHECK_OUT" | grep -q "import-missing" || fail "broken import not reported"

echo "[9/9] usage errors exit 2"
set +e
RT --no-such-flag >/dev/null 2>&1
USAGE_CODE=$?
set -e
[ "$USAGE_CODE" -eq 2 ] || fail "expected exit 2 on usage error, got $USAGE_CODE"

echo "SMOKE OK"
