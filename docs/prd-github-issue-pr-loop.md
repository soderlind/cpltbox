# Example PRD: Issue-to-PR Loop

A workflow PRD for resolving a GitHub issue through implementation, review, and CI until done.

---

## Goal

Resolve a GitHub issue by opening a PR, responding to feedback, fixing CI, and continuing until the work is complete or blocked.

## Workflow

```
┌─────────────┐
│ Read issue  │
└──────┬──────┘
       ▼
┌─────────────┐
│ Branch + PR │
└──────┬──────┘
       ▼
┌─────────────┐     ┌──────────┐
│ Implement   │────▶│ Run tests│
└──────┬──────┘     └────┬─────┘
       │                 │
       ▼                 ▼
┌─────────────┐     ┌──────────┐
│ Push + wait │────▶│ Check CI │
└──────┬──────┘     └────┬─────┘
       │                 │
       ▼                 ▼
┌─────────────────────────────┐
│ Review feedback? Fix + loop │
└──────────────┬──────────────┘
               ▼
       ┌──────────────┐
       │ Done/Blocked │
       └──────────────┘
```

## Requirements

### Before coding

- Read issue title, body, labels, and comments
- Identify acceptance criteria (ask if unclear)
- Check for existing PRs on the same issue

### Commits and PRs

- Create a branch from the default branch
- Make focused commits referencing the issue (`#123`)
- Open a PR that links the issue and summarizes the approach
- List tests run and flag risks in the PR description

### Review loop

- After each push, check review comments and CI results
- Apply reviewer requests that are in scope and safe
- Re-run tests after changes
- Update PR description when behavior changes

### Stop conditions

| Condition | Action |
|-----------|--------|
| All acceptance criteria met, CI green, no blocking reviews | **Done** |
| Requirements conflict or are ambiguous | Stop, post question |
| Secrets or permissions needed | Stop, request help |
| CI unavailable or flaky | Stop, note blocker |
| Max iterations reached | Stop, summarize status |

## Constraints

- Keep changes minimal and scoped to the issue
- Never force-push over human commits
- Never expose tokens or secrets in logs, commits, or comments
- Use test/lint commands already in the repo

## Done When

- [ ] PR is open and linked to the issue
- [ ] PR description has summary, tests, and risks
- [ ] Acceptance criteria satisfied or explicitly out-of-scope
- [ ] CI checks pass
- [ ] Review comments resolved or answered
- [ ] Final status is clear: done, blocked, or needs human review

## Example Task

> Resolve issue #123. Read the issue, open or update a PR, respond to review feedback, fix failing checks, and continue until the PR is ready or a blocker requires human input.