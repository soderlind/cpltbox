# Example PRD: Repository README Cleanup

## Goal

Improve the repository README so a new developer can understand what the project does, how to run it locally, and how to verify changes.

## User Story

As a developer evaluating this repository, I want the README to explain the project purpose, setup steps, and test commands so I can get productive quickly.

## Requirements

- Add a short project summary near the top of the README.
- Document install and local development commands.
- Document test and typecheck commands.
- Keep examples generic and avoid secrets or real tokens.
- Preserve existing license and attribution sections.

## Acceptance Criteria

- A new contributor can run the documented setup commands successfully.
- README examples do not include private credentials.
- The documented verification commands match `package.json`.
- The final diff only changes documentation files.