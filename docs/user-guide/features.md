# Features

Frappe Local is a desktop app for local Frappe development and evaluation. It manages benches, sites, and apps on macOS and Windows.

| Feature | What you can do | Guide |
| --- | --- | --- |
| Benches | Create separate Frappe environments; start, stop, restart, and build them | [Benches and sites](./benches-and-sites) |
| Sites | Create sites, open them in a browser, clear caches, and run migrations | [First steps](./how-to-use) |
| Apps | Browse the catalog, add app code to a bench, and install apps on individual sites | [Managing apps](./apps) |
| Custom apps | Register GitHub repositories or local app folders | [Custom apps](./apps#custom-apps) |
| Local HTTPS | Open `.localhost` sites through the managed Caddy proxy | [Local HTTPS](./troubleshooting#local-https-and-browser-access) |
| Development tools | Open a bench terminal or attach VS Code to its container | [Editor workflow](./daily-work#open-your-workspace-in-vs-code) |
| Activity and diagnostics | Follow task progress, inspect logs, and check the container runtime | [Troubleshooting](./troubleshooting) |
| Preferences | Choose storage defaults, appearance, runtime memory, and update channel | [Settings](./settings) |

Frappe, Python, Node, MariaDB, and Redis run inside managed Linux containers. You do not need to install those dependencies on the host to use the app. Initial setup and app downloads require internet access.

The app is under active development. Linux is not yet a supported user platform. These environments use development defaults and are intended for local work, not public production hosting.
