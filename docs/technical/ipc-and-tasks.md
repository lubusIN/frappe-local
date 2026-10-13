# IPC and background tasks

## Command flow

A typical mutation follows this path:

1. A renderer controller or composable constructs input from the UI.
2. A method on `window.frappeLocal` invokes a channel declared in `src/shared/core/ipc.ts`.
3. The main-process handler checks input and resource state, records a queued state where appropriate, and schedules work.
4. An orchestration service runs commands through the task runner and updates repositories.
5. Progress events update the renderer; data composables refresh the final resource state.

The IPC response may acknowledge or return a queued resource before its operation finishes. The renderer must wait for task completion before reporting success. Existing helpers such as `waitForTask`, `useResourceTaskState`, and progress-center composables implement this distinction.

## Task runner

`src/main/services/task-runner.ts` maintains an in-memory queue with one active task at a time. Task definitions include a name, resource context, an asynchronous operation, and optional cancellation behavior.

The execution context provides step start/completion, structured logging, cancellation checks, and an abort signal. Commands should participate in cancellation using the existing execution utilities. Some tasks delay cancellation or disable it; do not add a UI cancel control that ignores those restrictions.

Progress subscribers receive task and step events. Log emission is throttled to avoid overwhelming the renderer, while configured task log files provide fuller output. The queue is not a durable job scheduler: a process restart does not resume JavaScript execution from the interrupted step.

## Failure and restart behavior

Services must update resource state on success and failure, and account for partial work such as a created directory, downloaded app, or initialized database. Storage bootstrap reconciles interrupted lifecycle states on the next launch. Reconciliation repairs recorded state; it is not a replay or rollback of every shell command.

Deletion and cleanup need their own failure handling. Do not equate removal of a metadata row with successful removal of containers, volumes, or site data.

## Add an operation

1. Define or update the channel and bridge/request/response types in `src/shared/core/`.
2. Add the preload method in `src/main/preload.ts`. Event subscriptions must return an unsubscribe function.
3. Add the appropriate handler in `src/main/ipc/`, with validation and resource-state checks.
4. Put host/runtime work in a service; use repositories for persisted metadata.
5. For long operations, enqueue a task with resource context and useful progress steps.
6. Connect the renderer through its data/system composables, including completion and error handling.
7. Cover the IPC contract, service behavior, and meaningful failure paths in tests.

Useful examples include `src/main/ipc/sites.ts`, `src/main/services/site-orchestration/index.ts`, and `tests/main/ipc/ipc-roundtrip.test.ts`.

## Verification

Test invalid inputs, missing resources, a resource already queued, command failure, and final state transitions. For cancellable work, check cancellation and cleanup. Avoid mocking away the behavior the test is intended to verify; the existing service tests supply controllable runtime and repository dependencies.

See [Testing](./testing) for commands and the boundary between automated tests and live runtime checks.
