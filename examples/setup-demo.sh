#!/usr/bin/env bash
# Materialises the GitHub Copilot fixture inside examples/demo-project.
#
# This repository deliberately ships no .github/ directory (it also ships no
# CI — see CONTRIBUTING.md), so the demo's Copilot rule files are generated
# here instead of being checked in. The script is idempotent and offline;
# the generated path is gitignored.
set -euo pipefail

DEMO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/demo-project"

mkdir -p "$DEMO/.github/instructions"

printf 'This repository is a small TypeScript parser. Keep changes minimal.\n' \
  > "$DEMO/.github/copilot-instructions.md"

cat > "$DEMO/.github/instructions/parser.instructions.md" <<'EOF'
---
applyTo: "src/parser/**/*.ts"
---
Parser changes need a fuzz corpus entry.
EOF

cat > "$DEMO/.github/instructions/tests.instructions.md" <<'EOF'
---
applyTo: "tests/**"
---
Every test must be deterministic and offline.
EOF

echo "demo fixture ready: $DEMO"
