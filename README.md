# Local Bench

Local Bench is a cross-platform desktop app that lets anyone create local Frappe benches and sites visually without Docker setup, dependency management, or terminal commands.

## Status

> [!CAUTION]
> Project is currently experimental and under active development.

## Installation

Download the latest release for your platform from [releases](https://github.com/lubusIN/local-bench/releases).

## Development

### Tech stack:
- Electron + Electron Forge
- Vue 3 + Vite
- TypeScript
- Frappe UI

### Prerequisites:
- Node.js (tested with Node 24)
- npm

### Getting Started
#### Install dependencies:

```bash
npm install
```

#### Run in development:

```bash
npm start
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
- `src/preload` - preload bridge
- `src/renderer` - Vue renderer app
- `src/shared` - shared contracts/types between processes
- `tests` - unit/integration tests

## UI consistency rule: ##
- Do not apply `class` or `style` directly on `TextInput` components.
- Use Frappe UI props (`variant`, `size`, `disabled`) and wrapper containers for layout.
- Do not use native `<input>`, `<textarea>`, or `<select>` in renderer Vue templates.
- Use Frappe UI components (for example `TextInput`, `Select`) instead.
- Do not style input internals via deep selectors (for example `:deep(input...)` or `::v-deep ... input`).
- Do not add global CSS selectors for `input`, `textarea`, or `select` in `src/renderer/styles.css`.
- This is enforced by `npm run precommit:check`.

## Meet Your Artisans

[LUBUS](https://lubus.in/?utm_source=github&utm_medium=open-source&utm_campaign=local-bench) is a web design agency based in Mumbai.

<a href="https://cal.com/lubus">
<img src="https://raw.githubusercontent.com/lubusIN/.github/refs/heads/main/profile/banner.png" />
</a>

## License

Local bench is open-sourced licensed under the [MIT License](LICENSE).