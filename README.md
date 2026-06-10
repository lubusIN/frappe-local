# Local Bench

Local Bench is a cross-platform desktop app that lets anyone create local Frappe benches and sites visually without Docker setup, dependency management, or terminal commands.

<img src=".github/assets/local-bench-banner.jpg" />

## Status

> [!CAUTION]
> Project is currently experimental and under active development.

## Installation

### macOS

#### Download
Download the latest release .dmg directly from the from [releases](https://github.com/lubusIN/local-bench/releases). After download open and drag the app to the applications folder.

#### Unblock Gatekeeper
Apple blocks apps not from Mac App Store or signed by trusted developers. Open terminal and run the following command:

```shell
xattr -rd com.apple.quarantine /Applications/Local\ Bench.app
```
this will remove the quarantine attribute from the app and you can open it normally.

## First Bench Creation

The first bench creation on MaCOS or Windows initializes a dedicated Podman virtual machine and downloads its Linux image from `quay.io`. Depending on the connection, this can take several minutes. Keep Local Bench open until setup completes.

If setup fails, open **Diagnostics**, run the checks, and use **Fix**. The diagnostic error includes the underlying Podman output, such as blocked downloads, Gatekeeper restrictions, or missing VM helpers.

## Local HTTPS

Local Bench uses Caddy to provide HTTPS for `*.localhost` sites. On first use, macOS or Windows may ask for permission to trust the Local Bench certificate authority. If permission is denied or the trust store is unavailable, Local Bench uses HTTP automatically instead of opening a site with an invalid certificate.

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
- `npm run make` - create platform distributables
- `npm run artifacts:validate` - validate packaged archives and runtime binaries
- `npm run precommit:check` - run lint, typecheck, and tests

## Project Structure

- `src/main` - Electron main process
- `src/main/preload.ts` - preload bridge
- `src/renderer` - Vue renderer app
- `src/shared` - shared contracts/types between processes
- `tests` - unit/integration tests

## Meet Your Artisans

[LUBUS](https://lubus.in/?utm_source=github&utm_medium=open-source&utm_campaign=local-bench) is a web design agency based in Mumbai.

<a href="https://cal.com/lubus">
<img src="https://raw.githubusercontent.com/lubusIN/.github/refs/heads/main/profile/banner.png" />
</a>

## License

Local bench is open-sourced licensed under the [MIT License](LICENSE).
