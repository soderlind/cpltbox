# cpltbox

Run GitHub Copilot CLI against any repository through a controlled HTTP interface.

A Cloudflare Worker receives a repository URL and task, checks out the code inside an isolated Linux sandbox, runs Copilot CLI in headless mode, and returns the agent logs plus the resulting `git diff`. This gives you a repeatable, API-driven way to run coding tasks while keeping secrets out of the image, limiting network access, and making each result reviewable before anything is merged.

Built on [Cloudflare's Workers Sandbox SDK](https://blog.cloudflare.com/dynamic-workers/) for running containerized workloads inside Workers.

## Quick Start

```bash
npm install
cp .dev.vars.example .dev.vars   # add GH_TOKEN and SANDBOX_ENABLE_INTERNET
npm run dev
```

Send a task:

```bash
curl -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "https://github.com/owner/repo",
    "task": "Fix the typo in README.md"
  }'
```

Response:

```json
{
  "success": true,
  "exitCode": 0,
  "logs": "...",
  "stderr": "",
  "diff": "diff --git a/README.md b/README.md ..."
}
```

Use `/stream` for live output on longer tasks.

## Request Fields

| Field     | Required | Description |
|-----------|----------|-------------|
| `repo`    | yes      | GitHub repository URL (`https://github.com/owner/repo`) |
| `task`    | yes      | What to do (max 8000 chars) |
| `model`   | no       | Copilot model identifier |
| `prdText` | no       | Inline PRD context (max 50000 chars) |
| `prdPath` | no       | Repo-relative path to a PRD file |

## Documentation

See the [how-to guide](docs/how-to-guide.md) for local development, streaming, model selection, PRD usage, deployment, and troubleshooting. Example PRD files are in `docs/`.

Read [why cpltbox](docs/why-cpltbox.md) for design rationale, tradeoffs, and project goals.

For shell helpers, see [scripts/READM.md](scripts/READM.md) in the `scripts/` folder (`cpltbox.sh` and `ralph.sh`).

For quick testing, see [HTTP clients](docs/rest.md) for options like REST Client, Bruno, Postman, or HTTPie. The [requests.http](requests.http) file has ready-to-use examples.

## Security

- GitHub token is never baked into the Docker image.
- `GH_TOKEN` is passed only as per-command environment variables.
- Copilot runs in non-interactive mode: `copilot -p ... --allow-all`.
- Repository URLs, task length, and shell arguments are validated.
- The sandbox disables broad internet and allowlists GitHub/Copilot hosts only.

## License

MIT License. Copyright (c) 2026 Per Søderlind.

## AI Contribution Attribution

Assisted-by: GitHub Copilot:GPT-5.5
