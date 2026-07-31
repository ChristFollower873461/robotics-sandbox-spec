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
- Keep source facts, transparent derivations, approximate display proxies, and
  unknown values distinct. Never fill a missing decision field with an
  unsourced plausible number.

## Catalog and adapter contributions

- Every new robot profile needs a matching `robot-decision-catalog/v1` record
  with all eight evidence fields and capability boundaries.
- Sourced fields must cite source IDs already present on the robot profile.
- Update evaluator tests when a new task or finding type changes behavior.
- A new physics/locomotion/flight backend must use a new explicit engine ID and
  follow the adapter checklist in `docs/DECISION_WORKBENCH.md`.
- Do not label a browser proxy Level 3, a successful simulation hardware proof,
  or a project-origin statement a supply-chain guarantee.

## Pull request expectations

- Include a short summary of what changed and why.
- Add or update tests when behavior changes.
- Keep README/docs accurate when commands, structure, or limitations change.
