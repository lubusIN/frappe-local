# Bundling and distribution

Frappe Local packages the desktop application and runtime tools. A user's benches, site databases, and downloaded app source are created separately at runtime.

## Build pipeline

```text
npm ci
  → JavaScript dependencies
  → postinstall: scripts/download-binaries.js
  → platform tools and catalog in bin/

npm run build
  → TypeScript checks
  → Vite: main + preload + renderer
  → .vite/

npm run release
  → application build
  → electron-builder --publish never
  → release-artifacts/
```

The download script selects assets using the build host's OS and CPU architecture. This is why release CI builds each architecture on a matching runner. Reusing another platform's `bin/` directory can package the wrong executable even if the JavaScript builds successfully.

## JavaScript and UI bundles

`vite.config.ts` uses `vite-plugin-electron/simple` for the main process and preload, alongside Vue's renderer build.

| Input | Output |
| --- | --- |
| `src/main/main.ts` | `.vite/build/` main-process bundle |
| `src/main/preload.ts` | `.vite/build/` preload bundle |
| `src/renderer/index.html` and Vue application | `.vite/renderer/main_window/` assets |

Electron and Node built-in modules are external to the main/preload bundles. Electron supplies those APIs at runtime. The renderer uses the preload bridge for privileged operations. Vite also injects the package version as `__APP_VERSION__`.

Development loads the renderer from Vite; packaged builds load generated assets. The package's entry point is `.vite/build/main.js`.

## Bundled tools

`npm ci` and `npm install` run `scripts/download-binaries.js` through `postinstall`. The script downloads or copies:

| Asset | Role |
| --- | --- |
| Podman and platform helpers | Control the managed container engine/machine |
| Docker Compose executable | Interpret generated Compose projects against Podman |
| Caddy | Serve local site addresses and terminate TLS |
| Embedded Git from `dugite` | Host-side Git operations without requiring host Git |
| `apps.json` and catalog processing output | Seed app discovery |
| Windows Linux-side CLI/Compose and shell wrappers | Connect WSL/container tooling to the managed environment |

On macOS the script extracts the Podman package, copies the executable/helpers, and writes a wrapper. On Windows it includes additional Linux-side binaries and WSL shell integration. Versions and download URLs are maintained in the script.

These downloaded tools are build inputs, not generated Frappe environments. `bin/` is excluded from Git and included in the distributable through electron-builder's `extraResources`.

## Machine image versus container images

A **machine image** boots the Linux environment needed by Podman on macOS/Windows. A **container image** supplies a service such as the Frappe development environment or MariaDB inside that environment.

Machine-image bundling is opt-in to avoid making every install large. The download script accepts `PODMAN_MACHINE_IMAGE_PATH` pointing to an existing local image. Alternatively, `BUNDLE_PODMAN_MACHINE_IMAGE=1` searches known local Podman machine caches. If found, the image is copied into `bin/` with a `podman-machine-image` basename.

Normal builds do not guarantee a bundled machine image. First-use setup may therefore download one. Container images, app repositories, and package dependencies are also obtained during environment creation or app installation. Bundling a machine image alone does not make setup fully offline.

## Installed resource paths

Electron-builder includes `.vite/**/*` and `package.json`, and copies `bin/` and the application icon as extra resources. `getBinaryPath()` in `src/main/utils/binaries.ts` resolves tools from:

- Development: `<app checkout>/bin/`.
- Packaged app: `<process.resourcesPath>/bin/`.

It appends `.exe` where needed on Windows. Services should use this helper rather than assume the current working directory or a system-installed tool.

Generated benches and mutable application metadata belong outside these packaged resources. See [Runtime and data](./runtime-and-data).

## What to verify after changing bundling

Check a clean install's download step, target architecture, executable permissions/helpers, packaged resource layout, and a first-run bench creation. A Vite build alone cannot detect a missing Podman helper or incorrectly packaged executable.

For installer targets, workflow triggers, update manifests, and known channel gaps, see [Releasing](./releasing). The VitePress documentation is a separate build and is not included by the desktop package's `.vite` file glob.
