# Runtime and data

## Container environment

On macOS and Windows, Frappe Local manages a dedicated Podman environment. Windows integration includes WSL setup and command wrappers. Runtime setup, memory policy, and WSL handling live in `src/main/services/runtime-service/`.

A generated Compose project contains:

| Service or volume | Purpose |
| --- | --- |
| `frappe` | Development image and workspace where bench commands and processes run |
| `mariadb` | Database server for the bench's sites |
| `redis` | Redis service used by Frappe |
| `mariadb-data` | Persistent database volume |
| `bench-workspace` on Windows | Workspace volume mounted at `/workspace` |

`src/main/utils/podman/bench-compose.ts` defines image versions, mounts, and port mappings. The Compose file is generated under `<bench>/.frappe-local/docker-compose.yml` and rewritten on bench start. Change its generator to make persistent behavior changes.

On macOS, the host bench directory is mounted at `/workspace`. On Windows, the workspace is a named volume: the host directory contains management files, not a complete copy of container source and site data. This is why the Windows editor action attaches to the container.

Optional local-app mounts and read-only SSH-key mounts are added from app/settings state.

## Browser routing

Each bench exposes HTTP and Socket.IO on allocated host ports bound to `127.0.0.1`. Caddy maps local site hostnames to the appropriate bench. The Socket.IO host port is derived from the bench HTTP port by the Compose generator.

`src/main/services/caddy-front-door/` manages routing and local certificate setup. The service attempts local certificate trust, but a trust failure currently leaves HTTPS enabled and may produce browser warnings. Direct-port HTTP fallback is used when the proxy is unavailable. See [Caddy routing](./caddy) for the exact behavior. Resource changes must refresh proxy hosts so removed or added sites are reflected in routing.

These are local development environments with default database and initial Administrator credentials, not a production deployment configuration.

## Application metadata

`resolveAppRuntimePaths` in `src/main/config.ts` derives the app's user-data, logs, config, and storage directories from Electron. The metadata snapshot is `storage/storage.json` under user data.

The snapshot holds schema version, metadata, benches, sites, settings, catalog entries, and custom apps. `JsonStorageAdapter` serializes operations through a promise queue and writes via a temporary file followed by rename. Repository transactions update this snapshot rather than making unrelated direct file writes.

At bootstrap, the app loads or initializes storage, applies migrations and catalog seeding, and changes interrupted queued resources to failure. The current loader catches both missing-file and read/parse errors and writes a fresh default snapshot; it does not preserve an unreadable snapshot automatically. A future corruption-recovery change should preserve the original file before replacement and include explicit tests. Keep schema migrations and corresponding tests aligned when changing persisted models.

## What to preserve

| Data | Where it lives |
| --- | --- |
| Desktop metadata and preferences | Electron user-data storage/config directories |
| Bench source and site files on macOS | The selected host bench directory |
| Bench source and site files on Windows | The bench workspace volume |
| Frappe database contents | The bench's MariaDB volume |
| Custom local-app source | Its original host directory |
| Operational logs | App log paths and configured task log directory |

Copying `storage.json` alone does not back up a site. Preserving a working environment requires its database and files as well as source changes. The UI currently has no documented end-to-end backup/restore workflow; use Frappe's backup tools from the bench terminal and copy backups out of any volume that may be deleted.

## Destructive operations

Stopping a bench retains persistent data. Site deletion uses `bench drop-site --no-backup` and removes the site directory. Bench deletion removes attached sites, containers, volumes, and the bench directory.

The **Reset Environment** UI and `scripts/reset-dev-state.js` remove environment resources and application state. The reset script uses Frappe Local's application-support locations; it is not guaranteed to be isolated to the Git checkout. Run it only against disposable data after reviewing the script and closing the app.

Deletion is best-effort in several paths: bench deletion can continue to remove records after runtime cleanup is skipped or fails, and site deletion can log command/directory cleanup warnings before removing its record. A disappeared UI entry or completed task is therefore not proof that every database, volume, and directory was removed. Check task warnings and actual resources when investigating leftover data.

Tests should verify cleanup ordering and partial failures without deleting a real developer environment.

## Schema evolution and write guarantees

`schema.ts` declares the current snapshot version; `migrations.ts` provides the migration runner. The current schema is version 1 and the migration list is empty. A newer-than-supported snapshot is rejected. An older snapshot requires a migration starting at its version, otherwise startup throws.

When evolving the format, increment the schema version, add a migration that advances the version, and test representative old snapshots. Test missing migration paths and unsupported future versions as well. A migration must make forward progress; the runner repeatedly follows the current snapshot version until it reaches the target.

The adapter's serialized queue and temporary-file rename coordinate writes within that adapter instance. They do not provide a cross-process lock, a database/filesystem transaction spanning Podman, or a backup history. The desktop app's single-instance lock helps avoid ordinary duplicate launches, but standalone scripts can still mutate storage independently.

## Persisted status meanings

| Resource | Stored statuses | Interpretation |
| --- | --- | --- |
| Bench | `queued`, `running`, `stopped`, `success`, `failure` | Lifecycle metadata; `success` remains accepted by the schema and some readiness guards |
| Site | `queued`, `ready`, `failure` | Site operation state, separate from whether the parent bench is running |

A site can retain `ready` while its bench is stopped. Conversely, `running` metadata is not an HTTP health probe. The shared site-transition rules allow queued to ready/failure, ready to queued/failure, and failure to queued/ready; unchanged status is accepted. Handler-specific guards apply in addition to those shared rules.

Do not remove a status merely because it is not visible in the common UI path. Check persisted data, shared types, IPC mappings, and tests before simplifying the model.

## Reset ordering and partial failure

The reset IPC handler reads recorded benches and evaluates the dedicated machine. On VM platforms it relies on destroying that machine to remove contained resources; on the native-Linux code path it attempts explicit container cleanup. Linux code paths exist even though Linux is not currently a supported user platform.

Reset removes recorded bench folders and also checks managed `benches` directories under user data and the configured storage root for dormant resources. It then attempts forced removal of the dedicated Podman machine, replaces the app's storage/config directories with a fresh seeded snapshot, and refreshes proxy routes.

Several filesystem cleanup failures are logged and processing continues. A machine-removal error is retained and thrown **after** metadata replacement. Thus a failed reset can leave runtime resources behind while desktop records have already been cleared. Conversely, a reported completion should not be interpreted as verification of every best-effort filesystem cleanup.

When investigating reset failure, preserve the original logs and inspect both Podman resources and filesystem paths before retrying. Do not infer that the old environment is intact solely because the reset returned an error. Changes to this flow need tests for ordering and partially successful cleanup, not only the final return value.
