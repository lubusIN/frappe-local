# Catalog Maintenance

This project maintains the app catalog from a small app-level source file:

- apps.json

The build generates the runtime app registry:

- src/main/services/apps-registry.json

It is validated/normalized by:

- src/main/services/catalog-provider.ts
- scripts/build-apps-registry.js
- scripts/audit-catalog.js

## What Is Tracked Per App

Each `apps.json` entry can be either a repository URL string or an object with `repo` plus optional overrides:

- identity: id, name, description, category
- source repository: repo
- release signal: version (latest semver-like tag when available)
- install branch behavior:
  - installBranches: mapping per bench stream (version-15, version-16, develop)
  - optional installBranch fallback
- compatibility:
  - minimumFrappeVersion / maximumFrappeVersion
  - supportedBenchVersions

## How Catalog Is Applied At Runtime

1. Local Bench loads apps-registry.json through catalog-provider.
2. Items are normalized and validated against AppSchema.
3. Storage bootstrap applies the seed when APP_CATALOG_SEED_VERSION increases.

Files involved:

- src/main/services/catalog-provider.ts
- src/main/storage/bootstrap.ts

## Add A New App

1. Add the app repository URL to apps.json.
2. Add optional overrides only when inference is not enough:
   - id, name, description, category, icon, compatibility, installBranch, installBranches
3. Set supportedBenchVersions conservatively when the app does not support all tracked streams.
4. Run:
   - npm run catalog:build
   - npm run catalog:audit
5. Review docs/app-catalog-audit.md and resolve any review items.
6. Run tests/typecheck:
   - npx vitest run tests/catalog-provider.test.ts tests/bench-create-orchestration.test.ts tests/bench-apps-orchestration.test.ts tests/catalog-compatibility.test.ts
   - npx tsc --noEmit -p tsconfig.renderer.json
7. Bump APP_CATALOG_SEED_VERSION in src/main/services/catalog-provider.ts if apps-registry.json changed.

## Update Existing Apps

1. Run npm run catalog:build to refresh apps-registry.json version/branch metadata from upstream.
2. Run npm run catalog:audit to generate review checklist.
3. Resolve flagged rows and rerun build/audit until clean.
4. Bump APP_CATALOG_SEED_VERSION if apps-registry.json changed.

## Custom Apps Later

The same shape can support user-managed custom apps: persist user repository URLs separately, merge them with apps.json, and rebuild or refresh the registry on demand without changing bench/site install code.

## CI / Guardrails

Recommended checks:

- npm run catalog:build:check
- npm run catalog:audit
- targeted catalog tests

This prevents stale branch mappings and outdated versions from drifting into releases.
