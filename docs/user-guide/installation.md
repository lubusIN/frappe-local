# Installation

Frappe Local is available for macOS and Windows.

## System Requirements

Frappe benches and app asset builds run inside Linux containers. Apps with large frontend builds may require significantly more memory than a basic Frappe bench.

### Hardware

| Resource | Minimum | Recommended |
| --- | --- | --- |
| Memory | 8 GB RAM | 16 GB RAM for multiple benches or frontend-heavy apps |
| CPU | 4 cores with hardware virtualization | 6 or more cores |
| Storage | 20 GB free SSD space | 40 GB or more for multiple benches and apps |

Systems with less than **8 GB RAM are not supported**.

The recommended container memory is approximately 75% of host RAM, rounded down to whole GiB with a 4 GiB minimum. The applied value can differ if you saved a custom setting; review **Settings → Advanced → Memory**.

### Network

An internet connection is required during initial setup and when installing apps.

Your network must allow access to:

- `quay.io` for the Podman machine image
- `docker.io` for Frappe, MariaDB, and Redis container images
- `frappe-brewery.lubus.in` for the default app catalog
- Frappe and app Git repositories, including `github.com`
- npm, Yarn, Python, and system package registries required by installed apps

Corporate proxies, VPNs, firewalls, or antivirus software may require exceptions for Frappe Local, Podman, WSL, and the required registries.

## macOS

Download the latest `.dmg` from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases). Choose the file matching your Mac architecture:

- **Apple Silicon (M1/M2/M3/...):** `Frappe.Local-*-arm64.dmg`
- **Intel (Core i5/i7/i9/...):** `Frappe.Local-*-x64.dmg`

Open the downloaded `.dmg` and drag **Frappe Local** into the **Applications** folder.

### Unblock Gatekeeper

If macOS blocks an app downloaded from the project's Releases page, try opening it once, then open **System Settings → Privacy & Security** and choose **Open Anyway** when offered. Follow [Apple's instructions for opening an app from an unknown developer](https://support.apple.com/en-ca/guide/mac-help/mh40616/mac).

## Windows

Download the latest `.exe` installer from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases).

### Unblock SmartScreen

For an installer downloaded from the project's Releases page, right-click the file, choose **Properties**, and use **Unblock → Apply** if that option is present. You can also remove its download mark in PowerShell; replace the example with the exact filename you downloaded:

```powershell
Unblock-File -LiteralPath ".\Frappe Local Setup 1.0.0-beta.14 x64.exe"
```

Unblocking a file does not sign it or guarantee that SmartScreen will allow it. Follow your organization's policy on managed devices.

If an installed shortcut is missing or no longer launches, check **Windows Security → Virus & threat protection → Protection history** to see whether the executable was quarantined. Review the detection before restoring anything; see [Microsoft's quarantine guidance](https://learn.microsoft.com/en-us/defender-endpoint/restore-quarantined-files-microsoft-defender-antivirus). The installation directory depends on the installer options, so use the actual location rather than assuming `C:\Program Files\frappe-local`.

## Linux

Linux is not supported yet. [Show your interest and get notified when it's available!](https://lubus.in/frappe-local)

## Next steps

Follow [First steps](./how-to-use) to create a bench, create a site, and sign in. VS Code and its Dev Containers extension are optional; install them only if you want to edit app source through the container workflow.

If setup fails, start with [Troubleshooting](./troubleshooting).
