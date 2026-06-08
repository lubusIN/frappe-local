import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Bench, Site } from '../../shared/domain/models';
import { createMainLogger } from '../logger';
import { getBinaryPath } from '../utils/binaries';
import { resolveBenchHttpPort } from '../utils/bench-http-port';
import { normalizeSiteHost } from '../../shared/utils/site-hostname';
import { BAD_GATEWAY_ERROR_PAGE } from '../pages/bad-gateway/page';

const logger = createMainLogger('caddy-front-door');

const CADDY_RUNTIME_DIR = path.join(os.tmpdir(), 'local-bench-caddy');
const CADDY_CONFIG_PATH = path.join(CADDY_RUNTIME_DIR, 'Caddyfile');
const CADDY_PID_PATH = path.join(CADDY_RUNTIME_DIR, 'caddy.pid');
const getCaddyCertificatesLocalDir = (): string => {
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Caddy',
      'certificates',
      'local'
    );
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Caddy',
      'certificates',
      'local'
    );
  }
  // Linux & others
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'caddy',
    'certificates',
    'local'
  );
};
const CADDY_CERTIFICATES_LOCAL_DIR = getCaddyCertificatesLocalDir();
const LEGACY_WILDCARD_CERT_DIR = 'wildcard_.localhost';

type FrontDoorRepositories = {
  readonly benches: {
    findAll: () => Promise<Bench[]>;
  };
  readonly sites: {
    findAll: () => Promise<Site[]>;
  };
};

type FrontDoorRoute = {
  readonly siteHost: string;
  readonly benchPort: number;
};

const buildBadGatewayErrorHandler = (): string => `(local_bench_bad_gateway) {
  handle_errors {
    @bad_gateway expression {err.status_code} == 502
    handle @bad_gateway {
      header Content-Type "text/html; charset=utf-8"
      respond <<LOCAL_BENCH_502_PAGE
${BAD_GATEWAY_ERROR_PAGE}
LOCAL_BENCH_502_PAGE 502
    }
  }
}`;

const listProcesses = (): Array<{ pid: number; command: string }> => {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          '@(Get-CimInstance Win32_Process | Select-Object ProcessId, CommandLine) | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      if (!output.trim()) {
        return [];
      }
      const data = JSON.parse(output.trim());
      if (!Array.isArray(data)) {
        return [];
      }
      return data
        .filter((item): item is { ProcessId: number; CommandLine: string | null } =>
          item !== null && typeof item === 'object' && 'ProcessId' in item
        )
        .map((item) => ({
          pid: item.ProcessId,
          command: item.CommandLine || '',
        }));
    } catch (err) {
      logger.warn(`Failed to list processes on Windows: ${err}`);
      return [];
    }
  }

  try {
    const output = execFileSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], { encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const firstSpace = line.indexOf(' ');
        if (firstSpace === -1) {
          return null;
        }

        const pid = Number.parseInt(line.slice(0, firstSpace), 10);
        if (!Number.isInteger(pid) || pid <= 0) {
          return null;
        }

        return {
          pid,
          command: line.slice(firstSpace + 1).trim(),
        };
      })
      .filter((entry): entry is { pid: number; command: string } => entry !== null);
  } catch {
    return [];
  }
};

const getManagedFrontDoorCommandTag = (): string => {
  return `${getBinaryPath('caddy')} run --config ${CADDY_CONFIG_PATH}`;
};

const readPidFromFile = (): number | null => {
  try {
    if (!fs.existsSync(CADDY_PID_PATH)) {
      return null;
    }

    const pid = Number.parseInt(fs.readFileSync(CADDY_PID_PATH, 'utf8').trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return null;
    }

    return pid;
  } catch {
    return null;
  }
};

const isManagedFrontDoorProcessRunning = (pid: number): boolean => {
  const managedTag = getManagedFrontDoorCommandTag();
  return listProcesses().some((entry) => entry.pid === pid && entry.command.includes(managedTag));
};

const canReuseManagedFrontDoor = (desiredConfig: string): boolean => {
  try {
    if (!fs.existsSync(CADDY_CONFIG_PATH)) {
      return false;
    }

    const existingConfig = fs.readFileSync(CADDY_CONFIG_PATH, 'utf8');
    if (existingConfig !== desiredConfig) {
      return false;
    }

    const pid = readPidFromFile();
    if (!pid) {
      return false;
    }

    return isManagedFrontDoorProcessRunning(pid);
  } catch {
    return false;
  }
};

const stopOrphanFrontDoorProcesses = (): void => {
  // Match on the binary path + subcommand only — not the config path — so stale
  // instances using a different temp dir (e.g. from a prior session) are also stopped.
  const binaryPathTag = `${getBinaryPath('caddy')} run --config`;

  for (const processInfo of listProcesses()) {
    if (processInfo.pid === process.pid) {
      continue;
    }

    if (!processInfo.command.includes(binaryPathTag)) {
      continue;
    }

    try {
      process.kill(processInfo.pid, 'SIGTERM');
      logger.warn(`Stopped orphan Local Bench Caddy process (pid=${processInfo.pid}).`);
    } catch {
      // Ignore dead/stale process entries.
    }
  }
};

const stopPidFromFile = (): void => {
  try {
    if (!fs.existsSync(CADDY_PID_PATH)) {
      return;
    }

    const pid = Number.parseInt(fs.readFileSync(CADDY_PID_PATH, 'utf8').trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Ignore stale or already-dead PIDs.
    }
  } finally {
    try {
      fs.rmSync(CADDY_PID_PATH, { force: true });
    } catch {
      // Ignore cleanup failures.
    }
  }
};



const buildFrontDoorRoutes = async (repositories: FrontDoorRepositories): Promise<FrontDoorRoute[]> => {
  const [benches, sites] = await Promise.all([
    repositories.benches.findAll(),
    repositories.sites.findAll(),
  ]);

  const benchesById = new Map(benches.map((bench) => [bench.id, bench]));
  const routesByHost = new Map<string, FrontDoorRoute>();

  for (const site of sites) {
    const siteHost = normalizeSiteHost(site.name);
    if (!siteHost || routesByHost.has(siteHost)) {
      continue;
    }

    const bench = benchesById.get(site.benchId);
    if (!bench) {
      continue;
    }

    routesByHost.set(siteHost, {
      siteHost,
      benchPort: resolveBenchHttpPort(bench),
    });
  }

  return Array.from(routesByHost.values()).sort((left, right) => left.siteHost.localeCompare(right.siteHost));
};

export const pruneStaleCaddySiteCertificates = (
  siteHosts: string[],
  certificatesDirectory = CADDY_CERTIFICATES_LOCAL_DIR
): void => {
  const keepHosts = new Set<string>(['localhost']);

  for (const entry of siteHosts) {
    const normalized = normalizeSiteHost(entry);
    if (normalized.endsWith('.localhost')) {
      keepHosts.add(normalized);
    }
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(certificatesDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const directoryName = entry.name.trim().toLowerCase();
    const isManagedLocalBenchCert =
      directoryName === 'localhost' ||
      directoryName.endsWith('.localhost') ||
      directoryName === LEGACY_WILDCARD_CERT_DIR;

    if (!isManagedLocalBenchCert || keepHosts.has(directoryName)) {
      continue;
    }

    try {
      fs.rmSync(path.join(certificatesDirectory, entry.name), { recursive: true, force: true });
      logger.info(`Removed stale Caddy certificate cache for ${directoryName}.`);
    } catch (error) {
      logger.warn(`Failed to remove stale Caddy certificate cache for ${directoryName}: ${error}`);
    }
  }
};

export const buildCaddyfile = (routes: FrontDoorRoute[] = []): string => {
  const orderedRoutes = routes.length > 0 ? [{ siteHost: 'localhost', benchPort: routes[0]!.benchPort }, ...routes] : [];
  const uniqueRoutes = new Map<string, FrontDoorRoute>();

  for (const route of orderedRoutes) {
    if (!uniqueRoutes.has(route.siteHost)) {
      uniqueRoutes.set(route.siteHost, route);
    }
  }

  const routeBlocks = Array.from(uniqueRoutes.values())
    .map(({ siteHost, benchPort }) => {
      return `https://${siteHost} {
  tls internal
  import local_bench_bad_gateway
  reverse_proxy 127.0.0.1:${benchPort} {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Port {server_port}
  }
}`;
    })
    .join('\n\n');

  return `{
  admin off
  servers {
    protocols h1 h2
  }
}

http://localhost, http://*.localhost {
  redir https://{host}{uri} permanent
}

${buildBadGatewayErrorHandler()}

${routeBlocks}
`;
};

class CaddyFrontDoor {
  private process: ChildProcess | null = null;
  private running = false;
  private configKey = '';

  public isRunning(): boolean {
    return this.running;
  }

  public async start(repositories: FrontDoorRepositories): Promise<boolean> {
    const routes = await buildFrontDoorRoutes(repositories);
    if (routes.length === 0) {
      await this.stop();
      return false;
    }

    const siteHostsKey = routes.map((route) => `${route.siteHost}:${route.benchPort}`).join('|');
    const desiredConfig = buildCaddyfile(routes);
    if (this.running && this.configKey === siteHostsKey && canReuseManagedFrontDoor(desiredConfig)) {
      return true;
    }

    if (canReuseManagedFrontDoor(desiredConfig)) {
      this.process = null;
      this.running = true;
      this.configKey = siteHostsKey;
      logger.info('Reusing existing managed Caddy front door process with unchanged config.');
      return true;
    }

    await this.stop();
    stopOrphanFrontDoorProcesses();
    stopPidFromFile();
    pruneStaleCaddySiteCertificates(routes.map((route) => route.siteHost));

    fs.mkdirSync(CADDY_RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(CADDY_CONFIG_PATH, desiredConfig, 'utf8');

    return await new Promise<boolean>((resolve) => {
      const child = spawn(getBinaryPath('caddy'), ['run', '--config', CADDY_CONFIG_PATH, '--adapter', 'caddyfile'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      this.process = child;
      if (typeof child.pid === 'number') {
        fs.writeFileSync(CADDY_PID_PATH, String(child.pid), 'utf8');
      }

      let settled = false;
      const settle = (value: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      const readyTimer = setTimeout(() => {
        this.running = true;
        this.configKey = siteHostsKey;
        settle(true);
      }, 1000);

      child.stdout.on('data', (chunk: Buffer) => {
        logger.info(chunk.toString().trimEnd());
      });

      child.stderr.on('data', (chunk: Buffer) => {
        logger.warn(chunk.toString().trimEnd());
      });

      child.once('error', (error) => {
        clearTimeout(readyTimer);
        this.process = null;
        this.running = false;
        this.configKey = '';
        stopPidFromFile();
        logger.error(`Caddy front door failed to start: ${error}`);
        settle(false);
      });

      child.once('exit', (code, signal) => {
        clearTimeout(readyTimer);
        this.process = null;
        this.running = false;
        this.configKey = '';
        stopPidFromFile();

        if (!settled) {
          logger.error(`Caddy front door exited before becoming ready (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
          settle(false);
          return;
        }

        logger.warn(`Caddy front door stopped (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      });
    });
  }

  public async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    this.running = false;
    this.configKey = '';
    stopPidFromFile();

    if (!child) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill('SIGTERM');
    });
  }
}

const caddyFrontDoor = new CaddyFrontDoor();

export const initializeCaddyFrontDoor = async (repositories: FrontDoorRepositories): Promise<boolean> => {
  return caddyFrontDoor.start(repositories);
};

export const stopCaddyFrontDoor = async (): Promise<void> => {
  await caddyFrontDoor.stop();
};

export const isCaddyFrontDoorRunning = (): boolean => caddyFrontDoor.isRunning();
