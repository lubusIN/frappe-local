# App Catalog Audit

Generated: 2026-06-01T15:23:33.413Z

## Summary

- Total apps: 15
- OK: 15
- Needs review: 0
- Audit errors: 0

## Review Checklist

- [x] No review items.

## Detailed Matrix

| App | Catalog Version | Latest Tag | Branch Matrix | Upstream Heads | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| frappe | v16.19.0 | v16.19.0 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, master, version-15, version-16 | ok | - |
| erpnext | v16.20.1 | v16.20.1 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, master, version-15, version-16 | ok | - |
| hrms | v16.7.1 | v16.7.1 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, version-15, version-16 | ok | - |
| lending | v1.5.4 | v1.5.4 | version-15: version-15<br>develop: develop | develop, version-15 | ok | - |
| payments | 16.0.0 | n/a | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, version-15, version-16 | ok | - |
| ecommerce_integrations | v16.0.0 | v16.0.0 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, main, version-15, version-16 | ok | - |
| crm | v1.72.0 | v1.72.0 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| helpdesk | v1.25.1 | v1.25.1 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| gameplan | 15.0.0 | n/a | version-15: main<br>develop: develop | develop, main | ok | - |
| wiki | v2.0.1 | v2.0.1 | version-15: master<br>version-16: master<br>develop: develop | develop, master | ok | - |
| drive | v0.3.0 | v0.3.0 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| lms | v2.54.2 | v2.54.2 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| print_designer | v1.6.7 | v1.6.7 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| insights | v3.9.11 | v3.9.11 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| builder | v1.25.0 | v1.25.0 | version-15: master<br>version-16: master<br>develop: develop | develop, master | ok | - |

## Workflow

- Add or edit app entries in apps.json when introducing catalog apps.
- Run npm run catalog:build to rebuild src/main/services/apps-registry.json from apps.json and upstream metadata.
- Run npm run catalog:build:check in CI or pre-commit to ensure catalog stays in sync.
- Run node scripts/audit-catalog.js whenever catalog entries are edited.
- Resolve all `Needs review` items before bumping `APP_CATALOG_SEED_VERSION`.
- Re-run relevant tests: `npx vitest run tests/catalog-provider.test.ts tests/bench-create-orchestration.test.ts tests/bench-apps-orchestration.test.ts tests/catalog-compatibility.test.ts`.
- Run typecheck: `npx tsc --noEmit -p tsconfig.renderer.json`.
