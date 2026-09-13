# Settings

Open **Settings** from the app navigation. Most changes save automatically after a brief pause; watch for an error before closing the dialog. Memory changes use **Apply**, and SSH sharing can request restart confirmation.

## Preferences

| Setting | Purpose |
| --- | --- |
| Default Frappe Version | Preselects a version when creating a new bench |
| Storage Path | Sets the default directory for new benches and sites |
| Terminal | Chooses the terminal application for bench shells; a custom command or binary path is supported |

Changing a default does not move existing benches or upgrade their Frappe version. Existing resources retain their recorded paths and version.

## Appearance

Use the appearance controls to choose the app's color scheme. The documentation website has its own Light, Dark, and System picker; its preference is separate from the desktop app.

## Advanced

**App Registry URL** selects the Frappe Brewery registry used to discover apps. Use **Use Default** to restore the default service.

**Share SSH Keys with Benches** mounts your host `~/.ssh` directory read-only into containers for private repositories. Review the restart confirmation when changing it.

**Memory** controls the memory allocated to the container environment where a managed machine is required. Use **Use recommended** or adjust the slider, then **Apply**. Applying a change restarts the environment. On Windows this applies globally to WSL2 and restarts all running WSL distributions, including distributions used outside Frappe Local.

Finish running tasks and save terminal/editor work before applying a memory change.

## Updates

- **Auto Update** enables or disables automatic downloading. The app still checks for updates during startup in the current implementation; **Check Now** remains available.
- **Update Channel** selects Stable or the rolling Dev build. Dev follows ongoing development and may be less predictable.
- **Check Now** requests an update check. When offered, **Download & Install** begins the update flow.

Desktop app updates are separate from Frappe/app source updates inside a bench. Changing the update channel does not migrate a site's database.

If an update fails or no compatible update is offered, use the installer from [GitHub Releases](https://github.com/lubusIN/frappe-local/releases). The Dev channel may not offer an automatic update when its required update files are missing. In that case, download the desired installer from Releases.
