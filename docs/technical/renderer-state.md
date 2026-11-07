# Renderer state and synchronization

The renderer combines repository data fetched over IPC, live task events, and local UI state. These sources have different lifetimes; none should be treated as a universal store for the application.

## Data access

`src/renderer/composables/data/` contains bench, site, settings, catalog, and custom-app access. Views consume these composables and controllers rather than implement runtime commands. `useIpc()` returns the preload's typed bridge; if preload is absent, it returns a rejecting bridge with an actionable error instead of pretending operations succeeded.

Opening the Vite renderer in an ordinary browser is therefore not equivalent to launching the Electron app. The UI can render, but privileged features require preload and the main process.

## Progress and completion

`useProgressCenter()` maintains shared task summaries. Its local-storage persistence supports Activity history and acknowledged failures. This history is a renderer convenience, not a durable backend queue. On loading saved history, queued/running summaries become failed interrupted tasks, and cancelling summaries become cancelled. This reconciliation is based on saved renderer state, not a backend replay; after a renderer-only reload, it can label a task interrupted even while main-process work continues.

The main process broadcasts task events to live windows. The current subscribe/unsubscribe IPC methods acknowledge requests; they do not replay a complete task snapshot or create server-side subscription isolation. Preload listener disposal still matters to prevent duplicate local event handling.

`runAndWaitForTask()` executes an action, then finds a completed task matching resource type, resource ID, optional task-name pattern, and creation time. It checks existing summaries before watching for a later update, so quickly completed work can still be found. It distinguishes success, failure, and cancellation.

Changing task names can affect matching patterns in views. There is currently no general timeout in this helper: missing completion events or a mismatched pattern can leave a waiter pending. When adding a flow, verify that its event, resource identity, and completion matching agree.

## Refresh and polling

`useStatusPolling()` loads data on mount and polls while a resource is queued or deletion is in progress. It waits three seconds after a load finishes before the next poll, avoiding overlapping loads within that loop. Polling stops when those conditions clear and on unmount.

Task-derived busy state controls actions alongside persisted resource status. A toast reporting command acceptance is not proof that a background operation completed; final success should follow the matching terminal event and data refresh.

## State ownership

| State | Owner and lifetime |
| --- | --- |
| Bench/site records, settings, app registrations | Main-process repositories and JSON storage |
| Executing task and cancellation signal | Main-process in-memory task runner |
| Task summaries and acknowledged Activity items | Renderer state and local storage |
| Open dialog, current selection, filters | Renderer interaction state |
| Actual engine/container/site availability | Runtime inspection and service checks |

A renderer reload may preserve stored Activity summaries while losing live watchers. A main-process restart loses task execution, even if the renderer still displays historical tasks. Reconcile UI with resource data and diagnostics rather than interpreting history as running work.

## Where to work

Use controllers for wizard validation, data composables for IPC-backed lists/mutations, system composables for progress/health, and UI composables for dialogs and notifications. Tests under `tests/renderer/` cover these boundaries. See [IPC and tasks](./ipc-and-tasks) for the backend contract.
