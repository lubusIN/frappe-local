import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import { createMainLogger } from './logger';
import { getBinaryPath } from './utils/binaries';
import { normalizeSiteHost } from '../shared/site-hostname';

const logger = createMainLogger('caddy-front-door');

const CADDY_RUNTIME_DIR = path.join(os.tmpdir(), 'local-bench-caddy');
const CADDY_CONFIG_PATH = path.join(CADDY_RUNTIME_DIR, 'Caddyfile');
const CADDY_PID_PATH = path.join(CADDY_RUNTIME_DIR, 'caddy.pid');
const CADDY_CERTIFICATES_LOCAL_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Caddy',
  'certificates',
  'local'
);
const LEGACY_WILDCARD_CERT_DIR = 'wildcard_.localhost';

const listProcesses = (): Array<{ pid: number; command: string }> => {
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
  const localBenchTag = getManagedFrontDoorCommandTag();

  for (const processInfo of listProcesses()) {
    if (processInfo.pid === process.pid) {
      continue;
    }

    if (!processInfo.command.includes(localBenchTag)) {
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

const toManagedSiteHosts = (siteHosts: string[]): Set<string> => {
  const hosts = new Set<string>(['localhost']);

  for (const entry of siteHosts) {
    const normalized = normalizeSiteHost(entry);
    if (normalized.endsWith('.localhost')) {
      hosts.add(normalized);
    }
  }

  return hosts;
};

const buildTlsSiteAddresses = (siteHosts: string[]): string => {
  const hosts = toManagedSiteHosts(siteHosts);

  return Array.from(hosts)
    .map((host) => `https://${host}`)
    .join(', ');
};

export const pruneStaleCaddySiteCertificates = (
  siteHosts: string[],
  certificatesDirectory = CADDY_CERTIFICATES_LOCAL_DIR
): void => {
  const keepHosts = toManagedSiteHosts(siteHosts);

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

export const buildCaddyfile = (upstreamPort: number, siteHosts: string[] = []): string => {
  const tlsSiteAddresses = buildTlsSiteAddresses(siteHosts);

  return `{
  admin off
  servers {
    protocols h1 h2
  }
}

http://localhost, http://*.localhost {
  redir https://{host}{uri} permanent
}

${tlsSiteAddresses} {
  tls internal
  reverse_proxy 127.0.0.1:${upstreamPort} {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Port {server_port}
  }
}
`;
};

class CaddyFrontDoor {
  private process: ChildProcess | null = null;
  private running = false;
  private upstreamPort: number | null = null;
  private siteHostsKey = '';

  public isRunning(): boolean {
    return this.running;
  }

  public async start(upstreamPort: number, siteHosts: string[] = []): Promise<boolean> {
    const siteHostsKey = Array.from(toManagedSiteHosts(siteHosts)).sort().join('|');
    if (this.running && this.upstreamPort === upstreamPort && this.siteHostsKey === siteHostsKey) {
      return true;
    }

    const desiredConfig = buildCaddyfile(upstreamPort, siteHosts);
    if (canReuseManagedFrontDoor(desiredConfig)) {
      this.process = null;
      this.running = true;
      this.upstreamPort = upstreamPort;
      this.siteHostsKey = siteHostsKey;
      logger.info('Reusing existing managed Caddy front door process with unchanged config.');
      return true;
    }

    await this.stop();
    stopOrphanFrontDoorProcesses();
    stopPidFromFile();
    pruneStaleCaddySiteCertificates(siteHosts);

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
        this.upstreamPort = upstreamPort;
        this.siteHostsKey = siteHostsKey;
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
        this.upstreamPort = null;
        this.siteHostsKey = '';
        stopPidFromFile();
        logger.error(`Caddy front door failed to start: ${error}`);
        settle(false);
      });

      child.once('exit', (code, signal) => {
        clearTimeout(readyTimer);
        this.process = null;
        this.running = false;
        this.upstreamPort = null;
        this.siteHostsKey = '';
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
    this.upstreamPort = null;
    this.siteHostsKey = '';
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

export const initializeCaddyFrontDoor = async (upstreamPort: number, siteHosts: string[] = []): Promise<boolean> => {
  return caddyFrontDoor.start(upstreamPort, siteHosts);
};

export const stopCaddyFrontDoor = async (): Promise<void> => {
  await caddyFrontDoor.stop();
};

export const isCaddyFrontDoorRunning = (): boolean => caddyFrontDoor.isRunning();