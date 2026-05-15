# App Catalog Audit

Generated: 2026-05-15T09:15:25.765Z

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
| frappe | v16.18.2 | v16.18.2 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, master, version-15, version-16 | ok | - |
| erpnext | v16.18.3 | v16.18.3 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, master, version-15, version-16 | ok | - |
| hrms | v16.7.0 | v16.7.0 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, version-15, version-16 | ok | - |
| lending | v1.5.4 | v1.5.4 | version-15: version-15<br>develop: develop | develop, version-15 | ok | - |
| payments | 16.0.0 | n/a | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, version-15, version-16 | ok | - |
| ecommerce_integrations | v16.0.0 | v16.0.0 | version-15: version-15<br>version-16: version-16<br>develop: develop | develop, main, version-15, version-16 | ok | - |
| crm | v1.71.2 | v1.71.2 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| helpdesk | v1.24.1 | v1.24.1 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| gameplan | 15.0.0 | n/a | version-15: main<br>develop: develop | develop, main | ok | - |
| wiki | v2.0.1 | v2.0.1 | version-15: master<br>version-16: master<br>develop: develop | develop, master | ok | - |
| drive | v0.3.0 | v0.3.0 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| lms | v2.54.1 | v2.54.1 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| print_designer | v1.6.7 | v1.6.7 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| insights | v3.9.9 | v3.9.9 | version-15: main<br>version-16: main<br>develop: develop | develop, main | ok | - |
| builder | v1.24.5 | v1.24.5 | version-15: master<br>version-16: master<br>develop: develop | develop, master | ok | - |

## Workflow

- Add or edit app entries in src/main/default-catalog.json when introducing new catalog apps.
- Run npm run catalog:build to normalize versions/branches from upstream metadata.
- Run npm run catalog:build:check in CI or pre-commit to ensure catalog stays in sync.
- Run node scripts/audit-catalog.js whenever catalog entries are edited.
- Resolve all `Needs review` items before bumping `APP_CATALOG_SEED_VERSION`.
- Re-run relevant tests: `npx vitest run tests/catalog-provider.test.ts tests/bench-create-orchestration.test.ts tests/bench-apps-orchestration.test.ts tests/catalog-compatibility.test.ts`.
- Run typecheck: `npx tsc --noEmit -p tsconfig.renderer.json`.
