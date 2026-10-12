#!/usr/bin/env bash
# Starts the hub's site and opens it in the browser.
#
#   ./start.sh                          the demo project, as iryna.s (QA)
#   ./start.sh --as maksym.d            the demo as another person (see README.md for the people)
#   ./start.sh --fixture release-walk   another demo project
#   ./start.sh --project ../product-specs   your own product-specs checkout, as your git identity
#
# Ctrl+C stops the server.
set -euo pipefail
cd "$(dirname "$0")"

major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$major" -lt 22 ]; then
  echo "The hub needs Node.js 22 or newer (found: $(node -v 2>/dev/null || echo none))." >&2
  exit 1
fi
[ -d node_modules ] || npm install
echo "Building the hub…"
npm run -s build >/dev/null

if [ "${1:-}" = "--project" ]; then
  [ -n "${2:-}" ] || { echo "Usage: ./start.sh --project <path to product-specs>" >&2; exit 1; }
  cli="$PWD/packages/cli/dist/cli.mjs"
  cd "$2"
  shift 2
  exec node "$cli" serve --open / "$@"
fi
exec node packages/cli/dist/cli.mjs demo --open "$@"
