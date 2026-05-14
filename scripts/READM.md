# Scripts

This folder contains shell helpers for calling cpltbox.

## Files

- `cpltbox.sh` - Thin wrapper around `curl` for cpltbox requests.
- `ralph.sh` - Demo script that sends a practical "Ralph-ish" task through `cpltbox.sh`.

## Prerequisites

- Bash
- `curl`
- Node.js (used to build safe JSON payloads)
- Optional: `jq` for pretty JSON output with `--pretty`

## Make Scripts Executable

```bash
chmod +x scripts/cpltbox.sh scripts/ralph.sh
```

## cpltbox.sh

Basic:

```bash
./scripts/cpltbox.sh \
  --repo https://github.com/owner/repo \
  --task "Fix one typo in README.md" \
  --pretty
```

Streaming:

```bash
./scripts/cpltbox.sh \
  --repo https://github.com/owner/repo \
  --task "Run tests and fix one failing assertion" \
  --stream
```

With model and PRD:

```bash
./scripts/cpltbox.sh \
  --repo https://github.com/owner/repo \
  --task "Implement onboarding" \
  --model gpt-5.3-codex \
  --prd-path docs/prd.md \
  --url http://localhost:8787
```

## ralph.sh

Run the demo task:

```bash
./scripts/ralph.sh --repo https://github.com/owner/repo
```

Streaming demo:

```bash
./scripts/ralph.sh --repo https://github.com/owner/repo --stream
```

## Notes

- Local default URL is `http://localhost:8787`.
- For production, pass `--url https://cpltbox.<subdomain>.workers.dev`.
- Script output is the same API output returned by cpltbox.
