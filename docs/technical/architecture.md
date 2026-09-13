# Architecture

Frappe Local is an Electron desktop application that orchestrates local Frappe environments. The desktop UI runs on the host; Frappe workloads run in Linux containers.

## System overview

```text
Vue renderer
    │ typed window.frappeLocal methods and progress subscriptions
Electron preload bridge
    │ Electron IPC
Main-process handlers
    ├── repositories → JSON application metadata
    └── task runner → orchestration services
                          ├── Podman / Compose → Frappe + MariaDB + Redis
                          └── Caddy → local site routing

Browser → Caddy → bench HTTP / Socket.IO → site database
```

Desktop commands control environments through IPC, while browser requests reach Frappe through the local proxy. Caddy is coordinated by startup and resource-change callbacks as well as orchestration; it is not itself a queued task.

## Stack

| Layer | Implementation |
| --- | --- |
| Desktop lifecycle | Electron |
| UI | Vue 3, Vue Router, Frappe UI, Tailwind CSS |
| Build | Vite, `vite-plugin-electron`, TypeScript |
| Packaging | `electron-builder`, configured in `package.json` |
| Desktop updates | `electron-updater` |
| Runtime | Podman and Docker Compose tooling |
| Local routing | Caddy |
| App metadata | Versioned JSON snapshot and repositories |
| Tests | Vitest with Electron mocks |
| Documentation | VitePress with Frappe UI's Espresso theme |

## Code map

| Location | Responsibility |
| --- | --- |
| `src/main/main.ts` | Electron windows, application lifecycle, and service wiring |
| `src/main/bootstrap.ts` | Storage and runtime initialization and startup recovery |
| `src/main/preload.ts` | Exposes the typed renderer bridge and event subscriptions |
| `src/main/ipc.ts`, `src/main/ipc/` | Registers command handlers and connects repositories to operations |
| `src/main/services/` | Bench/site orchestration, runtime setup, diagnostics, Caddy, catalog, and tasks |
| `src/main/storage/` | Snapshot adapter, repositories, schema migrations, and state reconciliation |
| `src/main/utils/podman/` | Compose generation, runtime command helpers, and cleanup |
| `src/renderer/views/` | Sites, Benches, My Apps, Activity, and Diagnostics screens |
| `src/renderer/controllers/` | Wizard validation and view-independent interaction logic |
| `src/renderer/composables/` | IPC data access, polling, progress, health, and UI state |
| `src/shared/core/` | IPC channels, bridge contracts, request/response types, runtime errors |
| `src/shared/domain/` | Persisted models and lifecycle, diagnostics, and task types |
| `scripts/` | Binary/catalog download, renderer type checks, development reset |
| `tests/` | Main-process, storage, IPC, and renderer logic coverage |

## Process boundary

The main window enables `contextIsolation` and disables `nodeIntegration`. The preload uses Electron's `contextBridge` to expose `window.frappeLocal`. Renderer components call this bridge instead of directly accessing host files, spawning commands, or importing Electron.

Shared TypeScript contracts describe the API, but types alone do not validate runtime inputs. Main-process handlers remain responsible for checking inputs, resource existence, and lifecycle constraints. New operations should follow the existing validation and queued-resource guards.

Read [IPC and tasks](./ipc-and-tasks) before adding an operation across this boundary.

## Resource model

A bench stores its identity, workspace path, Frappe version, app list, and lifecycle status. A site belongs to a bench and stores its own identity, path, app list, and status. Catalog entries and custom-app registrations are distinct from apps installed in a bench or site.

The JSON snapshot records desktop metadata; it does not contain Frappe database contents. A bench's MariaDB volume holds those databases. See [Runtime and data](./runtime-and-data) before changing storage, deletion, or reset behavior.

## Catalog

The build's download script obtains a Frappe Brewery catalog seed and runtime binaries under `bin/`. Runtime catalog services read and normalize registry metadata; settings allow a different Brewery URL and synchronization. Catalog storage and custom-app registrations use separate repositories.

The default registry is:

```text
https://frappe-brewery.lubus.in/index/apps.json
```

When changing catalog behavior, check `scripts/download-binaries.js`, `src/main/services/catalog-provider.ts`, the app repositories, and renderer compatibility filters together.

## Find the right subsystem

| Question | Start here |
| --- | --- |
| Why does the installed app lack a tool? | [Bundling](./bundling) and `getBinaryPath()` |
| Why is a bench/container running but the site unavailable? | [Execution and editor](./execution-and-editor), then [Caddy](./caddy) |
| Why is the UI stuck waiting after a command? | [Renderer state](./renderer-state) and [IPC/tasks](./ipc-and-tasks) |
| Which data survives stop, delete, or reset? | [Runtime and data](./runtime-and-data) |
| Which settings immediately affect the environment? | [Lifecycle](./lifecycle#single-instance-and-settings-behavior) |
| How are ports and container identities chosen? | [Podman](./podman#project-identity-and-port-allocation) |
| Why does an app exist in the catalog but fail installation? | [App internals](./app-internals) |
| Which evidence should accompany a bug report? | [Diagnostics and logging](./diagnostics-and-logging) |

Implementation limits are documented alongside the relevant behavior. For contributing setup and release work, see [Development](./development), [Testing](./testing), and [Releasing](./releasing).
