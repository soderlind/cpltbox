# How-To Guide

This guide covers local development, customization, and production deployment.

---

## Local Development

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js + npm | Any recent LTS version |
| Docker | Must be running for sandbox builds |
| Cloudflare account | [Workers Sandbox](https://www.cloudflare.com/products/sandboxes/) support required |
| GitHub token | [Fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with `Copilot Requests` permission; add repo read for private repos |

### Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```
GH_TOKEN=github_pat_...
SANDBOX_ENABLE_INTERNET=true
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GH_TOKEN` | yes | GitHub PAT with Copilot access |
| `SANDBOX_ENABLE_INTERNET` | local only | Set `true` for local dev (enables DNS); omit in production |

Never commit these secrets.

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

**Alternative:** Use an [HTTP client](rest.md) like REST Client, Bruno, Postman, or HTTPie instead of curl.

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

### Working with the Diff

The `diff` field contains escaped newlines. Use `jq` to extract it:

```bash
# View the diff
curl -s -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{"repo": "...", "task": "..."}' | jq -r '.diff'

# Save to file and apply locally
curl -s ... | jq -r '.diff' > fix.patch
cd ~/Projects/your-repo
git apply fix.patch
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
| `skillPaths` | Repo-relative skill files to read and follow (max 10 paths, 240 chars each) |
| `mcpConfig` | MCP server configuration object (max 10 servers, 32KB) |

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

**With repo skill files:**

```json
{"repo": "https://github.com/owner/repo", "task": "Build the REST endpoint", "skillPaths": [".cpltbox/skills/wp-rest-api/SKILL.md"]}
```

You can combine `prdText`, `prdPath`, and `skillPaths`. The Worker appends PRD and skill path context to the task before invoking Copilot.

PRD and skill content is untrusted input — never include tokens or secrets.

---

## MCP Servers

Connect [Model Context Protocol (MCP)](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) servers to give Copilot access to external tools.

### Server Types

| Type | Description |
|------|-------------|
| `local` / `stdio` | Starts a local process (e.g., `npx @playwright/mcp@latest`) |
| `http` / `sse` | Connects to a remote MCP server via URL |

### Example: Local Server

```json
{
  "repo": "https://github.com/owner/repo",
  "task": "Test the login page using Playwright",
  "mcpConfig": {
    "mcpServers": {
      "playwright": {
        "type": "local",
        "command": "npx",
        "args": ["@playwright/mcp@latest"],
        "tools": "*"
      }
    }
  }
}
```

### Example: Remote Server

```json
{
  "repo": "https://github.com/owner/repo",
  "task": "Search for documentation",
  "mcpConfig": {
    "mcpServers": {
      "context7": {
        "type": "http",
        "url": "https://mcp.context7.com/mcp",
        "headers": {"API-KEY": "your-api-key"},
        "tools": "*"
      }
    }
  }
}
```

### Configuration Reference

| Field | Required | Description |
|-------|----------|-------------|
| `type` | yes | `local`, `stdio`, `http`, or `sse` |
| `command` | local/stdio | Command to start the server (e.g., `npx`) |
| `args` | no | Arguments for the command |
| `url` | http/sse | Remote server URL |
| `headers` | no | HTTP headers for remote servers |
| `env` | no | Environment variables (key-value object) |
| `tools` | no | `"*"` for all tools or array of tool names |

### Limitations

- **Local servers** require the MCP package to be installed in the sandbox. Add packages to the Dockerfile if needed.
- **Remote servers** work if the URL is reachable (check network allowlisting).
- **Max 10 servers** per request, 32KB total config size.

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

The sandbox restricts network access to GitHub/Copilot hosts via `COPILOT_ALLOWED_HOSTS`.

**Local development:** Set `SANDBOX_ENABLE_INTERNET=true` in `.env`. This is required because local Docker can't resolve DNS for allowlisted hosts without general internet access.

**Production:** Omit `SANDBOX_ENABLE_INTERNET` (defaults to `false`). Cloudflare's infrastructure handles DNS resolution for allowlisted hosts correctly.

If Copilot adds endpoints, update `src/copilot.ts` and rerun tests.

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
| `GH_TOKEN is not configured` | Missing secret | Set in `.env` (local) or `wrangler secret put` (prod) |
| `repo must be an https://github.com URL` | Invalid URL format | Use repository homepage, not issue/PR/file URL |
| `Could not resolve host: github.com` | DNS blocked in sandbox | Set `SANDBOX_ENABLE_INTERNET=true` in `.env` |
| Checkout failure | Repo doesn't exist or token lacks access | Verify repo exists and token has read permission |
| `Command timeout after 300000ms` | Copilot did not finish within the sandbox command timeout | Retry with `/stream` for visibility, reduce task scope, or check Copilot/network logs |
| Empty diff | Copilot ran but made no changes | Check `logs` and `stderr` for details |

---

## Testing

```bash
npm test                  # unit tests
npm run test:acceptance   # Worker-level tests with mocked sandbox
npm run typecheck         # TypeScript check
```

Add acceptance tests in `src/index.acceptance.test.ts` when changing routes, response shape, or command orchestration.
