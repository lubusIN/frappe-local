# Podman and container environments

## Why the app uses Podman

Frappe needs a Linux toolchain and services such as MariaDB and Redis. Podman lets Frappe Local run those dependencies in containers instead of installing their versions into the user's host environment.

A container is a service process with its own filesystem view and configuration. An image is its reusable starting filesystem. A volume persists data independently of a container's process lifetime. Stopping a container is different from deleting its volumes.

On macOS and Windows, those Linux containers run inside a managed Linux machine. Frappe Local identifies its dedicated Podman machine as `frappe-local`. Multiple benches use that machine; each bench gets its own Compose project and service/data resources. It is not one virtual machine per site or bench.

## Podman, Compose, and Docker tooling

Podman supplies the container engine. Compose describes the group of services, mounts, ports, and dependencies belonging to a bench. The app bundles Docker-compatible tooling for Compose/editor integration, but connects it to the managed Podman endpoint.

`getRuntimeEnv()` clears conflicting inherited Docker context settings and resolves the managed socket or named pipe into `DOCKER_HOST`. Windows additionally uses WSL wrappers and Linux-side tools. A developer's Docker Desktop context must not accidentally become the destination for bench commands.

The generated Compose project has a `frappe` service, MariaDB, Redis, and persistent volumes. See [Runtime and data](./runtime-and-data#container-environment) for the exact layout and Windows workspace difference.

## Runtime startup

`ensureRuntimeRunning()` and the runtime-service helpers coordinate machine operations through a lock. The setup flow inspects the dedicated machine, initializes it when missing, starts it when stopped, and waits for the engine to become usable. It also prepares restart behavior and Windows editor support.

The runtime implements targeted recovery for known failures, including stale macOS proxy processes and stuck Windows WSL/SSH connections. Some recovery paths can affect other environments: when the provider reports that only one VM can be active, it attempts to stop `podman-machine-default`; Windows memory changes restart all WSL distributions. Do not describe these operations as entirely isolated from other host workloads.

## Bench startup

A bench operation ensures the runtime is ready, writes the managed Compose configuration, starts services, and runs the required Frappe setup or process commands. MariaDB has a health check; the Frappe container declares service dependencies. Orchestration logs expose the steps instead of treating container creation as proof that the site is ready.

Creating a new bench also initializes the Frappe workspace and then creates the initial site. Adding a site to an existing bench reuses its Frappe code and service stack while creating a separate site database and files.

## Resource and data behavior

Memory is configured at the managed environment level, not per site. Multiple benches compete for the same machine resources. Settings can apply memory changes, which restart the environment; Windows changes apply globally to WSL2.

Stopping a bench retains workspace and database data. Deleting the bench removes its managed containers and volumes. Removing a container process alone is not equivalent to removing a database volume, and copying the host management folder on Windows does not preserve the volume-based workspace.

## Where to change behavior

| Concern | Source |
| --- | --- |
| Machine lifecycle and connection environment | `src/main/services/runtime-service/index.ts` |
| Memory policy and WSL handling | `src/main/services/runtime-service/memory.ts`, `wsl.ts` |
| Compose images, mounts, ports, services | `src/main/utils/podman/bench-compose.ts` |
| Bench lifecycle | `src/main/services/bench-orchestration/` |
| Site commands | `src/main/services/site-orchestration/` |
| Platform binary distribution | `scripts/download-binaries.js` |

Use mocked service tests for command/state behavior and live checks on each affected OS for machine, socket, WSL, and mount changes. See [Testing](./testing).

## Project identity and port allocation

Compose project names are derived as `frappe-local-` plus the first eight characters of the bench ID. Resource naming and editor attachment must use the same helper in `compose-args.ts`; deriving a name independently from the display name can attach to or clean up the wrong project.

Bench creation selects an HTTP port starting at the requested value or 8080. It excludes recorded bench HTTP ports and probes the host for a free TCP port. The probe closes its temporary listener afterward; it does not reserve the port until Compose starts.

For existing benches, `resolveBenchHttpPort()` prefers a valid stored `httpPort`, then legacy `HTTP_PUBLISH_PORT` in the bench's `.env`, then 8080. Routing and generated Compose configuration need to agree on this value.

Socket.IO uses HTTP port + 1000. The current HTTP allocator does not separately reserve or probe this paired port, and a sufficiently high HTTP port can produce an out-of-range derived port. Port conflicts can therefore still fail at Compose startup. Tests for allocation changes should include occupied Socket.IO ports, legacy metadata, and the upper port boundary.

## Windows setup and memory configuration

WSL setup is a host operation, not a command inside an existing bench. `runtime-service/wsl.ts` probes `wsl.exe --status` and performs installation through an elevated PowerShell process. Installation output is written to a temporary log and forwarded into task progress. A successful setup command may still require the user to complete an OS restart before runtime checks pass.

Memory configuration is written to the user's `~/.wslconfig`, under `[wsl2]`, as `memory=<value>MB`. The helper preserves the file's newline style and other sections, replaces an existing memory setting or inserts one, and uses temporary-file rename for the write. This is a shared host configuration file, not a setting scoped to one bench or one WSL distribution.

The memory helper normalizes requests to at least 4096 MB and clamps against host memory; the settings IPC layer separately rejects requests above host capacity. Reading the configured provider can fail, in which case the runtime helper falls back to its minimum. Those rules are distinct from the recommended allocation displayed in the UI.

Test changes with existing `.wslconfig` content, mixed settings, a missing `[wsl2]` section, and unchanged values. Use a disposable Windows environment to verify elevation, restart, and actual memory application; pure configuration tests do not exercise those OS operations.
