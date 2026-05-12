# How-To Guide: Running Copilot CLI in Cloudflare Sandbox

This guide walks through cpltbox in three levels:

- 101: run it locally and send a basic task.
- 201: customize requests, models, streaming, and validation.
- 301: prepare it for deployment and operational use.

## 101: Run Your First Sandbox Task

Use this level when you want to prove the Worker, sandbox image, and Copilot CLI flow work together.

### Prerequisites

- Node.js and npm installed.
- Docker running locally.
- A Cloudflare account with Workers Sandbox support.
- A GitHub token for an account with Copilot access.

For a fine-grained GitHub token, enable the `Copilot Requests` permission. Private repositories also need repository read access.

### Install Dependencies

```bash
npm install
```

### Configure Local Secrets

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set `GH_TOKEN`:

```bash
GH_TOKEN=github_pat_with_copilot_requests_permission
```

Do not put this token in the Dockerfile, source files, or README examples that might be committed.

### Start the Worker

```bash
npm run dev
```

The first run builds the sandbox image from `Dockerfile`. The image extends `docker.io/cloudflare/sandbox:0.7.20` and installs `@github/copilot` globally.

### Send a Batch Request

Use a small repository first so checkout and diff output are easy to inspect.

```bash
curl -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Fix the typo in README.md"
  }'
```

A successful response includes:

- `success`: whether the Copilot CLI command succeeded.
- `exitCode`: command exit code.
- `logs`: command output.
- `stderr`: stderr from Copilot CLI.
- `diff`: local `git diff` after Copilot runs.

### Verify the Codebase

```bash
npm run types
npm test
npm run test:acceptance
npm run typecheck
```

## 201: Customize the Worker Flow

Use this level when the basic request works and you want to shape how cpltbox runs tasks.

### Use Streaming Output

The `/stream` route returns `text/event-stream` output from `sandbox.execStream`.

```bash
curl -N -X POST http://localhost:8787/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Run the tests and fix one failing assertion"
  }'
```

Use streaming for longer tasks where watching progress is more useful than waiting for one final JSON response.

### Select a Model

Pass `model` in the request body:

```json
{
  "repo": "https://github.com/owner/repo",
  "task": "Summarize the project structure",
  "model": "gpt-5.2"
}
```

The Worker validates model names with a conservative character allowlist before adding `--model` to the Copilot command.

### Add PRD Context

Use `prdText` when the PRD is small enough to send inline with the request:

```json
{
  "repo": "https://github.com/owner/repo",
  "task": "Implement the onboarding flow",
  "prdText": "Users should complete setup in under five minutes. The first screen must collect workspace name and role."
}
```

Use `prdPath` when the PRD is already committed in the repository:

```json
{
  "repo": "https://github.com/owner/repo",
  "task": "Implement the dashboard described in the PRD",
  "prdPath": "docs/prd.md"
}
```

You can pass both fields. The Worker keeps `task` as the primary instruction and appends a PRD context section before invoking Copilot.

### Understand Request Validation

The Worker accepts:

- `repo`: an `https://github.com/owner/repo` URL.
- `task`: a non-empty string up to 8000 characters.
- `model`: an optional string containing letters, numbers, underscores, periods, colons, and hyphens.
- `prdText`: optional inline PRD text up to 50000 characters.
- `prdPath`: an optional repo-relative path up to 240 characters, using forward slashes and simple path segments.

Invalid requests return a `400` JSON response with an error message.

PRD content is treated as untrusted input. Do not put tokens, private keys, or unrelated confidential material in `prdText`.

### Understand Sandbox Reuse

The Worker derives a stable sandbox ID from the normalized repository URL. Requests for the same repository use the same sandbox identity, while each run removes and reclones the target directory before invoking Copilot.

This keeps the execution path predictable:

1. Normalize request input.
2. Get the sandbox by stable repository ID.
3. Clone the repository with the GitHub token passed as command env.
4. Run Copilot CLI in non-interactive mode.
5. Return logs and diff output.

### Adjust Network Allowlisting

The sandbox disables broad internet access and allowlists GitHub/Copilot hosts through `COPILOT_ALLOWED_HOSTS`.

If Copilot adds or changes endpoints, update the allowlist in `src/copilot.ts`, then rerun:

```bash
npm test
npm run typecheck
```

## 301: Deploy and Operate Safely

Use this level when local behavior is verified and you are ready to deploy or run cpltbox against real repositories.

### Deploy the Worker

```bash
npx wrangler deploy
```

Set the production secret separately:

```bash
npx wrangler secret put GH_TOKEN
```

After first deployment, container provisioning can take a few minutes:

```bash
npx wrangler containers list
```

Wrangler prints the deployed Worker URL after a successful deploy. It usually looks like this:

```text
https://cpltbox.<your-workers-subdomain>.workers.dev
```

Callers do not send `GH_TOKEN`. The Worker reads the Cloudflare secret and passes it to sandbox commands.

### Use the Deployed Worker

Send a batch request to the deployed `/` route:

```bash
curl -X POST https://cpltbox.<your-workers-subdomain>.workers.dev/ \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Fix the typo in README.md"
  }'
```

The response has the same shape as local development:

```json
{
  "success": true,
  "exitCode": 0,
  "logs": "...",
  "stderr": "",
  "diff": "diff --git ..."
}
```

Use `/stream` when you want live output from a longer task:

```bash
curl -N -X POST https://cpltbox.<your-workers-subdomain>.workers.dev/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Run the test suite and fix one failing assertion"
  }'
```

Use the same optional fields in production that you used locally. For example, pass a model and a repo-relative PRD path:

```bash
curl -X POST https://cpltbox.<your-workers-subdomain>.workers.dev/ \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Implement the dashboard described in the PRD",
    "model": "gpt-5.2",
    "prdPath": "docs/prd.md"
  }'
```

Or pass inline PRD text:

```bash
curl -X POST https://cpltbox.<your-workers-subdomain>.workers.dev/ \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Implement the onboarding flow",
    "prdText": "Users should complete setup in under five minutes."
  }'
```

### Run a Dry-Run Before Deployment

Use Wrangler dry-run to confirm the Worker bundle and sandbox image build:

```bash
npx wrangler deploy --dry-run
```

This should report the Worker upload size, build the Docker image, and exit without deploying.

### Production Checklist

Before using the service with valuable repositories:

- Use a GitHub token with the narrowest permissions that still supports Copilot and repository checkout.
- Keep `GH_TOKEN` in Cloudflare secrets, not source control.
- Run both `/` and `/stream` locally against a small public repository.
- Review the generated diff before applying changes outside the sandbox.
- Monitor checkout failures for missing repository permissions.
- Monitor sandbox network failures for changed GitHub or Copilot hostnames.
- Keep `@cloudflare/sandbox` and the Docker base image on the same version.

### Troubleshoot Common Failures

`GH_TOKEN is not configured` means the Worker did not receive the secret. Check `.dev.vars` locally or `wrangler secret put GH_TOKEN` in production.

`repo must be an https://github.com URL` means the request body did not pass repository validation. Use the repository homepage URL, not an issue, pull request, branch, or file URL.

A `checkout` stage failure usually means the repository does not exist, is private without token access, or the token is invalid.

A Copilot CLI failure with an empty diff means checkout worked but the task failed or Copilot chose not to edit files. Inspect `logs` and `stderr` from the response.

### Extend the Acceptance Tests

The acceptance suite in `src/index.acceptance.test.ts` mocks the Cloudflare sandbox boundary and exercises real Worker request handling. Add tests there when changing HTTP behavior, response shape, route handling, or command orchestration.

Run it directly with:

```bash
npm run test:acceptance
```
