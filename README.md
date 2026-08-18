<p align="center"><img width="160" src=".github/assets/logo.svg"></p>

<img src=".github/assets/banner.png" />

[![Release](https://github.com/lubusIN/frappe-local/actions/workflows/release.yml/badge.svg)](https://github.com/lubusIN/frappe-local/actions/workflows/release.yml) [![Dev Rolling Build](https://github.com/lubusIN/frappe-local/actions/workflows/dev.yml/badge.svg)](https://github.com/lubusIN/frappe-local/actions/workflows/dev.yml)

# Frappe Local

Frappe Local is a cross-platform desktop app for creating and managing local Frappe benches and sites visually - without dependency management, or terminal commands.

## Status

> [!CAUTION]
> Frappe Local is currently under active development.

## Features

- Create and manage local Frappe benches visually
- Create and manage Frappe sites without terminal commands
- Install and manage Frappe apps
- Run Frappe workloads inside managed Linux containers
- Automatic local HTTPS using Caddy
- Built-in diagnostics and setup assistance
- Open projects directly in Visual Studio Code Dev Containers
- Cross-platform support for macOS and Windows

## System Requirements

Frappe benches and app asset builds run inside Linux containers. Apps with large frontend builds may require significantly more memory than a basic Frappe bench.

### Hardware

| Resource | Minimum | Recommended |
| --- | --- | --- |
| Memory | 8 GB RAM | 16 GB RAM for multiple benches or frontend-heavy apps |
| CPU | 4 cores with hardware virtualization | 6 or more cores |
| Storage | 20 GB free SSD space | 40 GB or more for multiple benches and apps |

Systems with less than **8 GB RAM are not supported**.

On macOS and Windows, Frappe Local configures its container environment to use approximately 75% of host memory while leaving memory available for the operating system.

### Platform

- **macOS:** Apple Silicon or Intel Mac with hardware virtualization support.
- **Windows:** 64-bit Windows with hardware virtualization support. Frappe Local detects whether WSL2 and Virtual Machine Platform are configured and provides an in-app setup flow when required.

### Network

An internet connection is required during initial setup and when installing apps.

Your network must allow access to:

- `quay.io` for the Podman machine image
- Frappe and app Git repositories, including `github.com`
- npm, Yarn, Python, and system package registries required by installed apps

Corporate proxies, VPNs, firewalls, or antivirus software may require exceptions for Frappe Local, Podman, WSL, and the required registries.

### Optional Development Tools

- Visual Studio Code with the **Dev Containers** extension is required only for the **Open in Dev Container** feature.
- Git and other Frappe build dependencies run inside the managed container and do not need to be installed separately on the host.

## Installation

### macOS

#### Download

Download the latest `.dmg` from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases). Choose the file matching your Mac architecture:

- **Apple Silicon (M1/M2/M3/...):** `Frappe.Local-*-arm64.dmg`
- **Intel (Core i5/i7/i9/...):** `Frappe.Local-*-x64.dmg`

Open the downloaded `.dmg` and drag **Frappe Local** into the **Applications** folder.

#### Unblock Gatekeeper

App is not currently signed by an Apple-trusted developer certificate, macOS may block it from opening. Open Terminal and run:

```shell
xattr -rds com.apple.quarantine /Applications/Frappe\ Local.app
```
This removes the quarantine attribute added by macOS. You should then be able to open Frappe Local normally.

### Windows

#### Download

Download the latest `.exe` installer from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases).

#### Unblock Windows SmartScreen

Because Frappe Local is not currently digitally signed, Windows SmartScreen may block the installer. Open PowerShell in your Downloads folder and run the following command, replacing the filename if necessary:

```powershell
Unblock-File -Path ".\Frappe Local Setup-*.exe"
```
This removes the **Mark of the Web** from the installer.

Alternatively:

1. Right-click the installer.
2. Select **Properties**.
3. Check **Unblock**.
4. Click **Apply**.

> [!WARNING]
> Windows Defender Antivirus may still quarantine the extracted `.exe` after installation.
> If the desktop shortcut shows a blank white icon or displays a **Missing Shortcut** error, add an exclusion for:
> `C:\Program Files\frappe-local`
> Then run the installer again.

## First Bench Creation

Creating your first bench on macOS or Windows initializes a dedicated Podman virtual machine and downloads its Linux image from `quay.io`.

Depending on your internet connection, this may take several minutes. Keep Frappe Local open until setup completes.

If setup fails:

1. Open **Diagnostics**.
2. Run the available checks.
3. Use **Fix** where available.

Diagnostic errors include the underlying Podman output to help identify issues such as blocked downloads, Gatekeeper restrictions, or missing virtualization components.

## Local HTTPS

Frappe Local uses Caddy to provide HTTPS for `*.localhost` sites. On first use, macOS or Windows may ask for permission to trust the Frappe Local certificate authority. If permission is denied or the system trust store is unavailable, Frappe Local automatically falls back to HTTP rather than opening the site with an invalid certificate.

## Development

### Tech Stack

- Electron + Electron Forge
- Vue 3 + Vite
- TypeScript
- Frappe UI + Tailwind CSS
- Podman - dedicated VM for Frappe containers
- Caddy - local HTTPS reverse proxy

### Prerequisites

- Node.js - tested with Node 22
- npm

### Getting Started
#### Install dependencies:

```bash
npm install
```

#### Run in development:

```bash
npm start
```

### App Catalog

Frappe Local dynamically fetches its list of available Frappe apps from [Frappe Brewery](https://frappe-brewery.lubus.in/).

Registry:

```text
https://frappe-brewery.lubus.in/index/apps.json
```

The registry is automatically downloaded into the `bin/` directory as a build asset during `npm install` and parsed at runtime. The generated registry file is excluded from version control.

## Scripts

- `npm start` - launch Electron app in development mode
- `npm run lint` - run ESLint
- `npm run lint:fix` - auto-fix lint issues where possible
- `npm run typecheck` - run TypeScript checks
- `npm run test` - run Vitest suite
- `npm run release` - build and validate platform release artifacts
- `npm run icons:generate` - auto-generate platform icons
- `npm run dev:reset-state` - factory reset development environment

## Project Structure

- `src/main` - Electron main process
- `src/main/preload.ts` - preload bridge
- `src/renderer` - Vue renderer app
- `src/shared` - shared contracts/types between processes
- `tests` - unit/integration tests

## Meet Your Artisans

[LUBUS](https://lubus.in/?utm_source=github&utm_medium=open-source&utm_campaign=frappe-local) is a web design agency based in Mumbai.

<a href="https://cal.com/lubus">
<img src="https://raw.githubusercontent.com/lubusIN/.github/refs/heads/main/profile/banner.png" />
</a>

## License

Frappe Local is open-sourced licensed under the [MIT License](LICENSE).
