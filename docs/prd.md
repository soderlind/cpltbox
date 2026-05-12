# Example PRD: README Improvement

A simple PRD for documentation cleanup tasks.

---

## Goal

Make the README useful for a new developer within 5 minutes of opening the repo.

## Context

The current README is missing setup steps and verification commands.

## Requirements

| Priority | Requirement |
|----------|-------------|
| Must | Add one-sentence project summary at the top |
| Must | Document `npm install` and `npm run dev` |
| Must | Document `npm test` and `npm run typecheck` |
| Must | Keep examples generic — no real tokens or secrets |
| Should | Preserve existing license and attribution sections |
| Should | Keep the README under 100 lines |

## Done When

- [ ] A new contributor can copy-paste the setup commands and run locally
- [ ] No credentials appear in examples
- [ ] Commands match what's in `package.json`
- [ ] Only documentation files are changed

## Out of Scope

- Code changes
- CI configuration
- Adding new dependencies