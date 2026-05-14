# HTTP Clients for cpltbox

You can use any HTTP client to interact with cpltbox. This guide covers popular options.

---

## Quick Reference

| Client | Type | Best For |
|--------|------|----------|
| [REST Client](#rest-client-vs-code) | VS Code extension | Quick testing in editor |
| [Bruno](#bruno) | Standalone app | Git-friendly collections |
| [Postman](#postman) | Standalone app | Team collaboration |
| [Insomnia](#insomnia) | Standalone app | Lightweight GUI |
| [HTTPie](#httpie) | CLI | Cleaner curl syntax |
| [curl](#curl) | CLI | Scripts and automation |

---

## REST Client (VS Code)

The [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension lets you send requests directly from `.http` files.

**Setup:**
1. Install extension: `humao.rest-client`
2. Open [requests.http](../requests.http)
3. Click "Send Request" above any block

**Features:**
- Inline responses with syntax highlighting
- Variables (`@baseUrl = ...`)
- Request history via Command Palette

---

## Bruno

[Bruno](https://www.usebruno.com/) is an open-source, git-friendly API client.

**Setup:**
1. Download from [usebruno.com](https://www.usebruno.com/)
2. Create a new collection
3. Import or create requests

**Example request:**

```
POST http://localhost:8787/
Content-Type: application/json

{
  "repo": "https://github.com/owner/repo",
  "task": "Fix the typo in README.md"
}
```

**Features:**
- Collections stored as plain text (git-friendly)
- Environment variables
- No cloud sync required

---

## Postman

[Postman](https://www.postman.com/) is a full-featured API platform.

**Setup:**
1. Download from [postman.com](https://www.postman.com/downloads/)
2. Create a new request
3. Set method to POST, URL to `http://localhost:8787/`
4. Body tab → raw → JSON

**Example body:**

```json
{
  "repo": "https://github.com/owner/repo",
  "task": "Fix the typo in README.md"
}
```

**Features:**
- Collections and environments
- Team workspaces
- Pre/post request scripts

---

## Insomnia

[Insomnia](https://insomnia.rest/) is a lightweight REST client.

**Setup:**
1. Download from [insomnia.rest](https://insomnia.rest/download)
2. Create a new request
3. Set method, URL, and JSON body

**Features:**
- Clean UI
- Environment variables
- Plugin ecosystem

---

## HTTPie

[HTTPie](https://httpie.io/) provides a cleaner CLI syntax than curl.

**Install:**

```bash
brew install httpie
```

**Batch request:**

```bash
http POST localhost:8787/ \
  repo=https://github.com/owner/repo \
  task="Fix the typo in README.md"
```

**Streaming:**

```bash
http --stream POST localhost:8787/stream \
  repo=https://github.com/owner/repo \
  task="Run tests and fix failures"
```

**Features:**
- JSON by default
- Colorized output
- Sessions for auth

---

## curl

Standard CLI tool, available everywhere.

**Batch request:**

```bash
curl -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{"repo": "https://github.com/owner/repo", "task": "Fix the typo in README.md"}'
```

**Streaming:**

```bash
curl -N -X POST http://localhost:8787/stream \
  -H 'Content-Type: application/json' \
  -d '{"repo": "https://github.com/owner/repo", "task": "Run tests and fix failures"}'
```

---

## Request Reference

All clients send the same JSON body:

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | yes | GitHub URL: `https://github.com/owner/repo` |
| `task` | yes | What to do (max 8000 chars) |
| `model` | no | Copilot model identifier |
| `prdText` | no | Inline PRD context (max 50000 chars) |
| `prdPath` | no | Repo-relative path to PRD file |
| `skillPaths` | no | Repo-relative skill files to read and follow |

**Endpoints:**
- `POST /` — batch mode, returns JSON when complete
- `POST /stream` — streaming mode, returns live output

---

## Response Format

```json
{
  "success": true,
  "exitCode": 0,
  "logs": "...",
  "stderr": "",
  "diff": "diff --git ..."
}
```

---

## Environment Switching

Most clients support environments. Create two:

**Local:**
- Base URL: `http://localhost:8787`

**Production:**
- Base URL: `https://cpltbox.<subdomain>.workers.dev`
