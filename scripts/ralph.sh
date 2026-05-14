#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage:
  ./scripts/ralph.sh [--repo <https://github.com/owner/repo>] [--url <base-url>] [--stream]

What it does:
  Sends a "Ralph-ish" demo task to cpltbox using scripts/cpltbox.sh.

Defaults:
  --repo https://github.com/owner/repo
  --url  http://localhost:8787
EOF
}

REPO="https://github.com/owner/repo"
BASE_URL="http://localhost:8787"
STREAM="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --stream)
      STREAM="true"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      print_usage
      exit 1
      ;;
  esac
done

TASK="Review the repository and make one small, safe documentation improvement. Explain your plan briefly, keep the tone direct and practical, and include the exact files changed plus why."

CMD=("$SCRIPT_DIR/cpltbox.sh" --repo "$REPO" --task "$TASK" --url "$BASE_URL" --pretty)
if [[ "$STREAM" == "true" ]]; then
  CMD=("$SCRIPT_DIR/cpltbox.sh" --repo "$REPO" --task "$TASK" --url "$BASE_URL" --stream)
fi

"${CMD[@]}"
