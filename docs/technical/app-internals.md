# Catalog and app installation internals

App handling has three layers: discovering metadata, making source available in a bench, and installing it into a site's database.

## Catalog loading

`catalog-provider.ts` reads the bundled `bin/apps.json` seed and normalizes Brewery entries into the shared app schema. Normalization handles IDs, categories, icons, supported Frappe versions, and per-version installation branches. The seed version controls storage reseeding; it is separate from an app's version or repository branch.

Bootstrap also starts a background registry synchronization using the configured Brewery URL. For a URL ending in `.json`, the fetcher tries that URL directly. Otherwise it tries `/index/apps.json`, `/apps.json`, then the base URL. It accepts an array or an object containing an `apps` array, filters required fields, and validates normalized items. Fetch attempts use an abort timer and return useful errors rather than requiring the window to wait for catalog startup.

A missing or unreadable bundled catalog yields an empty seed. Remote metadata remains dependency input, not proof that an app builds successfully or is appropriate for the selected environment.

## Custom-app extraction

`custom-app-extractor.ts` uses bundled Git through `dugite` for GitHub metadata extraction. It discovers the remote default branch, shallow-clones to a temporary directory, reads metadata, and cleans up that temporary checkout. Local extraction reads the selected source directory.

Metadata is extracted from text such as `hooks.py`, `pyproject.toml`, license files, and known icon locations. It does not import and execute `hooks.py` to obtain these fields. Regex-based extraction has limits: dynamically computed metadata may not be recognized. Extracted metadata and branch information are saved as a custom-app registration.

Registration is separate from installation. The temporary metadata checkout is not the bench's installed source tree.

## Bench app operations

`src/main/services/bench-orchestration/apps.ts` computes app changes and resolves catalog/custom-app entries. Repository apps are fetched through `bench get-app` with dependency resolution, overwrite behavior, and a selected branch. Catalog branch mappings and custom-app branch metadata influence that selection.

Local custom apps are mounted into `/workspace/apps/<app-name>`, then their Python/frontend dependencies and assets are prepared. Because this is a mount, source changes affect the original host folder; removal must not confuse a mounted source directory with a disposable downloaded checkout.

App operations coordinate process restarts, build work, resource metadata, and operation-specific cleanup. Some build steps log warnings rather than failing the entire operation; inspect task output when an app appears installed but its frontend is incomplete. Cleanup is not a universal rollback of every dependency side effect.

## Site app operations

Site installation runs the Frappe site-level command in the parent bench. It applies application schema and setup to that database, independently of other sites sharing the bench. Removal checks usage and separates site uninstall from bench source removal; core Frappe is excluded from normal removal choices.

Review `site-orchestration/`, bench app orchestration, IPC handlers, and renderer compatibility logic together when changing installation behavior. Tests should distinguish failed source acquisition, failed asset build, failed site install, and partial cleanup.

## Trust boundary

Metadata reading is not an installation sandbox. Installing an app runs its dependencies and build/setup code inside the development environment. Local source mounts and optional SSH-key sharing expose host resources by design. Use repositories you trust, and do not describe a container as a guarantee that arbitrary app code is harmless.
