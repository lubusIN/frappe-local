# Catalog Maintenance

This project maintains app catalog metadata in:

- src/main/default-catalog.json

It is validated/normalized by:

- src/main/catalog-provider.ts
- scripts/build-default-catalog.js
- scripts/audit-catalog.js

## What Is Tracked Per App

Each app entry tracks:

- identity: id, name, description, category
- source repository: source
- release signal: version (latest semver-like tag when available)
- install branch behavior:
  - installBranches: mapping per bench stream (version-15, version-16, develop)
  - optional installBranch fallback
- compatibility:
  - minimumFrappeVersion / maximumFrappeVersion
  - supportedBenchVersions

## How Catalog Is Applied At Runtime

1. Local Bench loads default-catalog.json through catalog-provider.
2. Items are normalized and validated against AppSchema.
3. Storage bootstrap applies the seed when APP_CATALOG_SEED_VERSION increases.

Files involved:

- src/main/catalog-provider.ts
- src/main/storage/bootstrap.ts

## Add A New App

1. Add a new object to src/main/default-catalog.json with at least:
   - id, name, description, source, category, version, compatibility
2. Prefer explicit installBranches for version-15, version-16, and develop.
3. Set supportedBenchVersions conservatively (only versions you intend to support).
4. Run:
   - npm run catalog:build
   - npm run catalog:audit
5. Review docs/app-catalog-audit.md and resolve any review items.
6. Run tests/typecheck:
   - npx vitest run tests/catalog-provider.test.ts tests/bench-create-orchestration.test.ts tests/bench-apps-orchestration.test.ts tests/catalog-compatibility.test.ts
   - npx tsc --noEmit -p tsconfig.renderer.json
7. Bump APP_CATALOG_SEED_VERSION in src/main/catalog-provider.ts if catalog content changed.

## Update Existing Apps

1. Run npm run catalog:build to refresh version/branch metadata from upstream.
2. Run npm run catalog:audit to generate review checklist.
3. Resolve flagged rows and rerun build/audit until clean.
4. Bump APP_CATALOG_SEED_VERSION if default-catalog.json changed.

## CI / Guardrails

Recommended checks:

- npm run catalog:build:check
- npm run catalog:audit
- targeted catalog tests

This prevents stale branch mappings and outdated versions from drifting into releases.
