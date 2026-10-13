# Caddy and local site routing

Caddy runs as a host-side process launched from the bundled executable. It provides a common entry point for local sites, routes requests to the appropriate bench, and handles local TLS certificates. It is separate from the per-bench Compose services.

## Request path

```text
https://demo.localhost
  → host Caddy process
  → demo.localhost route
      ├── ordinary HTTP → 127.0.0.1:<bench HTTP port>
      └── /socket.io/*  → 127.0.0.1:<bench HTTP port + 1000>
  → Frappe services inside Podman
```

Routes are built from persisted sites and their parent benches. Hostnames are normalized, duplicate hosts are omitted, and entries without a parent bench are skipped. The generated configuration also maps bare `localhost` to the first ordered route's bench; named site URLs should be used for normal access.

Socket.IO requests have dedicated proxy rules and forwarded site/host/origin headers. This keeps realtime connections directed at the same site as the browser's main request. A managed error handler serves the app's bad-gateway page for HTTP 502 responses.

## Configuration and process management

`src/main/services/caddy-front-door/index.ts` owns process state; `utils.ts` builds routes/configuration, handles trust, and cleans up managed processes and certificate entries.

The generated Caddyfile and PID file live under the OS temporary directory in `frappe-local-caddy/`. The admin endpoint is configured at `localhost:29919`. Certificate data uses Caddy's platform data directory, separate from the temporary configuration.

When no site routes remain, the service stops Caddy. With unchanged configuration it can reuse the existing managed process. When routes change, it stops/replaces the process and writes the new configuration. It prunes stale managed site certificates during reconfiguration. This is process reuse/restart behavior, not a promise of zero-downtime hot reload.

## HTTP, HTTPS, and trust

The service checks whether port 80 can be bound. If it is unavailable, it attempts HTTPS-only mode. Caddy's local issuer provides site certificates; the app attempts to trust its root through the platform's certificate-store tooling.

**Serving HTTPS and trusting its certificate are separate states.** In the current implementation, a trust failure logs a warning but still marks the running proxy as secure. It does not automatically switch the browser to HTTP just because trust failed. The browser may therefore report a certificate warning until local trust is repaired.

This distinction is important when modifying status reporting: `isCaddyFrontDoorSecure()` currently indicates a running HTTPS service, not independently confirmed browser trust.

## Browser URL selection and fallback

The site's Browser IPC handler selects:

| State | URL |
| --- | --- |
| Proxy available and marked secure | `https://<site-host>` |
| Proxy available but not marked secure | `http://<site-host>` |
| Proxy unavailable | `http://<site-host>:<bench-http-port>` |

The direct-port fallback bypasses Caddy. It should not be confused with recovery from a certificate trust failure. Route generation includes persisted sites even if a bench is stopped, so a valid route can still return a gateway error when its upstream is unavailable.

## Failure handling

Caddy spawn errors or process exits mark the proxy unavailable. Startup uses a readiness timer and trust attempt; it is not an end-to-end HTTP probe for every site. Diagnose the layers separately: process availability, certificate trust, route selection, upstream bench health, and Socket.IO connectivity.

When stopping Caddy, the service requests termination and has a forced-kill timeout. Managed PID/orphan cleanup supports relaunch. See [Lifecycle and recovery](./lifecycle) for close/quit behavior and [Testing](./testing) for validation guidance.
