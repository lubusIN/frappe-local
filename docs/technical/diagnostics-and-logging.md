# Diagnostics and logging

Diagnostics, task logs, runtime logs, and lifecycle analytics answer different questions. They are not interchangeable health signals.

## Diagnostics report

`diagnostics-service.ts` checks application path writability, storage-directory access, Podman health, Compose availability, and network connectivity. Platform checks include the managed machine and engine where relevant. The report summarizes passed, warning, and failed checks and indicates critical issues.

A storage-access check is not a database-consistency audit. A network probe does not prove every app registry or package endpoint is reachable. A healthy engine does not prove an individual Frappe site responds.

Bootstrap runs diagnostics after its background runtime-start attempt. Results are sent to the renderer; users can request another run from Diagnostics. IPC repair handlers dispatch the supported fix for the check type, including runtime setup/start. Fix is not a generic automatic repair of arbitrary app code or databases.

## Logging layers

| Layer | Output |
| --- | --- |
| `createMainLogger(scope)` | Timestamped main-process console messages with scope and level |
| Task runner | Step/progress events plus configured `<logsPath>/tasks/<taskId>.log` files |
| Honcho and Frappe workers | Files within the bench's `logs/` directory |
| Renderer Activity | Task summaries and acknowledgement state persisted in local storage |

The main logger itself writes to console; it does not implement file rotation or automatically save every main-process message to the task-log directory. Task-log persistence is explicit in the task runner. Its renderer stream is throttled, so displayed event volume and file output may differ.

The task-log IPC reader validates task IDs before constructing a log path. Preserve that validation when adding export/read features.

## Investigate an operation

1. Identify the resource and task that failed.
2. Inspect the first failing step and its command/output, not only the last notification.
3. Check the appropriate layer: engine setup, container state, Frappe processes, site database, routing, or certificate trust.
4. Compare recorded resource state with actual runtime state.
5. Apply the narrow repair or retry and inspect its final task outcome.

For example, Caddy returning 502 can mean the route exists while the bench process is unavailable. A successful Podman check does not resolve that distinction. A certificate warning is a separate trust issue.

## Analytics and privacy boundaries

`services/analytics.ts` currently records lifecycle events in an in-memory array: entity ID, operation, and timestamp. That implementation has no network sender or disk persistence. This does not mean the application makes no network requests: updates, catalog sync, Git downloads, image pulls, and dependency installation contact external services.

Logs can contain local paths, repository URLs, and command output. Review and redact sensitive details before attaching them to an issue. Avoid adding broad claims about telemetry or log retention without checking the actual implementation.

## Regression checks

Tests under `tests/main/services/` cover diagnostics, analytics, and the task runner; IPC tests cover report and task-log operations. For platform/runtime changes, also verify an actual failed check produces useful output and the appropriate repair action. See [Testing](./testing).
