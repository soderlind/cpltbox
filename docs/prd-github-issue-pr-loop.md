# Example PRD: GitHub Issue and PR Completion Loop

## Goal

Build an automation workflow that takes a GitHub issue as the source of truth, opens or updates a pull request with the required code changes, responds to review feedback, and continues until the job is complete.

## Problem

Long-running implementation tasks often span issue comments, pull request reviews, CI failures, and follow-up commits. A useful agent should keep the work organized around the original issue, avoid losing reviewer context, and stop only when the issue acceptance criteria and pull request checks are satisfied.

## Users

- Repository maintainers who want a repeatable implementation loop for well-scoped issues.
- Reviewers who need each agent update to explain what changed and what still needs attention.
- Developers who want the final pull request to preserve issue context, test evidence, and review history.

## Inputs

- `repo`: GitHub repository URL.
- `issueNumber`: GitHub issue number to resolve.
- `baseBranch`: target branch for the pull request, defaulting to the repository default branch.
- `workingBranch`: branch name for the agent changes.
- `maxIterations`: maximum issue, PR, review, and CI loop attempts before stopping for human help.
- `requiredChecks`: optional list of CI checks that must pass before completion.

## Functional Requirements

- Read the issue title, body, labels, linked pull requests, and comments before changing code.
- Extract explicit acceptance criteria from the issue and identify missing or ambiguous requirements.
- Create a working branch from the latest base branch when no suitable branch exists.
- Reuse an existing open pull request for the same issue and branch when available.
- Make focused commits that reference the issue number.
- Open a pull request that links the issue, summarizes the approach, lists tests run, and calls out risks.
- After opening or updating the pull request, inspect review comments, requested changes, and CI results.
- Apply requested review fixes when they are in scope and technically safe.
- Rerun relevant tests after each change and update the pull request summary when behavior changes.
- Continue until all issue acceptance criteria are met, required checks pass, and no blocking review requests remain.
- Stop and request human help when requirements conflict, secrets are needed, permissions are missing, CI is unavailable, or `maxIterations` is reached.

## Non-Functional Requirements

- Keep changes minimal and scoped to the issue.
- Do not rewrite unrelated history or force-push over human commits.
- Do not expose tokens, private keys, or secret values in logs, commits, comments, or pull request text.
- Prefer repository test and lint commands already documented in `package.json`, README, or contributor docs.
- Make every status update auditable by linking it back to the issue, pull request, commit, test run, or CI result that caused the decision.

## Completion Criteria

- The pull request is open and linked to the issue.
- The pull request description includes a concise summary, tests run, and remaining risks.
- All explicit issue acceptance criteria are satisfied or marked as intentionally out of scope with a reason.
- Required checks pass or a human-readable blocker is posted.
- Review comments requesting changes are resolved or answered with a clear reason they cannot be resolved automatically.
- The final status clearly says whether the job is done, blocked, or needs human review.

## Example Agent Task

Resolve GitHub issue `#123`. Read the issue, create or update a pull request, respond to review feedback, fix failing checks, and continue until the pull request is ready for maintainer review or a blocker requires human input.