import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCaddyfile, pruneStaleCaddySiteCertificates } from '../../../src/main/services/caddy-front-door';

describe('caddy front door config', () => {
  it('proxies each site domain directly to its bench frontend over https', () => {
    const caddyfile = buildCaddyfile([
      { siteHost: 'siteonfirstbench.localhost', benchPort: 18080 },
    ]);

    expect(caddyfile).toContain('protocols h1 h2');
    expect(caddyfile).toContain('http://localhost, http://*.localhost');
    expect(caddyfile).toContain('https://localhost');
    expect(caddyfile).toContain('https://siteonfirstbench.localhost');
    expect(caddyfile).not.toContain('https://*.localhost');
    expect(caddyfile).toContain('tls internal');
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:18080');
    expect(caddyfile).toContain('header_up Host {host}');
  });

  it('shows restart guidance when a bench frontend returns a bad gateway error', () => {
    const caddyfile = buildCaddyfile([
      { siteHost: 'unavailable.localhost', benchPort: 18080 },
    ]);

    expect(caddyfile).toContain('(local_bench_bad_gateway)');
    expect(caddyfile).toContain('@bad_gateway expression {err.status_code} == 502');
    expect(caddyfile).toContain('import local_bench_bad_gateway');
    expect(caddyfile).toContain('Site temporarily unavailable');
    expect(caddyfile).toContain('Restart the bench hosting this site.');
    expect(caddyfile).toContain('https://github.com/lubusIN/local-bench/issues/new');
    expect(caddyfile).toContain('LOCAL_BENCH_502_PAGE 502');
    expect(caddyfile).toContain('class="grid min-h-screen');
    expect(caddyfile).not.toContain('@tailwind');
    expect(caddyfile).not.toContain('LOCAL_BENCH_TAILWIND_CSS');
  });

  it('removes stale local site certificate directories while keeping active hosts', () => {
    const certRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bench-certs-test-'));
    fs.mkdirSync(path.join(certRoot, 'localhost'));
    fs.mkdirSync(path.join(certRoot, 'site-a.localhost'));
    fs.mkdirSync(path.join(certRoot, 'site-b.localhost'));
    fs.mkdirSync(path.join(certRoot, 'wildcard_.localhost'));
    fs.mkdirSync(path.join(certRoot, 'example.com'));

    pruneStaleCaddySiteCertificates(['site-a.localhost'], certRoot);

    expect(fs.existsSync(path.join(certRoot, 'localhost'))).toBe(true);
    expect(fs.existsSync(path.join(certRoot, 'site-a.localhost'))).toBe(true);
    expect(fs.existsSync(path.join(certRoot, 'site-b.localhost'))).toBe(false);
    expect(fs.existsSync(path.join(certRoot, 'wildcard_.localhost'))).toBe(false);
    expect(fs.existsSync(path.join(certRoot, 'example.com'))).toBe(true);

    fs.rmSync(certRoot, { recursive: true, force: true });
  });

  it('keeps config and certificate cache aligned after removing a site host', () => {
    const certRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-bench-certs-sync-test-'));
    fs.mkdirSync(path.join(certRoot, 'localhost'));
    fs.mkdirSync(path.join(certRoot, 'site-a.localhost'));
    fs.mkdirSync(path.join(certRoot, 'site-b.localhost'));

    const initialConfig = buildCaddyfile([
      { siteHost: 'site-a.localhost', benchPort: 18080 },
      { siteHost: 'site-b.localhost', benchPort: 18081 },
    ]);
    expect(initialConfig).toContain('https://localhost');
    expect(initialConfig).toContain('https://site-a.localhost');
    expect(initialConfig).toContain('https://site-b.localhost');

    // Simulate a delete + refresh where site-b is removed from storage and front-door hosts.
    pruneStaleCaddySiteCertificates(['site-a.localhost'], certRoot);
    const refreshedConfig = buildCaddyfile([
      { siteHost: 'site-a.localhost', benchPort: 18080 },
    ]);

    expect(refreshedConfig).toContain('https://localhost');
    expect(refreshedConfig).toContain('https://site-a.localhost');
    expect(refreshedConfig).not.toContain('site-b.localhost');
    expect(fs.existsSync(path.join(certRoot, 'site-a.localhost'))).toBe(true);
    expect(fs.existsSync(path.join(certRoot, 'site-b.localhost'))).toBe(false);

    fs.rmSync(certRoot, { recursive: true, force: true });
  });
});
