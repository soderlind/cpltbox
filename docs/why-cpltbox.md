# Why cpltbox? The Wisdom Behind a Boring HTTP Endpoint

Most people meet GitHub Copilot CLI by typing `copilot` into a terminal on their dev machine, watching it chew through their working directory, and hoping it doesn't do something weird. That works fine — until you want to *automate* it. The moment you do, you collide with a stack of unsolved problems: where does the agent run, what can it touch, who holds the GitHub token, how do you stop it from rewriting your `.zshrc`, and how do you actually look at what it did before merging?

cpltbox answers all of that by being deliberately, almost suspiciously, small: **an HTTP endpoint that runs Copilot CLI inside a sandbox and hands you back a diff**.

That's it. No magic. No autonomy beyond the task you posted. No silent merges, no surprise dependencies, no shared state between runs. The wisdom is mostly in what cpltbox *doesn't* do.

This guide walks through the design choices and explains why each one matters.

---

## The mental model

```
HTTP POST  →  Cloudflare Worker  →  Ephemeral sandbox
   ↑                                       ↓
   └──────── { logs, diff, exitCode } ─────┘
```

You hand it a repo URL and a task. It spins up an isolated Linux container, clones the repo, runs `copilot -p "..." --allow-all`, and returns the conversation log plus the `git diff`. The sandbox dies. You decide what happens to the diff.

If you've ever wished you could `curl` Copilot, that's the whole product.

---

## Why an HTTP interface at all?

The obvious question: "why not just run Copilot CLI locally?"

Because anything you run on your laptop is **tied to your laptop**. You can't:

- Trigger it from a webhook
- Run ten parallel tasks across ten repos
- Hand it to a teammate who doesn't have Copilot set up locally
- Wire it into a chatops bot, a WordPress plugin, a Slack slash command, or a Notion automation
- Run it from CI without exposing your personal token to CI runners

HTTP turns Copilot into infrastructure. Once it's an endpoint, it composes with everything else you already automate over HTTP. The endpoint is boring on purpose — boring is what makes it composable.

---

## Why a sandbox?

Copilot CLI is invoked with `--allow-all`. Read that flag again. It means the agent can execute arbitrary shell commands, install packages, hit the network, and write files anywhere it has permission to write.

On your laptop, that means your home directory. Your SSH keys. Your other repos. Your dotfiles.

In a Cloudflare Workers Sandbox, it means **a freshly-booted Linux container that owns nothing of value and dies when the task is over**. Worst case, the agent goes rogue, scribbles all over `/tmp`, and... the container is destroyed seconds later. There's no persistent disk to corrupt and no neighboring repo to leak into.

This isn't paranoia. AI agents are not deterministic. Prompt injection through a malicious `README.md`, a poisoned issue body, or a crafted file name is a real attack vector. The right place to run an unsupervised agent is somewhere it can't hurt you.

---

## Why the network is mostly closed

The sandbox disables broad internet egress and allowlists only GitHub and Copilot hosts.

Why this matters:

- **Exfiltration defense.** A compromised or prompt-injected agent can't POST your private code to `evil.example.com` because `evil.example.com` is unreachable.
- **Supply-chain defense.** The agent can't `curl | bash` something nasty from a random domain.
- **Determinism.** A task that secretly depends on fetching from `whatever-blog.dev` will reliably fail rather than producing weird intermittent results.

You give up some flexibility — the agent can't reach arbitrary docs sites or package mirrors outside the allowlist. You get back a security boundary you can actually reason about. Worth it.

---

## Why the GitHub token never lives in the image

`GH_TOKEN` is passed as a per-command environment variable. It is not baked into the Docker image, not written to disk, not present in the container at rest.

This matters because:

- Images get cached, mirrored, and possibly inspected. Tokens baked into images leak. This is one of the most common credential-disclosure bugs in CI/CD.
- A token in an image is a token leaked to anyone who can pull the image.
- A token passed per command exists only for the lifetime of that command's process.

If somebody snapshots the running container or pulls the image, they get a runtime, not a credential.

---

## Why it returns a diff, not a commit

This is the most important design choice in the whole project.

cpltbox does not push. It does not commit. It does not open a PR. It hands you a `git diff` and walks away.

This means:

- **You review before anything lands.** The agent's output is a proposal, not a fact.
- **Bad output is a no-op.** If the diff looks insane, you throw it away and lose nothing.
- **You decide the workflow.** Apply it locally, open a PR through your normal flow, hand it to a human reviewer, feed it to a second AI for critique — whatever your process is, the diff fits into it.
- **Audit trails work.** Logs plus diff equals a complete record of what the agent saw and what it proposed. Reproducible. Forwardable. Reviewable.

Agents that auto-merge are agents you cannot trust. Agents that hand you patches are tools.

---

## Why inputs are validated

Repo URLs, task length (max 8000 chars), PRD length (max 50000 chars), and shell arguments are all validated before anything reaches the sandbox.

The threat is twofold:

1. **Shell injection.** Without validation, a caller could embed shell metacharacters in the task or repo URL and break out of the intended command. The fact that the sandbox limits the blast radius does not excuse leaving the front door open.
2. **Resource abuse.** Without length caps, somebody dumps a 50 MB "task" into the prompt and burns your Copilot quota in a single request.

Validation is unglamorous and easy to skip. cpltbox doesn't skip it.

---

## Why ephemeral sandboxes beat persistent workers

Every task gets a fresh sandbox. No state survives between runs.

The temptation when building this kind of system is to keep a warm worker around for performance. cpltbox doesn't. The cost is a few seconds of cold start. The benefits are large:

- **No cross-task contamination.** Task A can't leak data into Task B.
- **No accumulated cruft.** No half-installed packages, no leftover env vars, no zombie processes.
- **Predictable behavior.** Run the same task twice, get two clean attempts. Not one clean attempt and one mutant.

If you've ever debugged a CI runner that "works on a fresh machine but not on ours," you already know why fresh-every-time is worth the latency.

---

## Why Cloudflare Workers Sandbox specifically

You could build this on a VPS, on Kubernetes, on Fly Machines, on AWS Fargate. The reasons to use Cloudflare's Workers Sandbox SDK:

- **No host OS to patch.** Cloudflare runs the host. You don't.
- **Edge-deployed.** The endpoint is close to the caller, not stranded in one region.
- **Scales horizontally for free.** Ten concurrent tasks spin up ten sandboxes; you don't think about it.
- **Container lifecycle handled.** No orchestrator to manage, no node pool to keep alive, no autoscaler to tune.

The whole thing fits in a Cloudflare Worker plus a Dockerfile. That's the entire operational surface area.

---

## Why a streaming endpoint exists

`/stream` exists so longer tasks aren't a black box. You see output as the agent works, which means:

- You can spot a misfire early and kill it instead of waiting for the timeout.
- Long-running tasks don't look like hung tasks to the caller.
- UIs can render progress instead of a spinner.

The default endpoint returns the whole result in one shot, which is what you want for short tasks. Streaming is the escape hatch.

---

## Why PRDs are first-class

`prdText`, `prdPath`, and `skillPaths` let you attach product-requirements and workflow context to a task. This isn't decoration — it's the difference between "fix the typo" (small, single-shot) and "implement this feature according to this spec" (big, ambiguous, requires shared context).

Inline PRDs (`prdText`) are good for ad-hoc context you don't want to commit. Path-based PRDs (`prdPath`) and skills (`skillPaths`) are good when the spec or workflow guidance lives in the repo and changes alongside the code. They make the agent's task substantially more grounded than "go figure it out."

---

## When to use cpltbox

Good fits:

- Triggering coding tasks from outside a dev machine — issue webhooks, Slack commands, internal tools.
- Running many tasks in parallel — bulk refactors across repos, multi-repo dependency bumps.
- Letting non-developers kick off agent work — they post a task; reviewers receive a diff.
- Reproducible AI experiments — same repo, same task, different models — compare outputs cleanly.
- CI/CD integration where you want an agent's proposal as part of the pipeline.

---

## When not to use cpltbox

Be honest about what it isn't:

- **Not an IDE replacement.** Interactive pair-programming belongs in your editor.
- **Not for tasks that need long-lived state.** Each run starts from scratch by design.
- **Not magic.** If the underlying Copilot model can't do the task, neither can cpltbox.
- **Not for workflows that can't tolerate review latency.** The diff has to be reviewed by someone, and that takes time.

---

## The wisdom in one sentence

cpltbox is wise because it treats an AI coding agent like what it actually is: **a tool that occasionally produces useful patches, running somewhere it can't hurt you, returning artifacts you can audit before they touch anything real**.

Everything else — the HTTP endpoint, the sandbox, the diff-only output, the network allowlist, the per-command token, the input validation, the ephemeral containers — is just the engineering required to make that statement true.
