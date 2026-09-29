import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { MIN_PODMAN_MEMORY_MB } from '@frappe-local/shared/domain';
import { createMainLogger } from '@frappe-local/main/logger';

const logger = createMainLogger('runtime');

let podmanMemoryProvider = async (): Promise<number> => MIN_PODMAN_MEMORY_MB;
let wslConfigPathProvider = (): string => path.join(os.homedir(), '.wslconfig');

export const configurePodmanMemoryProvider = (
  provider: () => Promise<number>
): void => {
  podmanMemoryProvider = provider;
};

export const configureWslConfigPathProvider = (provider: () => string): void => {
  wslConfigPathProvider = provider;
};

export const normalizePodmanMemoryMb = (memoryMb: number): number => {
  const systemMemoryMb = Math.floor(os.totalmem() / (1024 * 1024));
  return Math.min(
    Math.max(Math.round(memoryMb), MIN_PODMAN_MEMORY_MB),
    Math.max(systemMemoryMb, MIN_PODMAN_MEMORY_MB)
  );
};

export const getConfiguredPodmanMemoryMb = async (): Promise<number> => {
  try {
    return normalizePodmanMemoryMb(await podmanMemoryProvider());
  } catch (error) {
    logger.warn(`Failed to read Podman memory setting: ${error}`);
    return MIN_PODMAN_MEMORY_MB;
  }
};

export const updateWslConfigMemory = (contents: string, memoryMb: number): string => {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents ? contents.split(/\r?\n/) : [];
  const sectionStart = lines.findIndex((line) => /^\s*\[wsl2\]\s*$/i.test(line));
  const memoryLine = `memory=${normalizePodmanMemoryMb(memoryMb)}MB`;

  if (sectionStart === -1) {
    const prefix = lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
    if (prefix.length > 0 && prefix[prefix.length - 1]?.trim()) {
      prefix.push('');
    }
    return [...prefix, '[wsl2]', memoryLine, ''].join(newline);
  }

  const nextSectionOffset = lines
    .slice(sectionStart + 1)
    .findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  const sectionEnd = nextSectionOffset === -1
    ? lines.length
    : sectionStart + 1 + nextSectionOffset;
  const existingMemoryIndex = lines
    .slice(sectionStart + 1, sectionEnd)
    .findIndex((line) => /^\s*memory\s*=/i.test(line));

  if (existingMemoryIndex >= 0) {
    lines[sectionStart + 1 + existingMemoryIndex] = memoryLine;
  } else {
    lines.splice(sectionStart + 1, 0, memoryLine);
  }

  const result = lines.join(newline);
  return result.endsWith(newline) ? result : `${result}${newline}`;
};

export const writeWslMemoryConfig = (memoryMb: number): boolean => {
  const configPath = wslConfigPathProvider();
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const updated = updateWslConfigMemory(existing, memoryMb);
  if (updated === existing) {
    return false;
  }

  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, updated, 'utf8');
    fs.renameSync(temporaryPath, configPath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
  return true;
};
