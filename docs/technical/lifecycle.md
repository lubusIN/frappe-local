# Lifecycle and recovery

This page follows startup, user operations, and shutdown through the services described in [Architecture](./architecture).

## Launch and relaunch

Electron initializes the bootstrap context, resolves application paths, loads metadata, registers services/IPC, and creates the renderer. Storage bootstrap applies migrations and changes queued benches/sites to failure, with updated timestamps. It leaves other recorded statuses unchanged. Caddy initialization, runtime startup, and catalog synchronization run in the background rather than blocking window creation. Benches recorded as running have container-readiness checks. The app sets its lifecycle to ready after the runtime attempt, including its failure path; ready is an application lifecycle state, not proof that every service passed diagnostics.

The app can encounter three different truths: recorded metadata, the current Podman resources, and running Frappe processes. Recovery must inspect the relevant layer; a saved `running` state alone is not proof that a site responds.

## Operation ownership

| Operation | Main responsibilities |
| --- | --- |
| Create bench | Validate input, persist queued state, ensure runtime, prepare workspace/Compose, initialize Frappe, schedule initial site |
| Start/restart bench | Ensure runtime and configuration, start/restart services and Frappe processes, update state/routing |
| Create site | Validate parent/name, run site creation in the bench, record outcome, refresh routes |
| Add bench app | Fetch/mount app source and install/build dependencies |
| Install site app | Apply the app to the selected site's database and record outcome |
| Build / migrate / cache | Run the appropriate bench or site command with task progress and errors |
| Delete site/bench | Remove runtime data and resources as appropriate, update metadata and routes |
| Change memory | Apply machine/WSL policy and restart the affected environment |

Handlers and services divide these responsibilities; keep orchestration out of renderer components. [IPC and tasks](./ipc-and-tasks) explains acknowledgement versus completion and the single active task queue.

## Failures, cancellation, and retries

Commands emit step logs and completion/failure events. Services mark failed resources and perform operation-specific cleanup where implemented. Cancellation uses an abort signal, task-specific eligibility, and optional cleanup callbacks. It is not a general transaction rollback for Git, files, containers, and databases.

After a failure, inspect what completed before retrying. Do not assume every operation is idempotent. Site **Reset Status** changes metadata to ready; it does not fix database or process failures. Diagnostics provides checks and targeted fixes; environment reset is the destructive last-resort operation described in [Runtime and data](./runtime-and-data#destructive-operations).

Task execution is in memory. Relaunch reconciles interrupted states but does not resume the previous JavaScript task at its last step. Task logs and resource inspection are needed to determine the next action.

## Close versus quit

Closing the window hides it, and the app remains in the tray. It does not implicitly stop the bench environment.

When quitting with a running runtime, the app offers:

- **Stop Benches & Quit**: shows stopping state, stops the managed runtime, and requests Caddy shutdown on exit.
- **Keep Running & Quit**: leaves the runtime running and skips the explicit Caddy stop path.
- **Cancel**: returns to the app.

The code intends to preserve services for Keep Running; actual process survival and site access should be checked on the target platform. Relaunch has logic to reuse an unchanged managed Caddy process. Do not treat hiding the window, quitting Electron, stopping a bench, and deleting an environment as the same operation.

## Renderer crashes and updates

The main process listens for renderer process termination and reloads the window for unexpected crash reasons. The renderer then reconnects through the preload/data layer; main-process tasks and persisted resource state remain the source of operation status.

Desktop updates are managed by `electron-updater`, separate from Frappe code installation and site migrations. Package/version changes do not automatically upgrade every bench. See [Releasing](./releasing) for channel and manifest limitations.

## Extending behavior safely

For a new operation, define its input checks, affected resources, queued/busy behavior, progress steps, final state, partial-failure cleanup, cancellation policy, and relaunch outcome. Add tests around the meaningful failure boundary and run live platform checks when the change touches machines, volumes, ports, certificates, or installer resources.

This makes the recovery behavior reviewable before the UI exposes the new action.

## Single-instance and settings behavior

Electron requests a single-instance lock. A second launch focuses/restores the existing window; if bootstrap has not created it yet, the app remembers the focus request. This coordinates normal desktop launches, not arbitrary external scripts accessing the same runtime data.

Settings updates are validated and applied through `src/main/ipc/settings.ts` in this order:

1. Parse the partial settings input and reject memory above host capacity.
2. If a nonempty registry URL changed, fetch/validate its catalog before saving.
3. If memory changed, apply the runtime memory operation before persisting settings.
4. Merge defaults, current settings, and the update, then write through the repository.
5. Apply Electron's native theme and reconfigure the updater.
6. Start background catalog synchronization when the registry changed.

This is not one atomic transaction across the runtime, disk, theme, and network. For example, memory may be applied before a later persistence failure, and background catalog synchronization can fail after settings have saved. Tests should cover these boundaries rather than only successful form submission.

SSH sharing has an additional renderer confirmation/restart flow. Saving a boolean alone is not evidence that existing container mounts changed. Trace the settings dialog and SSH composable as well as the Compose generator when changing this feature.

Default settings, persisted settings, and effective runtime settings also differ: schema defaults exist, while startup can choose recommended machine memory when stored settings are absent. Inspect both the settings repository and runtime memory provider when diagnosing first-run behavior.

## SSH sharing across running benches

`useSshKeys()` first lists benches and asks for confirmation when any are recorded as running. Applying the change saves `shareSshKeys`, then requests restart operations for those benches and waits for their task completion. Multiple restart promises can be waiting in the renderer while the backend task runner executes operations serially.

The preference write precedes those restarts. If a restart fails, the preference can already be saved while some existing containers still have the previous mounts. Diagnose saved settings and effective mounts separately; do not report the whole operation as rolled back. Stopped benches receive the new mount configuration when subsequently started.

The mount is the host SSH directory, read-only, rather than an SSH-agent forwarding abstraction. It enables repository access from the environment but does not make metadata extraction, host Git authentication, and container Git authentication identical paths. Check which process failed before changing credentials.
