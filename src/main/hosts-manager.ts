import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execPromise } from './utils/exec';
import { createMainLogger } from './logger';

const logger = createMainLogger('hosts-manager');

const getHostsFilePath = (): string => {
  if (process.platform === 'win32') {
    const winDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    return path.join(winDir, 'System32', 'drivers', 'etc', 'hosts');
  }
  return '/etc/hosts';
};

const HOSTS_FILE = getHostsFilePath();
const MARKER_PREFIX = '# local-bench:';
const LOCAL_BENCH_BLOCK_START = '#LOCAL-BENCH-START';
const LOCAL_BENCH_BLOCK_END = '#LOCAL-BENCH-END';

const HOSTS_PERMISSION_PROMPT_BASE =
  process.platform === 'win32'
    ? 'Local Bench needs administrator permission to update the hosts file for local site routing.'
    : 'Local Bench needs administrator permission to update /etc/hosts for local site routing.';

const escapeAppleScriptString = (value: string): string => value.replace(/"/g, '\\"');

const buildPrivilegedShellScript = (command: string, prompt: string): string =>
  `do shell script "${escapeAppleScriptString(command)}" with administrator privileges with prompt "${escapeAppleScriptString(prompt)}"`;

const quoteForShell = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const isSystemResolvedLocalhostDomain = (siteName: string): boolean => {
  const normalized = siteName.trim().toLowerCase();
  return normalized === 'localhost' || normalized.endsWith('.localhost');
};

const findLocalBenchBlockBounds = (lines: string[]): { start: number; end: number } | null => {
  const start = lines.indexOf(LOCAL_BENCH_BLOCK_START);
  const end = lines.indexOf(LOCAL_BENCH_BLOCK_END);
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return { start, end };
};

const ensureLocalBenchBlock = (content: string): { lines: string[]; start: number; end: number } => {
  const lines = content.split('\n');
  const bounds = findLocalBenchBlockBounds(lines);
  if (bounds) {
    return { lines, start: bounds.start, end: bounds.end };
  }

  const workingLines = [...lines];

  // Remove trailing empty lines so we can append a cleanly separated block.
  while (workingLines.length > 0 && workingLines[workingLines.length - 1] === '') {
    workingLines.pop();
  }

  if (workingLines.length > 0) {
    workingLines.push('');
  }

  const start = workingLines.length;
  workingLines.push(LOCAL_BENCH_BLOCK_START);
  const end = workingLines.length;
  workingLines.push(LOCAL_BENCH_BLOCK_END);

  return { lines: workingLines, start, end };
};

const writeHostsContent = async (newContent: string, promptAction: string): Promise<boolean> => {
  if (process.platform === 'darwin') {
    const tempPath = path.join(os.tmpdir(), `local-bench-hosts-${Date.now()}`);
    try {
      fs.writeFileSync(tempPath, newContent, 'utf8');
      const script = buildPrivilegedShellScript(
        `cp ${quoteForShell(tempPath)} ${HOSTS_FILE} && rm ${quoteForShell(tempPath)}`,
        `${HOSTS_PERMISSION_PROMPT_BASE} Action: ${promptAction}.`
      );
      const { code } = await execPromise('osascript', ['-e', script]);
      if (code !== 0) {
        logger.error(`Failed to update hosts file on macOS for action: ${promptAction}`);
      }
      return code === 0;
    } catch (error) {
      logger.error(`Failed to update hosts file for action ${promptAction}:`, error);
      return false;
    } finally {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (err) {
        logger.warn(`Failed to clean up temp file ${tempPath}: ${err}`);
      }
    }
  }

  // Try direct write first (useful for Windows when running as admin, or when hosts is writable)
  try {
    fs.writeFileSync(HOSTS_FILE, newContent, 'utf8');
    return true;
  } catch {
    // If direct write fails, elevate privileges
    const tempPath = path.join(os.tmpdir(), `local-bench-hosts-${Date.now()}`);
    try {
      fs.writeFileSync(tempPath, newContent, 'utf8');

      if (process.platform === 'win32') {
        const powershellCmd = `Start-Process powershell -ArgumentList '-NoProfile', '-Command', 'Copy-Item -Path ''${tempPath}'' -Destination ''${HOSTS_FILE}'' -Force' -Verb RunAs -Wait -WindowStyle Hidden`;
        const { code } = await execPromise('powershell.exe', ['-NoProfile', '-Command', powershellCmd]);
        if (code !== 0) {
          logger.error(`Failed to update hosts file on Windows for action: ${promptAction}`);
        }
        return code === 0;
      }

      // Linux/POSIX fallback
      const command = `cp ${quoteForShell(tempPath)} ${HOSTS_FILE} && rm ${quoteForShell(tempPath)}`;
      const { code } = await execPromise('sudo', ['sh', '-c', command]);
      if (code !== 0) {
        logger.error(`Failed to update hosts file on Linux for action: ${promptAction}`);
      }
      return code === 0;
    } catch (error) {
      logger.error(`Failed to update hosts file for action ${promptAction}:`, error);
      return false;
    } finally {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (err) {
        logger.warn(`Failed to clean up temp file ${tempPath}: ${err}`);
      }
    }
  }
};

/**
 * Manages /etc/hosts entries for local site domains.
 *
 * Each managed line is tagged with a trailing comment so we can
 * identify and clean up entries without touching user-managed lines.
 *
 * Format: `127.0.0.1  my-site.local  # local-bench:<benchId>`
 */

/**
 * Add a hosts entry for a site domain.
 * Uses osascript to elevate privileges on macOS.
 */
export const addHostsEntry = async (siteName: string, benchId: string): Promise<boolean> => {
  try {
    if (isSystemResolvedLocalhostDomain(siteName)) {
      logger.info(`Skipping hosts entry for ${siteName}; .localhost is resolved by the system.`);
      return true;
    }

    const existing = fs.readFileSync(HOSTS_FILE, 'utf8');
    const entryLine = `127.0.0.1  ${siteName}  ${MARKER_PREFIX}${benchId}`;

    if (existing.includes(`127.0.0.1  ${siteName}`) || existing.includes(`127.0.0.1\t${siteName}`)) {
      logger.info(`Hosts entry for ${siteName} already exists, skipping.`);
      return true;
    }

    const block = ensureLocalBenchBlock(existing);
    const updatedLines = [...block.lines];
    updatedLines.splice(block.end, 0, entryLine);
    const updatedContent = `${updatedLines.join('\n')}\n`;

    const updated = await writeHostsContent(updatedContent, `Add host entry for ${siteName}`);
    if (!updated) {
      logger.error(`Failed to add hosts entry for ${siteName}`);
      return false;
    }

    logger.info(`Added hosts entry: ${siteName} → 127.0.0.1`);
    return true;
  } catch (error) {
    logger.error(`Failed to add hosts entry for ${siteName}:`, error);
    return false;
  }
};

/**
 * Remove a hosts entry for a site domain.
 * Uses osascript to elevate privileges on macOS.
 */
export const removeHostsEntry = async (siteName: string): Promise<boolean> => {
  try {
    if (isSystemResolvedLocalhostDomain(siteName)) {
      logger.info(`Skipping hosts removal for ${siteName}; .localhost is resolved by the system.`);
      return true;
    }

    const content = fs.readFileSync(HOSTS_FILE, 'utf8');

    const lines = content.split('\n');
    const bounds = findLocalBenchBlockBounds(lines);
    const filtered = lines.filter((line, index) => {
      const trimmed = line.trim();
      if (trimmed === LOCAL_BENCH_BLOCK_START || trimmed === LOCAL_BENCH_BLOCK_END) {
        return true;
      }

      const isInsideManagedBlock = bounds ? index > bounds.start && index < bounds.end : false;
      const isSiteLine = trimmed.startsWith('127.0.0.1') || trimmed.startsWith('::1');
      const nameMatch = new RegExp(`(^|\\s)${siteName.replace(/\\./g, '\\\\.')}(\\s|$)`).test(trimmed);

      if (isInsideManagedBlock && isSiteLine && nameMatch) {
        return false;
      }

      // Legacy cleanup for entries written before block markers existed.
      if (!isInsideManagedBlock && isSiteLine && nameMatch && trimmed.includes(MARKER_PREFIX)) {
        return false;
      }
      return true;
    });

    const newContent = filtered.join('\n');

    if (newContent === content) {
      logger.info(`No hosts entry found for ${siteName}, nothing to remove.`);
      return true;
    }

    const updated = await writeHostsContent(newContent, `Remove host entry for ${siteName}`);
    if (!updated) {
      logger.error(`Failed to remove hosts entry for ${siteName}`);
      return false;
    }

    logger.info(`Removed hosts entry for ${siteName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to remove hosts entry for ${siteName}:`, error);
    return false;
  }
};

/**
 * Remove all hosts entries managed by Local Bench for a specific bench.
 */
export const removeAllHostsEntriesForBench = async (benchId: string, siteNames: string[], benchLabel?: string): Promise<boolean> => {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');
    const marker = `${MARKER_PREFIX}${benchId}`;
    const removableSiteNames = siteNames.filter((siteName) => !isSystemResolvedLocalhostDomain(siteName));

    const lines = content.split('\n');
    const bounds = findLocalBenchBlockBounds(lines);
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed === LOCAL_BENCH_BLOCK_START || trimmed === LOCAL_BENCH_BLOCK_END) {
        return true;
      }

      if (trimmed.includes(marker)) return false;
      
      const isSiteLine = trimmed.startsWith('127.0.0.1') || trimmed.startsWith('::1');
      if (isSiteLine && removableSiteNames.some(siteName => new RegExp(`(^|\\s)${siteName.replace(/\\./g, '\\\\.')}(\\s|$)`).test(trimmed))) {
        return false;
      }

      // Legacy cleanup for old marker-tagged entries outside the managed block.
      if (!bounds && trimmed.includes(MARKER_PREFIX)) {
        return false;
      }
      return true;
    });

    const newContent = filtered.join('\n');
    if (newContent === content) {
      return true;
    }

    return writeHostsContent(newContent, `Remove hosts entries for bench ${benchLabel?.trim() || benchId}`);
  } catch (error) {
    logger.error(`Failed to remove hosts entries for bench ${benchId}:`, error);
    return false;
  }
};

/**
 * Remove all hosts entries managed by Local Bench from /etc/hosts.
 * This is used by the Reset feature to clean up dormant entries.
 */
export const removeAllLocalBenchHostsEntries = async (): Promise<boolean> => {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');

    if (!content.includes(MARKER_PREFIX) && !content.includes(LOCAL_BENCH_BLOCK_START) && !content.includes(LOCAL_BENCH_BLOCK_END)) {
      return true;
    }

    const lines = content.split('\n');
    const bounds = findLocalBenchBlockBounds(lines);
    const filtered = lines.filter((line, index) => {
      if (bounds && index >= bounds.start && index <= bounds.end) {
        return false;
      }
      return !line.includes(MARKER_PREFIX);
    });
    const newContent = filtered.join('\n');

    if (newContent === content) {
      return true;
    }

    return writeHostsContent(newContent, 'Remove all dormant host entries');
  } catch (error) {
    logger.error(`Failed to remove all dormant hosts entries:`, error);
    return false;
  }
};
