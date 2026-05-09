import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { SharedBenchProxy } from '../src/main/shared-proxy';
import type { Bench, Site } from '../src/shared/domain/models';

const now = new Date('2026-01-01T00:00:00.000Z').toISOString();

const makeBench = (id: string, name: string, httpPort: number): Bench => ({
  id,
  name,
  path: `/tmp/${name}`,
  frappeVersion: '15.0.0',
  httpPort,
  status: 'running',
  apps: ['frappe'],
  timestamps: {
    createdAt: now,
    updatedAt: now,
  },
});

const makeSite = (id: string, benchId: string, name: string): Site => ({
  id,
  benchId,
  name,
  path: `/tmp/${benchId}/sites/${name}`,
  apps: ['frappe'],
  status: 'running',
  timestamps: {
    createdAt: now,
    updatedAt: now,
  },
});

const startUpstream = async (label: string): Promise<{ server: http.Server; port: number }> => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(label);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve upstream listening address.');
  }

  return {
    server,
    port: address.port,
  };
};

const closeServer = async (server: http.Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
};

const requestProxy = async (proxyPort: number, host: string): Promise<{ status: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        path: '/',
        method: 'GET',
        headers: {
          host,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
};

describe('shared proxy routing', () => {
  let proxy: SharedBenchProxy | null = null;
  let upstreamA: http.Server | null = null;
  let upstreamB: http.Server | null = null;

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
      proxy = null;
    }
    if (upstreamA) {
      await closeServer(upstreamA);
      upstreamA = null;
    }
    if (upstreamB) {
      await closeServer(upstreamB);
      upstreamB = null;
    }
  });

  it('routes each site host to the correct bench frontend port', async () => {
    const a = await startUpstream('bench-a-frontend');
    const b = await startUpstream('bench-b-frontend');
    upstreamA = a.server;
    upstreamB = b.server;

    const benches: Bench[] = [
      makeBench('bench-a-001', 'bench-a', a.port),
      makeBench('bench-b-001', 'bench-b', b.port),
    ];

    const sites: Site[] = [
      makeSite('site-a', 'bench-a-001', 'alpha.localhost'),
      makeSite('site-b', 'bench-b-001', 'beta.localhost'),
    ];

    proxy = new SharedBenchProxy(38080, 38100);
    const proxyPort = await proxy.start({
      benches: {
        findAll: async () => benches,
      },
      sites: {
        findAll: async () => sites,
      },
    });

    const alpha = await requestProxy(proxyPort, 'alpha.localhost');
    const beta = await requestProxy(proxyPort, 'beta.localhost');

    expect(alpha.status).toBe(200);
    expect(alpha.body).toBe('bench-a-frontend');
    expect(beta.status).toBe(200);
    expect(beta.body).toBe('bench-b-frontend');
  });

});
