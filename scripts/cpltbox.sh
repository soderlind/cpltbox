#!/usr/bin/env bash
set -euo pipefail

print_usage() {
  cat <<'EOF'
Usage:
  ./scripts/cpltbox.sh --repo <https://github.com/owner/repo> --task <text> [options]

Required:
  --repo <url>          GitHub repository URL
  --task <text>         Task for cpltbox to execute

Options:
  --url <base-url>      API base URL (default: http://localhost:8787)
  --stream              Use streaming endpoint (/stream)
  --model <id>          Copilot model id (optional)
  --prd-path <path>     Repo-relative PRD path (optional)
  --prd-text <text>     Inline PRD text (optional)
  --pretty              Pretty-print JSON output when jq is installed
  -h, --help            Show this help

Examples:
  ./scripts/cpltbox.sh \
    --repo https://github.com/owner/repo \
    --task "Run tests and fix one failing assertion"

  ./scripts/cpltbox.sh \
    --repo https://github.com/owner/repo \
    --task "Implement onboarding" \
    --prd-path docs/prd.md \
    --model gpt-5.3-codex
EOF
}

BASE_URL="http://localhost:8787"
REPO=""
TASK=""
MODEL=""
PRD_PATH=""
PRD_TEXT=""
STREAM="false"
PRETTY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --task)
      TASK="${2:-}"
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
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --prd-path)
      PRD_PATH="${2:-}"
      shift 2
      ;;
    --prd-text)
      PRD_TEXT="${2:-}"
      shift 2
      ;;
    --pretty)
      PRETTY="true"
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

if [[ -z "$REPO" || -z "$TASK" ]]; then
  echo "Error: --repo and --task are required." >&2
  print_usage
  exit 1
fi

ENDPOINT="$BASE_URL/"
if [[ "$STREAM" == "true" ]]; then
  ENDPOINT="$BASE_URL/stream"
fi

PAYLOAD=$(REPO="$REPO" TASK="$TASK" MODEL="$MODEL" PRD_PATH="$PRD_PATH" PRD_TEXT="$PRD_TEXT" node <<'NODE'
const payload = {
  repo: process.env.REPO,
  task: process.env.TASK,
};

if (process.env.MODEL) payload.model = process.env.MODEL;
if (process.env.PRD_PATH) payload.prdPath = process.env.PRD_PATH;
if (process.env.PRD_TEXT) payload.prdText = process.env.PRD_TEXT;

process.stdout.write(JSON.stringify(payload));
NODE
)

if [[ "$STREAM" == "true" ]]; then
  curl -N -sS -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD"
else
  if [[ "$PRETTY" == "true" ]] && command -v jq >/dev/null 2>&1; then
    curl -sS -X POST "$ENDPOINT" \
      -H 'Content-Type: application/json' \
      -d "$PAYLOAD" | jq .
  else
    curl -sS -X POST "$ENDPOINT" \
      -H 'Content-Type: application/json' \
      -d "$PAYLOAD"
  fi
fi
