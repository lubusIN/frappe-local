# Frappe Local

Create and manage local Frappe benches, sites, and apps from a desktop interface. Frappe workloads run inside managed Linux containers, with local site routing and task diagnostics built in.

[Install Frappe Local](/user-guide/installation) · [View on GitHub](https://github.com/lubusIN/frappe-local)

## Use Frappe Local

Start with [installation](/user-guide/installation) and [your first bench and site](/user-guide/how-to-use).

- [Features](/user-guide/features): see the supported capabilities and platforms.
- [Benches and sites](/user-guide/benches-and-sites): start and stop environments, build assets, run migrations, and understand deletion.
- [Managing apps](/user-guide/apps): install catalog apps or use your own GitHub/local source.
- [Everyday workflows](/user-guide/daily-work): resume work, choose maintenance actions, and open VS Code.
- [Activity and logs](/user-guide/activity): follow progress, copy errors, and cancel tasks.
- [Settings](/user-guide/settings): configure storage defaults, memory, SSH access, appearance, and updates.
- [Troubleshooting](/user-guide/troubleshooting): use logs and diagnostics to resolve setup and runtime failures.

## Develop and contribute

Read [Architecture](/technical/architecture) for the system overview, then [Development](/technical/development) to run the desktop app from source or work on a Frappe app inside a bench.

- [Bundling](/technical/bundling): follow binaries and app bundles from installation to packaging.
- [Podman](/technical/podman) and [Caddy](/technical/caddy): understand the container engine and browser routing.
- [Lifecycle and recovery](/technical/lifecycle): follow startup, operations, failures, and shutdown.
- [IPC and tasks](/technical/ipc-and-tasks): follow commands from the UI through background operations.
- [Renderer state](/technical/renderer-state) and [app installation internals](/technical/app-internals): follow UI synchronization and app setup.
- [Execution and editor integration](/technical/execution-and-editor): understand commands, Frappe processes, and Dev Containers.
- [Diagnostics and logging](/technical/diagnostics-and-logging): locate health checks and operational evidence.
- [Runtime and data](/technical/runtime-and-data): understand containers, proxy routing, persistence, and cleanup.
- [Testing](/technical/testing): choose automated and live runtime checks.
- [Releasing](/technical/releasing): understand packaging, CI, update channels, and current limitations.

---

Released under the MIT License. Copyright © LUBUS.
