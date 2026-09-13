# Development

This guide covers contributing to the desktop app. To edit a Frappe app in a managed bench, see [Everyday workflows](../user-guide/daily-work#open-your-workspace-in-vs-code).

## Desktop app prerequisites

Use Node.js 22 and npm to match the repository's release CI. Use macOS or Windows for supported live runtime checks, with hardware virtualization and the [user system requirements](../user-guide/installation).

The desktop code is TypeScript and Vue. You do not need a separate host Bench/Python installation to work on it.

## Run from source

Clone the repository, enter its directory, and install the locked dependencies:

```bash
git clone https://github.com/lubusIN/frappe-local.git
cd frappe-local
npm ci
npm start
```

The install lifecycle runs `scripts/download-binaries.js`, which populates `bin/` with platform runtime tools and the app catalog seed. It requires network access and can take longer than a JavaScript-only install. Skipping install scripts leaves runtime assets unavailable until generated separately.

`npm start` runs Vite with the Electron plugin. `vite.config.ts` configures main, preload, and renderer builds; development output lives under `.vite/`. Use a supported host for end-to-end container operations.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Launch desktop development mode |
| `npm run typecheck` | Check main/shared types and renderer types |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Apply available lint fixes |
| `npm test` | Run the Vitest suite |
| `npm run build` | Type-check and build the application |
| `npm run release` | Build and package with electron-builder; does not publish |
| `npm run docs:dev` | Serve the docs with live updates |
| `npm run docs:build` | Generate production docs and check internal links |
| `npm run docs:preview` | Preview built docs |
| `npm run dev:reset-state` | Destructively reset local Frappe Local state and resources |

See [Bundling](./bundling) for packaged resources and [Releasing](./releasing) for CI behavior.

## Working on Frappe apps

For bench setup and app installation, follow [First steps](../user-guide/how-to-use) and [Managing apps](../user-guide/apps). The [everyday workflow guide](../user-guide/daily-work) covers VS Code, terminals, builds, and migrations.

## Contributing a change

Use the [architecture code map](./architecture#code-map) to find the owning layer. Follow [IPC and tasks](./ipc-and-tasks) for new operations and [Runtime and data](./runtime-and-data) for persistence or container changes.

Keep the user guide aligned with visible labels and behavior. Run checks appropriate to the changed layer and perform live runtime checks for OS/container integration changes. See [Testing](./testing).

## Documentation development

Docs live in `docs/`, with configuration under `docs/.vitepress/`. The shared Frappe UI VitePress theme supplies Espresso layout and components; the docs Tailwind config uses its preset and source content list. Local CSS in `theme/style.css` supplies the code-block foreground fallback for readable plain text in both color modes.

The config imports Frappe UI's Node preset source by relative path so Vite bundles its raw TypeScript. Preserve this workaround until the installed package provides a Node-loadable entry. The shared theme API is version-sensitive, so check a docs build when upgrading Frappe UI.

Add pages to the sidebar and relevant landing-page links. Check light/dark mode and narrow screens after visual changes. Generated `.temp`, cache, build output, timestamped configs, and type declarations are ignored by Git; source Markdown, theme code, and public assets belong in version control.
