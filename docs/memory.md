# Restart Memory

Use this file as the handoff after restarting VS Code.

## Current Project

- Workspace folder: `/Users/persoderlind/Projects/cplbox`
- Project/Worker name: `cpltbox`
- Package name: `cpltbox`
- Cloudflare Worker config: `wrangler.jsonc` uses `"name": "cpltbox"`
- Local folder was intentionally not renamed from `cplbox` to avoid disrupting the active VS Code workspace.

## Latest Commit

- Current branch: `main`
- Latest commit seen before restart: `6b96938 Add License section to README.md and ensure proper formatting`

## Current Uncommitted Changes

There are uncommitted changes in these files:

- `README.md`
- `docs/how-to-guide.md`
- `package-lock.json`
- `package.json`
- `wrangler.jsonc`

Summary of those changes:

- Renamed project-facing references from `cplbox` to `cpltbox`.
- Updated `package.json` and `package-lock.json` package name to `cpltbox`.
- Updated `wrangler.jsonc` Worker name to `cpltbox`.
- Updated `README.md` title to `cpltbox`.
- Updated `docs/how-to-guide.md` text and deployed Worker URLs to use `cpltbox`.
- Added 301 deployed usage examples in `docs/how-to-guide.md` after `npx wrangler deploy`:
  - deployed Worker URL shape
  - batch `POST /` curl example
  - streaming `POST /stream` curl example
  - production examples using `model`, `prdPath`, and `prdText`
  - note that callers do not send `GH_TOKEN`; the Worker reads the Cloudflare secret

## Implemented Features

The Worker runs GitHub Copilot CLI inside a Cloudflare Sandbox container.

Core files:

- `Dockerfile`: extends `docker.io/cloudflare/sandbox:0.7.20`, installs `@github/copilot@1.0.46`, checks `copilot --version`, sets `COMMAND_TIMEOUT_MS=300000`.
- `wrangler.jsonc`: Worker entrypoint, Sandbox container config, Durable Object binding/migration, `nodejs_compat`, observability.
- `src/index.ts`: Worker routes and Sandbox subclass.
- `src/copilot.ts`: validation, prompt construction, command building, env handling.
- `src/copilot.test.ts`: unit tests.
- `src/index.acceptance.test.ts`: Worker-level acceptance tests with mocked Cloudflare sandbox.
- `docs/how-to-guide.md`: 101/201/301 how-to guide.

Routes:

- `POST /`: batch mode; returns JSON with `success`, `exitCode`, `logs`, `stderr`, and `diff`.
- `POST /stream`: streaming mode; returns `text/event-stream` from `sandbox.execStream`.

Request fields:

- `repo`: required `https://github.com/owner/repo` URL.
- `task`: required non-empty string, max 8000 characters.
- `model`: optional safe model identifier.
- `prdText`: optional inline PRD text, max 50000 characters.
- `prdPath`: optional repo-relative PRD file path, max 240 characters, forward slashes only, no traversal.

Security behavior:

- `GH_TOKEN` is not baked into Docker image.
- Worker passes `GH_TOKEN` and `GITHUB_TOKEN` per sandbox command.
- Sandbox has `enableInternet = false`, `interceptHttps = true`, and allowlisted GitHub/Copilot hosts.
- Dynamic shell args go through `shellQuote`.
- PRD content is treated as untrusted input.

## Last Verification Before Restart

After PRD support and rename work, these passed:

- `npm test`: 28 tests passed.
- `npm run typecheck`: passed.
- `npx wrangler deploy --dry-run`: passed and built `cpltbox-sandbox`.
- VS Code diagnostics: no errors.
- Search found no remaining `cplbox` references in workspace files after the rename.

## Useful Commands After Restart

Check state:

```bash
git status --short
git diff --stat
rg -n "cplbox|Cplbox|CPLBOX" . --glob '!node_modules/**' --glob '!.git/**'
```

Verify:

```bash
npm test
npm run typecheck
npx wrangler deploy --dry-run
```

Commit current rename/docs work if desired:

```bash
git add README.md docs/how-to-guide.md package.json package-lock.json wrangler.jsonc
git commit -m "Rename project to cpltbox"
```

## Notes

- README has an MIT License section and copyright line.
- `docs/memory.md` itself is newly created and will appear as untracked/modified until committed.
- If deployment happens, Wrangler should print a deployed URL similar to `https://cpltbox.<your-workers-subdomain>.workers.dev`.
