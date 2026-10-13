# Command execution and editor integration

## Host commands and container commands

`src/main/utils/exec.ts` provides `execPromise()`, which spawns a command with an argument array and `shell: false`. It supplies an enhanced PATH, optional runtime environment, output handling, and cancellation/timeouts.

Host-side invocation and container-side invocation are separate layers. A Compose command can itself execute `sh -c` inside the container. Consequently, using argument arrays for the outer process does not make interpolated inner-shell text safe. Validate names and paths and follow the existing quoting helpers when composing commands.

Use `getBinaryPath()` for packaged executables and `getRuntimeEnv()` for Podman connection settings. Avoid assuming a user's shell PATH or Docker context matches the app's environment.

## Timeouts and cancellation

The execution helper supports an idle timeout for commands that stop producing output and a wall-clock timeout for commands that keep printing but never finish. Call sites choose limits from constants or operation-specific settings. Timeout errors include command/output context useful for diagnostics.

Unless explicitly overridden, commands inherit the active task's abort signal through async-local state. Cancellation terminates the child, with process-group handling on supported platforms and forced termination as a fallback. The execution helper's return code still matters: services must check nonzero results and decide whether the step failed or is an expected best-effort operation.

Do not log secrets into command arguments or output deliberately. Error messages can contain command text and output tails, and task logs may later be shared by users.

## Frappe processes inside the container

The `frappe` Compose service starts with a long-lived container command; a running container alone does not mean the Frappe web server is running. Orchestration writes a managed `Procfile` and starts its processes with Honcho.

| Process | Responsibility |
| --- | --- |
| `web` | `bench serve` on port 8000 with proxy support |
| `socketio` | Frappe's Socket.IO server on port 9000 |
| `watch` | Frontend asset watching |
| `schedule` | Scheduled Frappe work |
| `worker` | Background jobs, with worker output in bench logs |

Redis and MariaDB are separate Compose services. Restarting bench processes terminates the old Honcho process and launches a new detached Honcho run, writing `logs/honcho.log`. The helper waits briefly afterward; it is not a comprehensive test that every site or worker is healthy.

The managed Procfile is written to the host workspace on macOS and through a container command on Windows. Edit its generator in `bench-orchestration/utils.ts` for lasting behavior changes.

## VS Code Dev Containers

`ensureBenchDevcontainer()` generates `.devcontainer/devcontainer.json`, a Compose project-name overlay, executable wrappers, and related VS Code settings in the bench's host management directory.

The configuration points to the existing `frappe` service at `/workspace`, chooses `/workspace/env/bin/python`, and declares useful editor extensions. Its `shutdownAction` is `none`: closing VS Code must not stop the bench's database and services. Frappe Local owns that lifecycle.

The Compose overlay preserves the bench's project identity so the editor attaches to the intended environment. Wrappers connect the editor's Docker-compatible commands to bundled tooling and the managed runtime. Windows uses additional WSL handling and disables the extra user-environment probe to avoid attachment issues.

The editor launcher constructs a Dev Container folder URI. Opening a host folder and attaching to the managed container are distinct operations; on Windows the real workspace is a named volume.

## Source and verification

Changes typically touch `exec.ts`, `terminal.ts`, `compose-args.ts`, or `bench-orchestration/utils.ts`. Run utility/service tests, then verify terminal launch and editor attachment on the affected platform. Confirm that closing the editor leaves a running site's services available.
