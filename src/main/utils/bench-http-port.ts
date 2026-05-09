import fs from 'node:fs';
import path from 'node:path';
import type { Bench } from '../../shared/domain/models';

const DEFAULT_HTTP_PORT = 8080;

const isValidPort = (value: number): boolean => Number.isInteger(value) && value >= 1024 && value <= 65535;

const parseEnvHttpPublishPort = (envContent: string): number | null => {
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== 'HTTP_PUBLISH_PORT') {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const numericValue = Number.parseInt(rawValue, 10);
    if (isValidPort(numericValue)) {
      return numericValue;
    }
  }

  return null;
};

export const resolveBenchHttpPort = (bench: Bench, defaultPort = DEFAULT_HTTP_PORT): number => {
  if (isValidPort(bench.httpPort ?? Number.NaN)) {
    return bench.httpPort as number;
  }

  const envPath = path.join(bench.path, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const parsedPort = parseEnvHttpPublishPort(envContent);
      if (parsedPort !== null) {
        return parsedPort;
      }
    } catch {
      // Use fallback default when env cannot be read.
    }
  }

  return defaultPort;
};
