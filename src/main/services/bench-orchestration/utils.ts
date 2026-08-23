import { DEFAULT_HTTP_PORT, execPromise, findNextAvailableTcpPort, getBinaryPath, isTcpPortFree } from '@frappe-local/main/utils';
import { errorMessage, filterNonCoreApps } from '@frappe-local/shared/core';
import path from 'node:path';
import fs from 'node:fs';
import { getRuntimeEnv } from '../runtime-service';
import { getDefaultAppCatalogSeed } from '../catalog-provider';
import type { AppCatalogItem, Bench, CustomAppItem } from '@frappe-local/shared/domain';
import { composeExecArgs, getComposeProjectName } from '@frappe-local/main/utils/podman';
import { IDLE_TIMEOUT_MS, MAX_WALL_CLOCK_MS } from '@frappe-local/main/constants';

export const resolveAndPersistBenchPort = async (
  bench: Bench,
  benchesRepo: { update: (id: string, payload: Partial<Bench>) => Promise<Bench | null> },
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  allowPortShift: boolean
): Promise<Bench> => {
  const preferredPort = bench.httpPort ?? DEFAULT_HTTP_PORT;

  if (!allowPortShift) {
    return { ...bench, httpPort: preferredPort };
  }

  const isPreferredPortFree = await isTcpPortFree(preferredPort);
  if (isPreferredPortFree) {
    if (bench.httpPort !== preferredPort) {
      const updated = await benchesRepo.update(bench.id, { httpPort: preferredPort });
      return updated ?? { ...bench, httpPort: preferredPort };
    }
    return { ...bench, httpPort: preferredPort };
  }

  const nextPort = await findNextAvailableTcpPort(preferredPort + 1);
  context.log('warning', `HTTP port ${preferredPort} is busy. Reassigning ${bench.name} to ${nextPort}.`, 'env');

  const updated = await benchesRepo.update(bench.id, { httpPort: nextPort });
  return updated ?? { ...bench, httpPort: nextPort };
};

export const resolveBenchBranch = (frappeVersion: string): string => {
  const normalized = frappeVersion.trim().toLowerCase();

  if (normalized === 'develop') {
    return 'develop';
  }

  const branchStyle = normalized.match(/^version-(\d+)$/);
  if (branchStyle) {
    return `version-${branchStyle[1]}`;
  }

  const semverStyle = normalized.match(/^v?(\d+)(?:\.\d+){0,2}$/);
  if (semverStyle) {
    return `version-${semverStyle[1]}`;
  }

  return 'develop';
};

export const resolveCatalogBranch = (catalogItem: AppCatalogItem | null, benchFrappeVersion: string): string | null => {
  if (!catalogItem) {
    return null;
  }

  const benchBranch = resolveBenchBranch(benchFrappeVersion);
  const defaultCatalogByAppId = new Map(getDefaultAppCatalogSeed().map((item) => [item.id, item]));
  const fallbackCatalogItem = defaultCatalogByAppId.get(catalogItem.id);
  const catalogInstallBranches = catalogItem.installBranches;
  const catalogMappedBranch = catalogInstallBranches?.[benchBranch]
    ?? catalogInstallBranches?.[benchFrappeVersion.trim().toLowerCase()];
  if (catalogMappedBranch?.trim()) {
    return catalogMappedBranch.trim();
  }

  const catalogInstallBranch = catalogItem.installBranch?.trim();
  const fallbackInstallBranch = fallbackCatalogItem?.installBranch?.trim();
  const fallbackInstallBranches = fallbackCatalogItem?.installBranches;

  // Persisted catalogs from older snapshots may only contain installBranch, while
  // newer defaults provide a branch matrix (e.g. wiki version-16 -> develop).
  // If both installBranch values match and there is no per-item matrix, prefer
  // the default matrix for the target bench branch.
  const shouldPreferFallbackMatrix =
    !catalogInstallBranches
    && Boolean(catalogInstallBranch)
    && catalogInstallBranch === fallbackInstallBranch
    && Boolean(fallbackInstallBranches);

  if (shouldPreferFallbackMatrix) {
    const fallbackMappedBranch = fallbackInstallBranches?.[benchBranch]
      ?? fallbackInstallBranches?.[benchFrappeVersion.trim().toLowerCase()];
    if (fallbackMappedBranch?.trim()) {
      return fallbackMappedBranch.trim();
    }
  }

  if (catalogInstallBranch) {
    return catalogInstallBranch;
  }

  const fallbackMappedBranch = fallbackInstallBranches?.[benchBranch]
    ?? fallbackInstallBranches?.[benchFrappeVersion.trim().toLowerCase()];
  if (fallbackMappedBranch?.trim()) {
    return fallbackMappedBranch.trim();
  }

  if (fallbackInstallBranch) {
    return fallbackInstallBranch;
  }

  const version = catalogItem.version.trim().toLowerCase();
  if (!version) {
    return null;
  }

  if (version === 'develop') {
    return 'develop';
  }

  const semverStyle = version.match(/^v?(\d+)(?:\.\d+){0,2}$/);
  if (!semverStyle) {
    return null;
  }

  return `version-${semverStyle[1]}`;
};

export const cleanupBenchAppArtifacts = async (
  benchPath: string,
  appIds: readonly string[],
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string,
  containerEnv?: BenchContainerEnv
): Promise<void> => {
  if (appIds.length === 0) {
    return;
  }

  const uniqueAppIds = [...new Set(appIds.map((app) => app.trim()).filter(Boolean))];
  if (uniqueAppIds.length === 0) {
    return;
  }

  if (process.platform === 'win32' && containerEnv) {
    const script = [
      'from pathlib import Path',
      'import shutil, sys',
      'apps = sys.argv[1:]',
      '[shutil.rmtree(Path("apps") / app, ignore_errors=True) for app in apps]',
      '[shutil.rmtree(Path("sites/assets") / app, ignore_errors=True) for app in apps]',
      'apps_txt = Path("sites/apps.txt")',
      'existing = apps_txt.read_text().splitlines() if apps_txt.exists() else []',
      'kept = [line.strip() for line in existing if line.strip() and line.strip() not in apps]',
      'apps_txt.write_text(("\\n".join(kept) + "\\n") if kept else "")',
    ].join('; ');
    const result = await execPromise(
      containerEnv.runtimeCmd,
      composeExecArgs(containerEnv.projectName, 'frappe', ['python', '-c', script, ...uniqueAppIds]),
      benchPath,
      undefined,
      containerEnv.runtimeEnv,
      { idleTimeout: 60000, maxTimeout: 120000 }
    );
    if (result.code !== 0) {
      context.log('warning', `Failed to clean container workspace app artifacts: ${result.stderr || result.stdout}`, stepId);
    }
    return;
  }

  const appsDir = path.join(benchPath, 'apps');
  const assetsDir = path.join(benchPath, 'sites', 'assets');
  const appsTxtPath = path.join(benchPath, 'sites', 'apps.txt');

  for (const app of uniqueAppIds) {
    try {
      await fs.promises.rm(path.join(appsDir, app), { recursive: true, force: true });
    } catch (error) {
      context.log('warning', `Failed to cleanup app directory for ${app}: ${errorMessage(error)}`, stepId);
    }

    try {
      await fs.promises.rm(path.join(assetsDir, app), { recursive: true, force: true });
    } catch (error) {
      context.log('warning', `Failed to cleanup app assets for ${app}: ${errorMessage(error)}`, stepId);
    }
  }

  if (!fs.existsSync(appsTxtPath)) {
    return;
  }

  try {
    const existing = fs.readFileSync(appsTxtPath, 'utf8');
    const filtered = existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !uniqueAppIds.includes(line));
    const content = filtered.length > 0 ? `${filtered.join('\n')}\n` : '';
    fs.writeFileSync(appsTxtPath, content, 'utf8');
  } catch (error) {
    context.log('warning', `Failed to cleanup apps.txt after install failure: ${errorMessage(error)}`, stepId);
  }
};

export type BenchContainerEnv = {
  projectName: string;
  runtimeCmd: string;
  runtimeEnv: NodeJS.ProcessEnv;
};

export const updateContainerAppsTxt = async (
  benchPath: string,
  containerEnv: BenchContainerEnv,
  mode: 'normalize' | 'add',
  appName = ''
): Promise<string[]> => {
  const script = [
    'from pathlib import Path',
    'import sys',
    'path = Path("sites/apps.txt")',
    'apps = [line.strip() for line in path.read_text().splitlines() if line.strip()] if path.exists() else []',
    'app = sys.argv[2]',
    'apps.append(app) if sys.argv[1] == "add" and app and app not in apps else None',
    'path.parent.mkdir(parents=True, exist_ok=True)',
    'path.write_text(("\\n".join(apps) + "\\n") if apps else "")',
    'print("\\n".join(apps))',
  ].join('; ');
  const result = await execPromise(
    containerEnv.runtimeCmd,
    composeExecArgs(containerEnv.projectName, 'frappe', ['python', '-c', script, mode, appName]),
    benchPath,
    undefined,
    containerEnv.runtimeEnv,
    { idleTimeout: 30000, maxTimeout: 60000 }
  );
  if (result.code !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
};

export const ensureBenchProcfile = async (
  benchPath: string,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string,
  containerEnv?: BenchContainerEnv
): Promise<void> => {
  const procfilePath = path.join(benchPath, 'Procfile');
  const content = [
    'web: DEV_SERVER=0 FRAPPE_BIND_ADDR=0.0.0.0 bench serve --port 8000 --proxy',
    'socketio: FRAPPE_SOCKETIO_PORT=9000 node apps/frappe/socketio.js',
    'watch: bench watch',
    'schedule: bench schedule',
    'worker: bench worker 1>> logs/worker.log 2>> logs/worker.error.log',
    '',
  ].join('\n');

  try {
    if (process.platform === 'win32' && containerEnv) {
      const encodedContent = Buffer.from(content, 'utf8').toString('base64');
      const result = await execPromise(
        containerEnv.runtimeCmd,
        composeExecArgs(containerEnv.projectName, 'frappe', [
          'python', '-c',
          'import base64, pathlib, sys; pathlib.Path("Procfile").write_bytes(base64.b64decode(sys.argv[1]))',
          encodedContent,
        ]),
        benchPath,
        undefined,
        containerEnv.runtimeEnv,
        { idleTimeout: 30000, maxTimeout: 60000 }
      );
      if (result.code !== 0) throw new Error(result.stderr || result.stdout);
      return;
    }
    fs.writeFileSync(procfilePath, content, 'utf8');
  } catch (error) {
    context.log('warning', `Failed to write managed Procfile: ${errorMessage(error)}`, stepId);
  }
};

export const ensureBenchDevcontainer = async (
  benchPath: string,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string,
  envOverride?: NodeJS.ProcessEnv,
  benchId?: string
): Promise<void> => {
  const devcontainerDir = path.join(benchPath, '.devcontainer');
  const devcontainerBinDir = path.join(devcontainerDir, 'bin');
  const vscodeDir = path.join(benchPath, '.vscode');
  const devcontainerPath = path.join(devcontainerDir, 'devcontainer.json');
  const composeProjectPath = path.join(devcontainerDir, 'compose-project.yml');
  const settingsPath = path.join(vscodeDir, 'settings.json');
  const composeProjectName = benchId ? getComposeProjectName(benchId) : '';

  const content = JSON.stringify({
    name: 'Frappe Local Bench',
    dockerComposeFile: [
      '../.frappe-local/docker-compose.yml',
      ...(composeProjectName ? ['./compose-project.yml'] : []),
    ],
    service: 'frappe',
    workspaceFolder: '/workspace',
    // Bench lifecycle is owned by Frappe Local. Closing VS Code must not stop
    // the Compose project (and its database/Redis containers).
    shutdownAction: 'none',
    // Avoid VS Code's extra login-shell exec on Windows, where it can overload
    // Podman's concurrent stdin attaches. Preserve normal probing elsewhere.
    ...(process.platform === 'win32' ? { userEnvProbe: 'none' } : {}),
    customizations: {
      vscode: {
        settings: {
          'python.defaultInterpreterPath': '/workspace/env/bin/python',
          'python.terminal.activateEnvironment': true,
        },
        extensions: [
          'ms-python.python',
          'dbaeumer.vscode-eslint',
          'Vue.volar',
          'bradlc.vscode-tailwindcss',
        ],
      },
    },
  }, null, 2) + '\n';

  try {
    if (!fs.existsSync(devcontainerDir)) {
      fs.mkdirSync(devcontainerDir, { recursive: true });
    }
    if (!fs.existsSync(devcontainerBinDir)) {
      fs.mkdirSync(devcontainerBinDir, { recursive: true });
    }
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    fs.writeFileSync(devcontainerPath, content, 'utf8');
    if (composeProjectName) {
      fs.writeFileSync(composeProjectPath, `name: ${composeProjectName}\n`, 'utf8');
    }

    const runtimeEnv: Record<string, string | undefined> = envOverride ?? (await getRuntimeEnv().catch(() => ({} as Record<string, string | undefined>)));
    const podmanPath = getBinaryPath('podman');
    const composePath = getBinaryPath('docker-compose');
    const dockerHost = runtimeEnv['DOCKER_HOST'] || process.env['DOCKER_HOST'] || '';
    const dockerConfig = runtimeEnv['DOCKER_CONFIG'] || process.env['DOCKER_CONFIG'] || '';
    if (process.platform === 'win32') {
      const composeProjectBat = composeProjectName ? `if not defined COMPOSE_PROJECT_NAME set COMPOSE_PROJECT_NAME=${composeProjectName}\r\n` : '';
      const dockerBat = `@echo off\r\nif not defined DOCKER_HOST set DOCKER_HOST=${dockerHost}\r\nif not defined CONTAINER_HOST set CONTAINER_HOST=%DOCKER_HOST%\r\nif not defined DOCKER_CONFIG set DOCKER_CONFIG=${dockerConfig}\r\n"${podmanPath}" %*\r\n`;
      const composeBat = `@echo off\r\nif not defined DOCKER_HOST set DOCKER_HOST=${dockerHost}\r\nif not defined CONTAINER_HOST set CONTAINER_HOST=%DOCKER_HOST%\r\nif not defined DOCKER_CONFIG set DOCKER_CONFIG=${dockerConfig}\r\n${composeProjectBat}"${composePath}" %*\r\n`;
      fs.writeFileSync(path.join(devcontainerBinDir, 'docker.bat'), dockerBat, 'utf8');
      fs.writeFileSync(path.join(devcontainerBinDir, 'docker-compose.bat'), composeBat, 'utf8');
    } else {
      const composeProjectSh = composeProjectName ? `export COMPOSE_PROJECT_NAME="\${COMPOSE_PROJECT_NAME:-${composeProjectName}}"\n` : '';
      const dockerSh = `#!/bin/sh\nexport DOCKER_HOST="\${DOCKER_HOST:-${dockerHost}}"\nexport CONTAINER_HOST="\${CONTAINER_HOST:-$DOCKER_HOST}"\nexport DOCKER_CONFIG="\${DOCKER_CONFIG:-${dockerConfig}}"\nexec "${podmanPath}" "$@"\n`;
      const composeSh = `#!/bin/sh\nexport DOCKER_HOST="\${DOCKER_HOST:-${dockerHost}}"\nexport CONTAINER_HOST="\${CONTAINER_HOST:-$DOCKER_HOST}"\nexport DOCKER_CONFIG="\${DOCKER_CONFIG:-${dockerConfig}}"\n${composeProjectSh}exec "${composePath}" "$@"\n`;
      const dockerShPath = path.join(devcontainerBinDir, 'docker');
      const composeShPath = path.join(devcontainerBinDir, 'docker-compose');
      fs.writeFileSync(dockerShPath, dockerSh, 'utf8');
      fs.writeFileSync(composeShPath, composeSh, 'utf8');
      fs.chmodSync(dockerShPath, '755');
      fs.chmodSync(composeShPath, '755');
    }

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {
        settings = {};
      }
    }

    // Dev Containers switches into the Podman WSL distribution on Windows,
    // where the app provisions a Docker CLI connected to Podman's API socket.
    settings['dev.containers.dockerPath'] = process.platform === 'win32'
      ? 'docker'
      : path.join(devcontainerBinDir, 'docker');
    if (process.platform === 'win32') {
      delete settings['dev.containers.dockerComposePath'];
    } else {
      settings['dev.containers.dockerComposePath'] = path.join(devcontainerBinDir, 'docker-compose');
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  } catch (error) {
    context.log('warning', `Failed to write managed devcontainer.json: ${errorMessage(error)}`, stepId);
  }
};

export const getFirstBenchSiteName = (benchPath: string): string | null => {
  const sitesPath = path.join(benchPath, 'sites');
  if (!fs.existsSync(sitesPath)) {
    return null;
  }

  try {
    const siteNames = fs.readdirSync(sitesPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !['assets', 'archived_sites', 'common_site_config.json'].includes(name))
      .sort((left, right) => left.localeCompare(right));

    return siteNames[0] ?? null;
  } catch {
    return null;
  }
};

export const ensureBenchSocketioPort = async (
  benchPath: string,
  _httpPort: number,
  context: { log: (level: 'info' | 'warning' | 'error', message: string, stepId?: string) => void },
  stepId: string,
  containerEnv?: BenchContainerEnv
): Promise<void> => {
  try {
    if (process.platform === 'win32' && containerEnv) {
      const script = [
        'import json',
        'from pathlib import Path',
        'sites = Path("sites")',
        'config_path = sites / "common_site_config.json"',
        'config = json.loads(config_path.read_text()) if config_path.exists() else {}',
        'config["socketio_port"] = 443',
        'config["dns_multitenant"] = True',
        'config.pop("default_site", None)',
        'config_path.write_text(json.dumps(config, indent=1))',
        'ignored = {"assets", "archived_sites", "languages"}',
        'site_names = sorted(p.name for p in sites.iterdir() if p.is_dir() and p.name not in ignored)',
        'current_path = sites / "currentsite.txt"',
        'current = current_path.read_text().strip() if current_path.exists() else ""',
        'current_valid = bool(current) and (sites / current).is_dir()',
        'current_path.write_text(site_names[0]) if not current_valid and site_names else (current_path.unlink(missing_ok=True) if not current_valid else None)',
      ].join('; ');
      const result = await execPromise(
        containerEnv.runtimeCmd,
        composeExecArgs(containerEnv.projectName, 'frappe', ['python', '-c', script]),
        benchPath,
        undefined,
        containerEnv.runtimeEnv,
        { idleTimeout: 30000, maxTimeout: 60000 }
      );
      if (result.code !== 0) throw new Error(result.stderr || result.stdout);
      return;
    }
    const configPath = path.join(benchPath, 'sites', 'common_site_config.json');
    if (!fs.existsSync(configPath)) {
      return;
    }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Keep the key present for apps that import common_site_config.json at build
    // time, but point browser clients back at the Caddy HTTPS front door instead
    // of the raw Socket.IO container port.
    let changed = false;
    const socketioPort = 443;
    if (configData.socketio_port !== socketioPort) {
      configData.socketio_port = socketioPort;
      changed = true;
    }

    if (!configData.dns_multitenant) {
      configData.dns_multitenant = true;
      changed = true;
    }

    if (configData.default_site !== undefined) {
      delete configData.default_site;
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 1), 'utf8');
    }

    try {
      const defaultSite = getFirstBenchSiteName(benchPath);
      const currentSitePath = path.join(benchPath, 'sites', 'currentsite.txt');
      if (fs.existsSync(currentSitePath)) {
        const currentSite = fs.readFileSync(currentSitePath, 'utf8').trim();
        const siteFolderPath = path.join(benchPath, 'sites', currentSite);
        if (!fs.existsSync(siteFolderPath)) {
          if (defaultSite) {
            fs.writeFileSync(currentSitePath, defaultSite, 'utf8');
          } else {
            fs.unlinkSync(currentSitePath);
          }
        }
      } else if (defaultSite) {
        fs.writeFileSync(currentSitePath, defaultSite, 'utf8');
      }
    } catch (csErr) {
      context.log('warning', `Failed to update currentsite.txt: ${errorMessage(csErr)}`, stepId);
    }
  } catch (error) {
    context.log('warning', `Failed to configure socketio port: ${errorMessage(error)}`, stepId);
  }
};

export const normalizeBenchApps = (apps?: readonly string[] | null): string[] => {
  if (!apps) return [];
  return Array.from(new Set(apps.map((app) => app.trim()).filter(Boolean)));
};

export const getLocalAppVolumes = async (appNames: readonly string[], customAppsRepo?: { findAll?: () => Promise<CustomAppItem[]> }): Promise<Array<{ source: string; target: string }>> => {
  if (!customAppsRepo?.findAll) return [];
  const customAppsList = await customAppsRepo.findAll();
  const localVolumes: Array<{ source: string; target: string }> = [];

  const safeAppNames = Array.isArray(appNames)
    ? appNames
    : (typeof appNames === 'string' ? [appNames] : []);
  for (const app of safeAppNames) {
    const customApp = customAppsList.find((candidate) => candidate.id === app || candidate.name === app);
    if (customApp && customApp.type === 'local' && customApp.source) {
      localVolumes.push({
        source: customApp.source,
        target: `/workspace/apps/${customApp.name}`,
      });
    }
  }
  return localVolumes;
};

export const getAppDelta = (previousApps: readonly string[], nextApps: readonly string[]) => {
  const previous = normalizeBenchApps(previousApps);
  const next = normalizeBenchApps(nextApps);

  return {
    previous,
    next,
    install: filterNonCoreApps(next).filter((app) => !previous.includes(app)),
    remove: filterNonCoreApps(previous).filter((app) => !next.includes(app)),
  };
};

export const restartBenchProcesses = async (
  env: {
    projectName: string;
    benchPath: string;
    runtimeCmd: string;
    runtimeEnv: NodeJS.ProcessEnv;
  },
  context?: import('@frappe-local/main/services').TaskExecutionContext
) => {
  if (context) context.startStep('restart', 'Restarting bench processes');
  
  // Kill existing honcho/bench start process
  await execPromise(
    env.runtimeCmd,
    ['-p', env.projectName, 'exec', '-T', 'frappe', 'pkill', 'honcho'],
    env.benchPath,
    undefined,
    env.runtimeEnv,
    { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  ).catch(() => ({ code: 0 })); // Ignore error if it's not running

  // Start it again using bench start
  const restartResult = await execPromise(
    env.runtimeCmd,
    ['-p', env.projectName, 'exec', '-d', 'frappe', 'bench', 'start'],
    env.benchPath,
    context ? (out) => context.log('info', out, 'restart') : undefined,
    env.runtimeEnv,
    { idleTimeout: IDLE_TIMEOUT_MS, maxTimeout: MAX_WALL_CLOCK_MS }
  );

  if (restartResult.code !== 0) {
    throw new Error(`Failed to restart bench processes: ${restartResult.stderr}`);
  }

  // Brief delay to let processes initialize
  await new Promise(resolve => setTimeout(resolve, 3000));
  if (context) context.completeStep('restart', 'Bench processes restarted');
};
