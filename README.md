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

## Supported Platforms

| OS | Status | Architecture | Details |
| :--- | :---: | :--- | :--- |
| ![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white) | ✅ Supported | Apple Silicon & Intel (with virtualization) | [Install Guide](#macos) |
| ![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white) | ✅ Supported | 64-bit (with hardware virtualization)* | [Install Guide](#windows) |
| ![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black) | 🚧 Coming Soon | - | [Get Notified](https://lubus.in/frappe-local) |

*\* Frappe Local detects whether WSL2 and Virtual Machine Platform are configured and provides an in-app setup flow when required.*

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

Download the latest `.dmg` from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases). Choose the file matching your Mac architecture:

- **Apple Silicon (M1/M2/M3/...):** `Frappe.Local-*-arm64.dmg`
- **Intel (Core i5/i7/i9/...):** `Frappe.Local-*-x64.dmg`

Open the downloaded `.dmg` and drag **Frappe Local** into the **Applications** folder.

#### Unblock Gatekeeper

Because the app is not currently signed with an Apple-trusted developer certificate, macOS may block it from opening. Open Terminal and run:

```shell
xattr -rds com.apple.quarantine /Applications/Frappe\ Local.app
```
This removes the macOS quarantine attribute, allowing Frappe Local to open normally.

### Windows

Download the latest `.exe` installer from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases).

#### Unblock SmartScreen

Because the installer is not currently digitally signed, Windows SmartScreen may block it. Open PowerShell in your Downloads folder and run (replacing the filename if necessary):

```powershell
Unblock-File -Path ".\Frappe Local Setup-*.exe"
```
This removes the **Mark of the Web**. Alternatively: Right-click the installer > **Properties** > check **Unblock** > **Apply**.

> [!WARNING]
> Windows Defender may still quarantine the extracted `.exe` after installation.
> If the desktop shortcut shows a blank icon or a **Missing Shortcut** error, add an exclusion for `C:\Program Files\frappe-local` and run the installer again.

### Linux

Linux is not supported yet. [Show your interest and get notified when it's available!](https://lubus.in/frappe-local)

## First Bench Creation

Creating your first bench initializes a dedicated Podman virtual machine and downloads its Linux image from `quay.io`. This may take several minutes. Keep Frappe Local open until setup completes.

If setup fails: Open **Diagnostics**, run the checks, and use **Fix** where available. Diagnostic errors include the underlying Podman output to help identify issues like blocked downloads, Gatekeeper restrictions, or missing virtualization components.

## Local HTTPS

Frappe Local uses Caddy to provide HTTPS for `*.localhost` sites. On first use, your OS may ask for permission to trust the Frappe Local certificate authority. If denied or unavailable, Frappe Local automatically falls back to HTTP to avoid invalid certificate errors.

## Development

### Tech Stack

- Electron + Electron Forge
- Vue 3 + Vite
- TypeScript
- Frappe UI + Tailwind CSS
- Podman - dedicated VM for Frappe containers
- Caddy - local HTTPS reverse proxy

### Prerequisites

- Node.js (tested with v22)
- npm

### Getting Started

```bash
npm install
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

## More Frappe Tools

Explore more open-source tools we're building for the Frappe ecosystem.

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/lubusIN/frappe-playground">
        <img src="https://raw.githubusercontent.com/lubusIN/frappe-playground/main/.github/logo.svg" alt="Frappe Playground" height="60">
      </a>
      <br>
      Run Frappe entirely in your browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/lubusIN/frappe-brewery">
        <img src="https://raw.githubusercontent.com/lubusIN/frappe-brewery/main/.github/assets/logo.svg" alt="Frappe Brewery" height="60">
      </a>
      <br>
      Discover community-built apps for Frappe.
    </td>
  </tr>

  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/lubusIN/frappe-vault">
        <img src="https://raw.githubusercontent.com/lubusIN/frappe-vault/main/.github/assets/logo.svg" alt="Frappe Vault" height="60">
      </a>
      <br>
      Manage secrets and passwords with Frappe.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/lubusIN/wp-frappe-data-store">
        <img src="https://raw.githubusercontent.com/lubusIN/wp-frappe-data-store/main/.github/assets/logo.svg" alt="WP Frappe Data Store" height="60">
      </a>
      <br>
      Connect WordPress and Frappe with a React data store.
    </td>
  </tr>
</table>

[Explore all LUBUS projects →](https://github.com/lubusIN)

## Meet Your Artisans

[LUBUS](https://lubus.in/?utm_source=github&utm_medium=open-source&utm_campaign=frappe-local) is a web design agency based in Mumbai.

<a href="https://cal.com/lubus">
<img src="https://raw.githubusercontent.com/lubusIN/.github/refs/heads/main/profile/banner.png" />
</a>

## License

Frappe Local is open-sourced licensed under the [MIT License](LICENSE).
