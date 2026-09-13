# Releasing Frappe Local

The current release pipeline uses **electron-builder**, configured in `package.json`, and **electron-updater** in `src/main/updater.ts`.

## Build locally

From a checkout with dependencies installed:

```bash
npm run typecheck
npm test
npm run release
```

`npm run release` runs the application build and `electron-builder --publish never`. Output goes to `release-artifacts/`. The local command packages for the host and configured targets; CI supplies the platform matrix. This command does not create or publish a GitHub release.

The builder includes `.vite` output, `package.json`, bundled `bin/` resources, and the application icon. macOS targets ZIP/DMG, Windows targets NSIS/ZIP, and Linux targets DEB/RPM/ZIP. Linux artifacts in CI do not imply supported Linux runtime behavior for end users.

## Release workflow

`.github/workflows/release.yml` runs when a GitHub release is **published**, through manual dispatch with `tag_name`, or as a reusable workflow. Pushing a Git tag alone is not its trigger.

The workflow builds Linux x64, macOS arm64, macOS x64, and Windows x64 on separate runners. It installs dependencies with Node 22, runs type checks and tests, packages the app, collects artifacts, and uploads them to the selected GitHub release.

For a versioned release:

1. Update `package.json` and `package-lock.json` to the intended version and review the change.
2. Run the relevant tests and platform checks.
3. Publish the GitHub release for the intended commit/version, or dispatch the workflow with the intended tag.
4. Wait for all platform builds and the asset-upload job to finish.
5. Check installer/archive names, architecture, update manifests, and a packaged-app update path.

The workflow accepts an optional `override_version`, which updates the build checkout ephemerally. Without it, the package version is used; supplying a release tag does not itself rewrite `package.json`.

## Rolling Dev release

`.github/workflows/dev.yml` runs daily at midnight UTC or on manual dispatch. Scheduled runs skip when no commits were found in the preceding 24 hours. It derives `<base-version>-dev.<YYYYMMDD>`, recreates the rolling `dev` prerelease/tag at the workflow commit, and calls the reusable release workflow with that version override.

## Updater channels

| App setting | Feed configured by the app | Manifest channel |
| --- | --- | --- |
| Stable | GitHub provider for `lubusIN/frappe-local` | `latest` |
| Dev | Generic feed at the rolling `releases/download/dev` URL | `dev` |

The current code enables prereleases for both channels; the Stable label should not be interpreted as a guarantee that prereleases are excluded.

Update manifests reference the actual downloadable artifact and its integrity metadata. Verify the channel's platform-specific files, such as `latest-mac.yml` / `dev-mac.yml` on macOS and `latest.yml` / `dev.yml` on Windows, along with their referenced archives/installers and blockmaps where generated.

## Known Dev manifest gap

The app requests the **dev** channel, but the current workflow's artifact-upload globs collect only `release-artifacts/latest*.yml`. `package.json` does not explicitly configure generation of all update channels. This means the pipeline cannot currently be assumed to publish the `dev*.yml` files the Dev updater needs.

To resolve this gap, align builder manifest generation and workflow collection with the updater channel, inspect uploaded assets, and test an update from an older packaged version.

## Verification before announcing a release

Check that each supported platform has its expected installer and architecture, manifests refer to assets that actually exist, and the app can launch and create/open a disposable site. Test the updater from an older packaged version; a successful source-mode run does not validate installation or update verification.

Keep the [installation guide](../user-guide/installation) synchronized with changes to signing, notarization, or installer filenames. Verify manifest contents and the updater feed before renaming update assets.

## Source-mode updater behavior

The development updater path intentionally differs from a packaged app:

| Operation | Unpackaged development behavior |
| --- | --- |
| Configuration | Normal packaged channel configuration is skipped; initialization uses `resources/dev-update.yml` and forces development update configuration |
| Manual check | Can call the updater and read remote update information |
| Download | Simulates completion after a short timer; it does not download and validate the installer |
| Install | Returns without quitting or replacing the application |

A successful Download/Install UI interaction in `npm start` is therefore not an update-delivery test.

On macOS, packaged download completion also waits for native Squirrel.Mac verification/unpacking before the UI is told the update is ready. Installation is rejected while that preparation is incomplete. Other packaged paths use electron-updater's install behavior; automatic installation on app quit is enabled during initialization.

Missing channel manifests and some HTTP 404 responses are treated as graceful absence of update metadata. A manual check can return `up-to-date` with the message that no published releases were found. That result does not prove the release pipeline is healthy: inspect uploaded manifests and referenced assets when diagnosing a channel.
