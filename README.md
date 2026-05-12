# cplbox

Run GitHub Copilot CLI inside a Cloudflare Sandbox from a Worker.

This project follows the same shape as Cloudflare's Sandbox SDK Claude Code example: a Worker accepts a GitHub repository URL and task, checks out the repository inside an isolated Linux sandbox, runs a headless coding agent, and returns logs plus the local `git diff`.

## How To Use

See the [how-to guide](docs/how-to-guide.md) for setup, local development, request examples, streaming, deployment, verification, and troubleshooting.

The guide is organized by level:

- 101: run the Worker locally and send a basic task.
- 201: customize streaming, model selection, validation, and sandbox behavior.
- 301: deploy and operate the service safely.

## Security Model

- The GitHub token is never baked into the Docker image.
- The Worker passes `GH_TOKEN` and `GITHUB_TOKEN` only as per-command environment variables.
- The Copilot command uses non-interactive mode: `copilot -p ... --allow-all`.
- The Worker validates GitHub repository URLs, bounds task length, and shell-quotes dynamic arguments.
- The sandbox class disables broad internet and allowlists GitHub/Copilot hosts.

## AI Contribution Attribution

Assisted-by: GitHub Copilot:GPT-5.4