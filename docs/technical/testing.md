# Testing

## Automated checks

Run the full suite and static checks with:

```bash
npm test
npm run typecheck
npm run lint
```

For a targeted service change, pass its test path to Vitest:

```bash
npm test -- tests/main/services/site-orchestration.test.ts
```

`vitest.config.ts` defaults to a Node environment, maps `electron` to `tests/mocks/electron.ts`, and resolves the `@frappe-local` source alias. Passing these tests does not prove that a real Podman machine, WSL distribution, OS certificate store, or installer works.

UI tests opt into jsdom and mount the real Vue components with Vue Test Utils. They exercise confirmation phrases, focus, explicit cancellation, Escape behavior, and rendered status/error labels. Confirmation dialogs currently disable Escape dismissal. These tests do not replace browser or screen-reader checks.

Resource tests verify that the app shell owns polling while views and dialogs share data without starting additional loops. Storage bootstrap tests cover preserving corrupt or unreadable snapshots; task-waiting tests cover rejected starts and terminal task states.

## Coverage map

| Area | Tests |
| --- | --- |
| Command contracts, handlers, and queued-resource guards | `tests/main/ipc/` |
| Bench/site operations, runtime, proxy, catalog, and task runner | `tests/main/services/` |
| Snapshot adapter, migrations, repositories, and recovery | `tests/main/storage/` |
| Core paths and utilities | `tests/main/core/` and other main test folders |
| Renderer controllers and utilities | `tests/renderer/` |

Follow existing dependency injection and mocks for main-process tests. Assert observable state, commands, events, and cleanup behavior rather than duplicating implementation logic.

## Live runtime checks

Use a disposable bench on each platform affected by the change. A useful lifecycle check is:

1. Create a bench and initial site, then open the site and sign in.
2. Stop, start, and restart the bench; confirm browser access returns.
3. Add a compatible app to the bench and install it on a site.
4. Build assets, clean site cache, and run migrations.
5. Check Activity, logs, and Diagnostics for useful completion/failure output.
6. If deletion changed, delete only the disposable site and bench and verify expected cleanup.

For Windows runtime changes, include WSL setup, memory application, and volume-based editor access. For proxy changes, check both successful HTTPS trust and HTTP fallback. For cancellation or recovery changes, verify the resource state after interruption and relaunch.

These are manual checks to perform when relevant, not claims that every release automatically runs them.

## Docs validation

```bash
npm run docs:build
npm run docs:preview
```

Check sidebar links, search navigation, code blocks, tables, screenshots, and mobile navigation in the browser. When app UI changes affect screenshots, [refresh the captures](./development#refresh-screenshots) before building the docs. Plain-text and highlighted code blocks should remain readable in Light and Dark modes.

## Release validation

Release CI runs type checks and Vitest before packaging. Installer launch, platform integration, and update-download verification still need packaged-app testing. See [Releasing](./releasing) for the artifact and channel checks.
