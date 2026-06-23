# Releasing Frappe Local

This document outlines the protocol for releasing new versions of Frappe Local so that the **auto-updater** functions correctly.

Because the project is built with `electron-forge` but uses `electron-updater` for auto-updates (to support custom release channels), we must manually generate specific YAML files during the release process. 

## 1. Semantic Versioning & Channels
The auto-updater uses standard semantic versioning and GitHub tags to determine which updates belong to which channel:

- **Stable Channel**: Standard versions, e.g., `v1.0.0` or `v1.1.2`
- **Beta Channel**: Append `-beta.X`, e.g., `v1.1.0-beta.1`
- **Alpha Channel**: Append `-alpha.X`, e.g., `v1.1.0-alpha.1`
- **Nightly Channel**: Append `-nightly.X`, e.g., `v1.1.0-nightly.1`

When a user selects "Alpha" or "Beta" in the app, `electron-updater` specifically looks for the highest release version that includes `-alpha` or `-beta` in its tag.

## 2. Required Manifest Files (`.yml`)
`electron-updater` **does not** just download a `.zip` directly; it first looks for a specific YAML manifest file in your GitHub Release assets to verify the hash and version. 

Depending on the platform and channel, it looks for different files:

**macOS:**
*   **Stable:** `latest-mac.yml`
*   **Beta:** `beta-mac.yml`
*   **Alpha:** `alpha-mac.yml`
*   **Nightly:** `nightly-mac.yml`

**Windows:**
*   **Stable:** `latest.yml`
*   **Beta:** `beta.yml`
*   **Alpha:** `alpha.yml`
*   **Nightly:** `nightly.yml`

**Linux:**
*   **Stable:** `latest-linux.yml`
*   **Beta:** `beta-linux.yml`
*   **Alpha:** `alpha-linux.yml`
*   **Nightly:** `nightly-linux.yml`

> [!WARNING]
> **These `.yml` files are not generated automatically.** Running `electron-forge publish` will only upload the `.dmg` and `.zip` files. We **must** generate and upload the corresponding `.yml` file alongside our assets for auto-updates to work!

### Manifest File Format
The generated YAML file must look exactly like this:

```yaml
version: 1.1.0-beta.1
files:
  - url: frappe-local-1.1.0-beta.1-mac.zip
    sha512: <YOUR_BASE64_ENCODED_SHA512_HASH>
    size: 104857600
path: frappe-local-1.1.0-beta.1-mac.zip
sha512: <YOUR_BASE64_ENCODED_SHA512_HASH>
releaseDate: '2026-06-23T12:00:00.000Z'
```

## 3. Release Workflow Steps
1. Bump the version in `package.json` to the target tag (e.g., `1.1.0-beta.1`).
2. Run `npm run make` to generate the Mac `.zip` and `.dmg` files in the `out/make` directory.
3. Calculate the `sha512` base64 hash of the `.zip` file.
4. Create the corresponding YAML file (e.g., `beta-mac.yml`) following the structure above.
5. Create a GitHub Release tagged `v1.1.0-beta.1`.
6. Upload the `.zip`, `.dmg`, and your `beta-mac.yml` file to the release.
