# Frappe Cafe

Frappe Cafe is a desktop app for managing local Frappe development environments with a visual workflow.

Current stack:
- Electron + Electron Forge
- Vue 3 + Vite
- TypeScript

## Status

The project is under active incremental build-out using phase/checkpoint execution from the planning docs in `docs/planning`.

Implemented so far:
- Electron/Vite scaffold
- Primary navigation shell and placeholder pages
- Typed preload bridge + IPC smoke flow
- Baseline quality automation (lint/typecheck/test/build)
- Startup logging and runtime path stubs

## Getting Started

Prerequisites:
- Node.js (tested with Node 24)
- npm

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm start
```

Run quality checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Run combined precommit checks:

```bash
npm run precommit:check
```

## Scripts

- `npm start` - launch Electron app in development mode
- `npm run lint` - run ESLint
- `npm run lint:fix` - auto-fix lint issues where possible
- `npm run typecheck` - run TypeScript checks
- `npm run test` - run Vitest suite
- `npm run build` - package app with Electron Forge
- `npm run precommit:check` - run lint, typecheck, and tests

## Project Structure

- `src/main` - Electron main process
- `src/preload` - preload bridge
- `src/renderer` - Vue renderer app
- `src/shared` - shared contracts/types between processes
- `tests` - unit/integration tests
- `docs/planning` - PRD and phase execution plans

## Planning and Execution

Execution references:
- `docs/planning/EXECUTION_PLAN.md`
- `docs/planning/EXECUTION_TRACKER.md`

The implementation follows small, validated checkpoints with manual commit approval before each commit.

## Release Documentation

- docs/PACKAGING.md
- docs/release/SETUP_GUIDE.md
- docs/release/TROUBLESHOOTING.md
- docs/release/RELEASE_NOTES_TEMPLATE.md
- docs/release/CHANGELOG_PROCESS.md
- docs/release/QA_CHECKLIST.md
- docs/release/RC_VALIDATION_REPORT.md
- docs/release/PHASE_11_CLOSURE_REPORT.md
- docs/release/RC_PREPARATION_NOTES.md
