# Local Bench

Local Bench is a desktop app for managing local Frappe development environments with a visual workflow.

Current stack:
- Electron + Electron Forge
- Vue 3 + Vite
- TypeScript

## Status

> [!CAUTION]
> Project is currently experimental and under active development.

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

### UI consistency rule: ###
- Do not apply `class` or `style` directly on `TextInput` components.
- Use Frappe UI props (`variant`, `size`, `disabled`) and wrapper containers for layout.
- Do not use native `<input>`, `<textarea>`, or `<select>` in renderer Vue templates.
- Use Frappe UI components (for example `TextInput`, `Select`) instead.
- Do not style input internals via deep selectors (for example `:deep(input...)` or `::v-deep ... input`).
- Do not add global CSS selectors for `input`, `textarea`, or `select` in `src/renderer/styles.css`.
- This is enforced by `npm run precommit:check`.

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
- `src/preload` - preload bridge
- `src/renderer` - Vue renderer app
- `src/shared` - shared contracts/types between processes
- `tests` - unit/integration tests
