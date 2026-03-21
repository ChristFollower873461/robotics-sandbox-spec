# Contributing

Thanks for contributing. This repo is intentionally small, so changes should stay focused and easy to review.

## Local workflow

1. Use Node.js 20+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run verification before opening a PR:

   ```bash
   npm run verify
   ```

## Scope guardrails

- Keep core robotics math (`src/core/`) decoupled from UI helpers (`src/ui/`).
- Prefer small, explicit modules over framework-heavy abstractions.
- Do not add fake capabilities; only document behavior that exists in code.

## Pull request expectations

- Include a short summary of what changed and why.
- Add or update tests when behavior changes.
- Keep README/docs accurate when commands, structure, or limitations change.
