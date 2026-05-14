import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCaddyfile, pruneStaleCaddySiteCertificates } from '../src/main/caddy-front-door';

describe('caddy front door config', () => {
  it('proxies localhost domains to the internal shared router over https', () => {
    const caddyfile = buildCaddyfile(18080, ['siteonfirstbench.localhost']);

    expect(caddyfile).toContain('protocols h1 h2');
    expect(caddyfile).toContain('http://localhost, http://*.localhost');
    expect(caddyfile).toContain('https://localhost, https://siteonfirstbench.localhost');
    expect(caddyfile).not.toContain('https://*.localhost');
    expect(caddyfile).toContain('tls internal');
    expect(caddyfile).toContain('reverse_proxy 127.0.0.1:18080');
    expect(caddyfile).toContain('header_up Host {host}');
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

    const initialConfig = buildCaddyfile(18080, ['site-a.localhost', 'site-b.localhost']);
    expect(initialConfig).toContain('https://localhost, https://site-a.localhost, https://site-b.localhost');

    // Simulate a delete + refresh where site-b is removed from storage and front-door hosts.
    pruneStaleCaddySiteCertificates(['site-a.localhost'], certRoot);
    const refreshedConfig = buildCaddyfile(18080, ['site-a.localhost']);

    expect(refreshedConfig).toContain('https://localhost, https://site-a.localhost');
    expect(refreshedConfig).not.toContain('site-b.localhost');
    expect(fs.existsSync(path.join(certRoot, 'site-a.localhost'))).toBe(true);
    expect(fs.existsSync(path.join(certRoot, 'site-b.localhost'))).toBe(false);

    fs.rmSync(certRoot, { recursive: true, force: true });
  });
});
