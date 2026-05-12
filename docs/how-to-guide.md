# How-To Guide

This guide covers local development, customization, and production deployment.

---

## Local Development

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js + npm | Any recent LTS version |
| Docker | Must be running for sandbox builds |
| Cloudflare account | Workers Sandbox support required |
| GitHub token | Fine-grained PAT with `Copilot Requests` permission; add repo read for private repos |

### Setup

```bash
npm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```
GH_TOKEN=github_pat_...
```

Never commit this token.

### Run Locally

```bash
npm run dev
```

First run builds the sandbox image from `Dockerfile` (extends `cloudflare/sandbox:0.7.20`, installs `@github/copilot`).

### Send a Request

**Batch mode** — wait for completion:

```bash
curl -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{"repo": "https://github.com/owner/repo", "task": "Fix the typo in README.md"}'
```

**Streaming mode** — watch progress:

```bash
curl -N -X POST http://localhost:8787/stream \
  -H 'Content-Type: application/json' \
  -d '{"repo": "https://github.com/owner/repo", "task": "Run the tests and fix one failing assertion"}'
```

### Response Shape

```json
{
  "success": true,
  "exitCode": 0,
  "logs": "...",
  "stderr": "",
  "diff": "diff --git ..."
}
```

### Verify

```bash
npm test && npm run typecheck
```

---

## Request Options

### Required Fields

| Field  | Description |
|--------|-------------|
| `repo` | GitHub repository URL: `https://github.com/owner/repo` |
| `task` | What to do (max 8000 chars) |

### Optional Fields

| Field     | Description |
|-----------|-------------|
| `model`   | Copilot model identifier (letters, numbers, `_.-:`) |
| `prdText` | Inline PRD context (max 50000 chars) |
| `prdPath` | Repo-relative path to a PRD file (max 240 chars) |

### Examples

**With model:**

```json
{"repo": "https://github.com/owner/repo", "task": "Summarize the structure", "model": "gpt-5.2"}
```

**With inline PRD:**

```json
{"repo": "https://github.com/owner/repo", "task": "Implement the onboarding flow", "prdText": "Users complete setup in under five minutes."}
```

**With PRD file:** (see [prd.md](prd.md) for a simple example)

```json
{"repo": "https://github.com/owner/repo", "task": "Implement the dashboard", "prdPath": "docs/prd.md"}
```

You can combine `prdText` and `prdPath`. The Worker appends PRD context to the task before invoking Copilot.

PRD content is untrusted input — never include tokens or secrets.

---

## How It Works

1. Validate and normalize request input.
2. Derive a stable sandbox ID from the repository URL.
3. Clone the repository (token passed as command env, not baked into image).
4. Run `copilot -p ... --allow-all` in non-interactive mode.
5. Capture logs, stderr, and `git diff`.
6. Return JSON or stream output.

### Sandbox Reuse

Requests for the same repository reuse the same sandbox identity. Each run removes and reclones the target directory, keeping execution predictable.

### Network Allowlisting

The sandbox disables broad internet and allowlists GitHub/Copilot hosts via `COPILOT_ALLOWED_HOSTS`. If Copilot adds endpoints, update `src/copilot.ts` and rerun tests.

---

## Deployment

### Deploy

```bash
npx wrangler deploy
npx wrangler secret put GH_TOKEN
```

First deploy provisions the container (may take a few minutes):

```bash
npx wrangler containers list
```

Deployed URL: `https://cpltbox.<subdomain>.workers.dev`

### Dry Run

```bash
npx wrangler deploy --dry-run
```

Builds the image and bundles without deploying.

### Production Requests

Same as local — just change the URL:

```bash
curl -X POST https://cpltbox.<subdomain>.workers.dev/ \
  -H 'Content-Type: application/json' \
  -d '{"repo": "https://github.com/owner/repo", "task": "Fix the typo in README.md"}'
```

For complex workflows, use streaming with a detailed PRD. See [prd-github-issue-pr-loop.md](prd-github-issue-pr-loop.md) for an issue-to-PR completion loop example:

```bash
curl -N -X POST https://cpltbox.<subdomain>.workers.dev/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Resolve issue #123, open a PR, respond to feedback, and continue until done.",
    "prdPath": "docs/prd-github-issue-pr-loop.md"
  }'
```

---

## Production Checklist

- [ ] Use a GitHub token with minimum required permissions.
- [ ] Store `GH_TOKEN` in Cloudflare secrets, not source control.
- [ ] Test both `/` and `/stream` locally before deploying.
- [ ] Review generated diffs before applying changes.
- [ ] Monitor for checkout failures (permissions) and network failures (changed hostnames).
- [ ] Keep `@cloudflare/sandbox` and Docker base image versions aligned.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `GH_TOKEN is not configured` | Missing secret | Set in `.dev.vars` (local) or `wrangler secret put` (prod) |
| `repo must be an https://github.com URL` | Invalid URL format | Use repository homepage, not issue/PR/file URL |
| Checkout failure | Repo doesn't exist or token lacks access | Verify repo exists and token has read permission |
| Empty diff | Copilot ran but made no changes | Check `logs` and `stderr` for details |

---

## Testing

```bash
npm test                  # unit tests
npm run test:acceptance   # Worker-level tests with mocked sandbox
npm run typecheck         # TypeScript check
```

Add acceptance tests in `src/index.acceptance.test.ts` when changing routes, response shape, or command orchestration.
