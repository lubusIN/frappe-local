import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createMainLogger } from '@frappe-local/main/logger';
import { getBinaryPath } from '@frappe-local/main/utils';
import {
  buildFrontDoorRoutes,
  canBindFrontDoorPort,
  canReuseManagedFrontDoor,
  ensureCaddyRootTrusted,
  stopOrphanFrontDoorProcesses,
  stopPidFromFile,
  pruneStaleCaddySiteCertificates,
  buildCaddyfile,
  FrontDoorRepositories,
  CADDY_HTTP_PORT,
  CADDY_RUNTIME_DIR,
  CADDY_CONFIG_PATH,
  CADDY_PID_PATH
} from './utils';

const logger = createMainLogger('caddy-front-door');

class CaddyFrontDoor {
  private process: ChildProcess | null = null;
  private running = false;
  private secure = false;
  private available = true;
  private configKey = '';
  private includeHttp = true;

  public isRunning(): boolean {
    return this.running;
  }

  public isAvailable(): boolean {
    return this.available;
  }

  public isSecure(): boolean {
    return this.running && this.secure;
  }

  public async start(repositories: FrontDoorRepositories): Promise<boolean> {
    const routes = await buildFrontDoorRoutes(repositories);
    if (routes.length === 0) {
      await this.stop();
      this.available = true;
      return true;
    }

    const includeHttp = this.running ? this.includeHttp : await canBindFrontDoorPort(CADDY_HTTP_PORT);
    if (!includeHttp) {
      logger.warn('Port 80 is unavailable; starting the Caddy front door in HTTPS-only mode.');
    }
    const siteHostsKey = `${includeHttp ? 'http+https' : 'https'}|${routes.map((route) => `${route.siteHost}:${route.benchPort}`).join('|')}`;
    const desiredConfig = buildCaddyfile(routes, { includeHttp });
    if (this.running && this.configKey === siteHostsKey && canReuseManagedFrontDoor(desiredConfig)) {
      const trusted = await ensureCaddyRootTrusted();
      this.secure = true;
      if (!trusted) logger.warn('Caddy HTTPS is available, but its local root certificate is not trusted.');
      this.available = true;
      return true;
    }

    if (canReuseManagedFrontDoor(desiredConfig)) {
      this.process = null;
      this.running = true;
      const trusted = await ensureCaddyRootTrusted();
      this.secure = true;
      this.includeHttp = includeHttp;
      if (!trusted) logger.warn('Caddy HTTPS is available, but its local root certificate is not trusted.');
      this.available = true;
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
    this.available = true;

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
        const trusted = await ensureCaddyRootTrusted();
        if (this.process !== child) {
          settle(false);
          return;
        }
        this.secure = true;
        this.running = true;
        this.available = true;
        this.includeHttp = includeHttp;
        this.configKey = siteHostsKey;
        if (!trusted) logger.warn('Caddy HTTPS is available, but its local root certificate is not trusted.');
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
        this.available = false;
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
        this.available = false;
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
    this.available = true;
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
export const isCaddyFrontDoorAvailable = (): boolean => caddyFrontDoor.isAvailable();
export const isCaddyFrontDoorSecure = (): boolean => caddyFrontDoor.isSecure();
