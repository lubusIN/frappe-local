import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import defaultCatalog from '../src/main/default-catalog.json' with { type: 'json' };

const appSupportPath = path.join(os.homedir(), 'Library', 'Application Support', 'Frappe Cafe');
const storagePath = path.join(appSupportPath, 'storage');
const configPath = path.join(appSupportPath, 'config');
const storageFilePath = path.join(storagePath, 'storage.json');
const APP_CATALOG_SEED_VERSION = 5;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const composeBinary = path.join(repoRoot, 'bin', 'docker-compose');
const podmanBinary = path.join(repoRoot, 'bin', 'podman');

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

const runBestEffort = (label, command, args, cwd) => {
  if (!fs.existsSync(command)) {
    console.log(`[reset-dev-state] Skipping ${label}: missing binary ${command}`);
    return { code: 0, stdout: '', stderr: '' };
  }

  const result = run(command, args, cwd);
  if (result.code !== 0) {
    const reason = result.stderr.trim() || result.stdout.trim() || 'unknown error';
    console.log(`[reset-dev-state] ${label} failed: ${reason}`);
  }

  return result;
};

const readBenches = () => {
  if (!fs.existsSync(storageFilePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(storageFilePath, 'utf8');
    const snapshot = JSON.parse(raw);
    return Array.isArray(snapshot.benches) ? snapshot.benches : [];
  } catch {
    return [];
  }
};

const listPodmanNames = (args) => {
  const result = runBestEffort(`list podman resources (${args.join(' ')})`, podmanBinary, args);
  if (result.code !== 0) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const benches = readBenches();
for (const bench of benches) {
  if (!bench?.id || typeof bench.id !== 'string') {
    continue;
  }

  const projectName = `frappe-cafe-${bench.id.slice(0, 8)}`;
  const benchPath = typeof bench.path === 'string' ? bench.path : repoRoot;
  runBestEffort(
    `docker compose down for ${projectName}`,
    composeBinary,
    ['-p', projectName, 'down', '-v', '--remove-orphans'],
    benchPath
  );
}

const containerIds = listPodmanNames(['ps', '-a', '--filter', 'name=frappe-cafe-', '--format', '{{.ID}}']);
if (containerIds.length > 0) {
  runBestEffort('remove frappe-cafe containers', podmanBinary, ['rm', '-f', ...containerIds]);
}

const volumeNames = listPodmanNames(['volume', 'ls', '--filter', 'name=frappe-cafe-', '--format', '{{.Name}}']);
if (volumeNames.length > 0) {
  runBestEffort('remove frappe-cafe volumes', podmanBinary, ['volume', 'rm', '-f', ...volumeNames]);
}

const networkNames = listPodmanNames(['network', 'ls', '--filter', 'name=frappe-cafe-', '--format', '{{.Name}}']);
if (networkNames.length > 0) {
  runBestEffort('remove frappe-cafe networks', podmanBinary, ['network', 'rm', ...networkNames]);
}

const targets = [storagePath, configPath];

for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.log(`[reset-dev-state] Skipping missing path: ${target}`);
    continue;
  }

  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[reset-dev-state] Removed: ${target}`);
}

fs.mkdirSync(storagePath, { recursive: true });

const timestamp = new Date().toISOString();
const freshSnapshot = {
  schemaVersion: 2,
  metadata: {
    createdAt: timestamp,
    updatedAt: timestamp,
    appCatalogSeedVersion: APP_CATALOG_SEED_VERSION,
    lastMigratedAt: null,
  },
  benches: [],
  sites: [],
  settings: null,
  appCatalog: defaultCatalog,
};

fs.writeFileSync(storageFilePath, JSON.stringify(freshSnapshot, null, 2), 'utf8');
console.log(`[reset-dev-state] Recreated fresh storage snapshot: ${storageFilePath}`);

console.log('[reset-dev-state] Dev state reset complete.');
