import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { spawn, type ChildProcess } from 'node:child_process';
import type { Bench, Site } from '@frappe-local/shared/domain/models';
import { createMainLogger } from '@frappe-local/main/logger';
import { getBinaryPath } from '@frappe-local/main/utils/binaries';
import { resolveBenchHttpPort } from '@frappe-local/main/utils/bench-http-port';
import { normalizeSiteHost } from '@frappe-local/shared/utils/site-hostname';
import { BAD_GATEWAY_ERROR_PAGE } from '@frappe-local/main/pages/bad-gateway/page';

const logger = createMainLogger('caddy-front-door');

const CADDY_RUNTIME_DIR = path.join(os.tmpdir(), 'frappe-local-caddy');
const CADDY_CONFIG_PATH = path.join(CADDY_RUNTIME_DIR, 'Caddyfile');
const CADDY_PID_PATH = path.join(CADDY_RUNTIME_DIR, 'caddy.pid');
const CADDY_ADMIN_ADDRESS = 'localhost:29919';
const CADDY_TRUST_TIMEOUT_MS = 60_000;
const CADDY_ROOT_WAIT_TIMEOUT_MS = 10_000;
const getCaddyDataDir = (): string => {
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Caddy'
    );
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Caddy');
  }
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
    'caddy'
  );
};
const CADDY_DATA_DIR = getCaddyDataDir();
const CADDY_ROOT_CERT_PATH = path.join(
  CADDY_DATA_DIR,
  'pki',
  'authorities',
  'local',
  'root.crt'
);
const getCaddyCertificatesLocalDir = (): string => {
  return path.join(CADDY_DATA_DIR, 'certificates', 'local');
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

type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

const runCommand = (
  command: string,
  args: string[],
  timeout = CADDY_TRUST_TIMEOUT_MS
): Promise<CommandResult> => {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
          stdout: stdout || '',
          stderr: stderr || error?.message || '',
        });
      }
    );
  });
};

const waitForFile = async (targetPath: string, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(targetPath)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return fs.existsSync(targetPath);
};

const certificateFingerprint = (certificate: Buffer | string): string => {
  return createHash('sha256').update(new X509Certificate(certificate).raw).digest('hex');
};

const pemCertificates = (value: string): string[] => {
  return value.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
};

const isMacRootTrusted = async (rootFingerprint: string): Promise<boolean> => {
  const keychains = [
    path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db'),
    '/Library/Keychains/System.keychain',
  ];

  for (const keychain of keychains) {
    const result = await runCommand('security', ['find-certificate', '-a', '-p', keychain], 15_000);
    if (result.code !== 0) {
      continue;
    }

    for (const certificate of pemCertificates(result.stdout)) {
      try {
        if (certificateFingerprint(certificate) === rootFingerprint) {
          return true;
        }
      } catch {
        // Ignore malformed or unsupported certificates from the keychain listing.
      }
    }
  }

  return false;
};

const ensureCaddyRootTrusted = async (): Promise<boolean> => {
  if (!await waitForFile(CADDY_ROOT_CERT_PATH, CADDY_ROOT_WAIT_TIMEOUT_MS)) {
    logger.warn(`Caddy root certificate was not generated at ${CADDY_ROOT_CERT_PATH}.`);
    return false;
  }

  if (process.platform === 'darwin') {
    const rootFingerprint = certificateFingerprint(fs.readFileSync(CADDY_ROOT_CERT_PATH));
    if (await isMacRootTrusted(rootFingerprint)) {
      return true;
    }

    const loginKeychain = path.join(os.homedir(), 'Library', 'Keychains', 'login.keychain-db');
    const result = await runCommand('security', [
      'add-trusted-cert',
      '-r',
      'trustRoot',
      '-k',
      loginKeychain,
      CADDY_ROOT_CERT_PATH,
    ]);
    if (result.code === 0 && await isMacRootTrusted(rootFingerprint)) {
      return true;
    }
    logger.warn(`Unable to trust Caddy root certificate in the macOS login keychain: ${result.stderr.trim()}`);
    return false;
  }

  if (process.platform === 'win32') {
    const result = await runCommand('certutil.exe', [
      '-user',
      '-addstore',
      '-f',
      'Root',
      CADDY_ROOT_CERT_PATH,
    ]);
    if (result.code === 0) {
      return true;
    }
    logger.warn(`Unable to trust Caddy root certificate in the Windows user store: ${result.stderr.trim()}`);
    return false;
  }

  const result = await runCommand(getBinaryPath('caddy'), [
    'trust',
    '--address',
    CADDY_ADMIN_ADDRESS,
  ]);
  if (result.code === 0) {
    return true;
  }
  logger.warn(`Unable to trust Caddy root certificate: ${result.stderr.trim()}`);
  return false;
};

const buildBadGatewayErrorHandler = (): string => `(frappe_local_bad_gateway) {
  handle_errors {
    @bad_gateway expression {err.status_code} == 502
    handle @bad_gateway {
      header Content-Type "text/html; charset=utf-8"
      respond <<FRAPPE_LOCAL_502_PAGE
${BAD_GATEWAY_ERROR_PAGE}
FRAPPE_LOCAL_502_PAGE 502
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
      logger.warn(`Stopped orphan Frappe Local Caddy process (pid=${processInfo.pid}).`);
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
    const isManagedFrappeLocalCert =
      directoryName === 'localhost' ||
      directoryName.endsWith('.localhost') ||
      directoryName === LEGACY_WILDCARD_CERT_DIR;

    if (!isManagedFrappeLocalCert || keepHosts.has(directoryName)) {
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
      const proxy = `  import frappe_local_bad_gateway
  handle /socket.io/* {
    reverse_proxy 127.0.0.1:${benchPort + 1000} {
      header_up Host 127.0.0.1
      header_up Origin http://127.0.0.1
      header_up X-Frappe-Site-Name {host}
      header_down Access-Control-Allow-Origin {scheme}://{host}
    }
  }
  reverse_proxy 127.0.0.1:${benchPort} {
    header_up Host {host}
  }`;
      return `http://${siteHost} {
${proxy}
}

https://${siteHost} {
  tls internal
${proxy}
}`;
    })
    .join('\n\n');

  return `{
  admin ${CADDY_ADMIN_ADDRESS}
  skip_install_trust
  servers {
    protocols h1 h2
  }
}

${buildBadGatewayErrorHandler()}

${routeBlocks}
`;
};

class CaddyFrontDoor {
  private process: ChildProcess | null = null;
  private running = false;
  private secure = false;
  private configKey = '';

  public isRunning(): boolean {
    return this.running;
  }

  public isSecure(): boolean {
    return this.running && this.secure;
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
      this.secure = await ensureCaddyRootTrusted();
      return true;
    }

    if (canReuseManagedFrontDoor(desiredConfig)) {
      this.process = null;
      this.running = true;
      this.secure = await ensureCaddyRootTrusted();
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

      const readyTimer = setTimeout(async () => {
        const secure = await ensureCaddyRootTrusted();
        if (this.process !== child) {
          settle(false);
          return;
        }
        this.secure = secure;
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
        this.secure = false;
        this.configKey = '';
        stopPidFromFile();
        logger.error(`Caddy front door failed to start: ${error}`);
        settle(false);
      });

      child.once('exit', (code, signal) => {
        clearTimeout(readyTimer);
        this.process = null;
        this.running = false;
        this.secure = false;
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
    this.secure = false;
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
export const isCaddyFrontDoorSecure = (): boolean => caddyFrontDoor.isSecure();
