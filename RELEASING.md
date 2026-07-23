# Releasing Frappe Local

This document outlines the protocol for releasing new versions of Frappe Local so that the **auto-updater** functions correctly.

Because the project is built with `electron-forge` but uses `electron-updater` for auto-updates (to support custom release channels), we must manually generate specific YAML files during the release process. 

## 1. Semantic Versioning & Channels
The auto-updater uses standard semantic versioning and GitHub tags to determine which updates belong to which channel:

- **Stable Channel**: Standard versions, e.g., `v1.0.0` or `v1.1.2`
- **Dev Channel**: Rolling prerelease builds, e.g., `v1.1.0-dev.20260703` published to the `dev` tag

When a user selects "Dev" in the app, `electron-updater` checks the rolling `dev` release tag for updates.

## 2. Required Manifest Files (`.yml`)
`electron-updater` **does not** just download a `.zip` directly; it first looks for a specific YAML manifest file in your GitHub Release assets to verify the hash and version. 

Depending on the platform and channel, it looks for different files:

**macOS:**
*   **Stable:** `latest-mac.yml`
*   **Dev:** `dev-mac.yml`

**Windows:**
*   **Stable:** `latest.yml`
*   **Dev:** `dev.yml`

**Linux:**
*   **Stable:** `latest-linux.yml`
*   **Dev:** `dev-linux.yml`

> [!WARNING]
> **These `.yml` files are generated automatically during our CI build process (`scripts/make-release.js`).** When releasing manually or verifying artifacts, ensure the corresponding `.yml` file is uploaded alongside our assets for auto-updates to work!

### Manifest File Format
The generated YAML file looks like this:

```yaml
version: 1.1.0-dev.20260703
files:
  - url: frappe-local-1.1.0-dev.20260703-mac.zip
    sha512: <YOUR_BASE64_ENCODED_SHA512_HASH>
    size: 104857600
path: frappe-local-1.1.0-dev.20260703-mac.zip
sha512: <YOUR_BASE64_ENCODED_SHA512_HASH>
releaseDate: '2026-06-23T12:00:00.000Z'
```

## 3. Release Workflow Steps
1. For stable releases, bump the version in `package.json` to the target tag (e.g., `1.1.0`).
2. Run `npm run release` (or push a tag to trigger GitHub Actions).
3. The release script automatically creates `latest-mac.yml` (for stable) or `dev-mac.yml` (for dev).
4. Create a GitHub Release tagged `v1.1.0`.
5. Upload the generated assets and `.yml` files to the release.
