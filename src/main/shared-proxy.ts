import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import { createMainLogger } from './logger';
import { findNextAvailableTcpPort } from './utils/ports';
import type { Bench, Site } from '../shared/domain/models';
import { getSiteHostCandidates } from '../shared/site-hostname';
import { resolveBenchHttpPort } from './utils/bench-http-port';

const logger = createMainLogger('shared-proxy');

const DEFAULT_BENCH_HTTP_PORT = 8080;
const SHARED_PROXY_PORT_START = 18080;
const SHARED_PROXY_PORT_END = 18100;

const normalizeHost = (host: string): string => host.trim().toLowerCase().replace(/\.$/, '');

type SharedProxyRepositories = {
  readonly benches: {
    findAll: () => Promise<Bench[]>;
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
  };
};

type ResolvedTarget = {
  readonly site: Site;
  readonly bench: Bench;
  readonly port: number;
};

type UpstreamHeaders = Record<string, string | string[] | undefined>;

const buildUpstreamHeaders = (request: http.IncomingMessage, targetHost: string): UpstreamHeaders => {
  const originalHost = request.headers.host ?? targetHost;
  const remoteAddress = request.socket.remoteAddress ?? '';

  return {
    ...request.headers,
    host: targetHost,
    'x-forwarded-host': String(originalHost),
    'x-forwarded-proto': 'http',
    'x-forwarded-for': remoteAddress,
  };
};

const createRawUpgradeRequest = (request: http.IncomingMessage, headers: UpstreamHeaders): string => {
  const startLine = `${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/${request.httpVersion}\r\n`;
  let headerLines = '';

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headerLines += `${key}: ${item}\r\n`;
      }
      continue;
    }

    headerLines += `${key}: ${value}\r\n`;
  }

  return `${startLine}${headerLines}\r\n`;
};

export class SharedBenchProxy {
  private server: http.Server | null = null;
  private listeningPort: number | null = null;
  private repositories: SharedProxyRepositories | null = null;
  private readonly portRangeStart: number;
  private readonly portRangeEnd: number;

  public constructor(portRangeStart = SHARED_PROXY_PORT_START, portRangeEnd = SHARED_PROXY_PORT_END) {
    this.portRangeStart = portRangeStart;
    this.portRangeEnd = portRangeEnd;
  }

  public async start(repositories: SharedProxyRepositories): Promise<number> {
    if (this.server && this.listeningPort !== null) {
      this.repositories = repositories;
      return this.listeningPort;
    }

    this.repositories = repositories;

    const desiredPort = await findNextAvailableTcpPort(this.portRangeStart);
    if (desiredPort > this.portRangeEnd) {
      throw new Error(`No shared proxy port available in range ${this.portRangeStart}-${this.portRangeEnd}.`);
    }

    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    this.server.on('upgrade', (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Proxy server not initialized.'));
        return;
      }

      this.server.once('error', reject);
      this.server.listen(desiredPort, '127.0.0.1', () => {
        resolve();
      });
    });

    this.listeningPort = desiredPort;
    logger.info(`Shared proxy listening on 127.0.0.1:${desiredPort}`);

    return desiredPort;
  }

  public getPort(): number | null {
    return this.listeningPort;
  }

  public async stop(): Promise<void> {
    if (!this.server) {
      this.repositories = null;
      this.listeningPort = null;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error && !String(error.message).includes('Server is not running')) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.server = null;
    this.repositories = null;
    this.listeningPort = null;
  }

  private async resolveTarget(hostHeader: string | undefined): Promise<ResolvedTarget | null> {
    if (!this.repositories || !hostHeader) {
      return null;
    }

    const requestHost = normalizeHost(hostHeader.split(':')[0] ?? '');
    if (!requestHost) {
      return null;
    }

    const [sites, benches] = await Promise.all([
      this.repositories.sites.findAll(),
      this.repositories.benches.findAll(),
    ]);

    const site = sites.find((entry) => getSiteHostCandidates(entry.name).includes(requestHost));
    if (!site) {
      return null;
    }

    const bench = benches.find((entry) => entry.id === site.benchId);
    if (!bench) {
      return null;
    }

    return {
      site,
      bench,
      port: resolveBenchHttpPort(bench, DEFAULT_BENCH_HTTP_PORT),
    };
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      const target = await this.resolveTarget(request.headers.host);
      if (!target) {
        response.statusCode = 404;
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.end('Unknown site host. Ensure the site exists and the bench is running.');
        return;
      }

      const upstreamRequest = http.request(
        {
          hostname: '127.0.0.1',
          port: target.port,
          method: request.method,
          path: request.url,
          headers: buildUpstreamHeaders(request, target.site.name),
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        }
      );

      upstreamRequest.on('error', (error) => {
        logger.warn(`Proxy request failed for ${target.site.name} on port ${target.port}: ${error}`);
        if (!response.headersSent) {
          response.statusCode = 502;
          response.setHeader('content-type', 'text/plain; charset=utf-8');
        }
        response.end(`Unable to reach bench frontend on port ${target.port}.`);
      });

      request.pipe(upstreamRequest);
    } catch (error) {
      logger.error(`Unhandled shared proxy request error: ${error}`);
      response.statusCode = 500;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end('Shared proxy encountered an unexpected error.');
    }
  }

  private async handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    try {
      const target = await this.resolveTarget(request.headers.host);
      if (!target) {
        socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
        return;
      }

      const upstreamHeaders = buildUpstreamHeaders(request, target.site.name);

      const upstreamSocket = net.connect(target.port, '127.0.0.1', () => {
        upstreamSocket.write(createRawUpgradeRequest(request, upstreamHeaders));
        if (head.length > 0) {
          upstreamSocket.write(head);
        }
        socket.pipe(upstreamSocket).pipe(socket);
      });

      upstreamSocket.on('error', (error) => {
        logger.warn(`Upgrade proxy failed for ${target.site.name} on port ${target.port}: ${error}`);
        socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });

      socket.on('error', () => {
        upstreamSocket.destroy();
      });
    } catch (error) {
      logger.error(`Unhandled shared proxy upgrade error: ${error}`);
      socket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    }
  }
}

const sharedBenchProxy = new SharedBenchProxy();

export const initializeSharedBenchProxy = async (repositories: SharedProxyRepositories): Promise<number> => {
  return sharedBenchProxy.start(repositories);
};

export const getSharedBenchProxyPort = (): number | null => {
  return sharedBenchProxy.getPort();
};

export const SHARED_PROXY_PORT_RANGE = {
  START: SHARED_PROXY_PORT_START,
  END: SHARED_PROXY_PORT_END,
} as const;
