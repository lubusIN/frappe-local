# Frappe Local

Run Frappe on your computer and manage your development environments from a desktop app. Create benches and sites, try apps, and open your workspace in VS Code, with task logs and runtime diagnostics in one place.

**Available for macOS and Windows.** Start with [Installation](/user-guide/installation), or go to [First steps](/user-guide/how-to-use) if you already have the app.

![Frappe Local showing a running development bench and its management and workspace controls.](/images/bench-overview.png)

*The bench overview on macOS with example data. Platform-specific actions may differ on Windows.*

## What you can do

Use Frappe Local to try Frappe apps locally, develop your own app, or keep separate environments for different projects. From the app you can:

- Create and manage benches and sites, then open a site in your browser.
- Add catalog apps or register your own GitHub repository or local app folder.
- Start and stop environments, rebuild assets, and run site migrations.
- Open a terminal or VS Code workspace and inspect task output when something fails.

See [Features](/user-guide/features) for the full capability list and links to each guide.

## Understand your environment

A **bench** contains a Frappe version and shared app source code. A **site** belongs to a bench and has its own database and installed apps. Several sites can share one bench.

For example, you can add ERPNext source to a bench, then install it on one of that bench's sites. Adding source to the bench and installing it on a site are separate steps.

Frappe Local manages the Linux containers that run Frappe, Python, Node, MariaDB, and Redis. You do not need to install those tools separately on your computer. Initial setup and app downloads require internet access; see [system requirements](/user-guide/installation#system-requirements) before installing.

These environments are intended for local development and evaluation. Linux is not yet a supported desktop platform, and the app does not configure public production hosting.

## Get your first site running

1. [Install Frappe Local](/user-guide/installation) for your operating system.
2. [Create your first bench and site](/user-guide/how-to-use), wait for setup to finish, then open the site in your browser.
3. [Add an app](/user-guide/apps) to the bench and install it on the site when you are ready to extend it.

First setup can take several minutes while the environment downloads and initializes. Follow [Activity and task logs](/user-guide/activity) to see progress.

## Find the right guide

| I want to… | Start here |
| --- | --- |
| Resume work or open VS Code | [Everyday workflows](/user-guide/daily-work) |
| Start, stop, or maintain an environment | [Benches and sites](/user-guide/benches-and-sites) |
| Install a catalog or custom app | [Managing apps](/user-guide/apps) |
| Change memory, storage defaults, or updates | [Settings](/user-guide/settings) |
| Investigate a failed operation | [Activity and logs](/user-guide/activity), then [Troubleshooting](/user-guide/troubleshooting) |

## Develop and contribute

To work on Frappe Local itself, read [Architecture](/technical/architecture), then follow [Local development](/technical/development) and [Testing](/technical/testing).

The technical guides explain [Podman containers](/technical/podman), [Caddy routing](/technical/caddy), [storage and data](/technical/runtime-and-data), and [background tasks](/technical/ipc-and-tasks). For distribution, start with [Bundling](/technical/bundling) and [Releasing](/technical/releasing).

Find the source, releases, and issue tracker on [GitHub](https://github.com/lubusIN/frappe-local).
