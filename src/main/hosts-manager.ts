import fs from 'node:fs';
import { execPromise } from './utils/exec';
import { createMainLogger } from './logger';

const logger = createMainLogger('hosts-manager');

const HOSTS_FILE = '/etc/hosts';
const MARKER_PREFIX = '# local-bench:';

const HOSTS_PERMISSION_PROMPT_BASE =
  'Local Bench needs administrator permission to update /etc/hosts for local site routing.';

const escapeAppleScriptString = (value: string): string => value.replace(/"/g, '\\"');

const buildPrivilegedShellScript = (command: string, prompt: string): string =>
  `do shell script "${escapeAppleScriptString(command)}" with administrator privileges with prompt "${escapeAppleScriptString(prompt)}"`;

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
    // Check if entry already exists
    const existing = fs.readFileSync(HOSTS_FILE, 'utf8');
    const entryLine = `127.0.0.1  ${siteName}  ${MARKER_PREFIX}${benchId}`;

    if (existing.includes(`127.0.0.1  ${siteName}`) || existing.includes(`127.0.0.1\t${siteName}`)) {
      logger.info(`Hosts entry for ${siteName} already exists, skipping.`);
      return true;
    }

    if (process.platform === 'darwin') {
      // Use osascript for elevated append
      const script = buildPrivilegedShellScript(
        `echo '${entryLine}' >> ${HOSTS_FILE}`,
        `${HOSTS_PERMISSION_PROMPT_BASE} Action: Add host entry for ${siteName}.`
      );
      const { code } = await execPromise('osascript', ['-e', script]);
      if (code !== 0) {
        logger.error(`Failed to add hosts entry for ${siteName}`);
        return false;
      }
    } else {
      // Linux: try direct write, fall back to sudo
      try {
        fs.appendFileSync(HOSTS_FILE, `\n${entryLine}\n`);
      } catch {
        const { code } = await execPromise('sudo', ['sh', '-c', `echo '${entryLine}' >> ${HOSTS_FILE}`]);
        if (code !== 0) return false;
      }
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
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');

    // Only remove lines that we manage (tagged with our marker) or exact match
    const lines = content.split('\n');
    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      // Remove lines matching our site, even if missing marker (e.g. if added manually)
      const isSiteLine = trimmed.startsWith('127.0.0.1') || trimmed.startsWith('::1');
      const nameMatch = new RegExp(`(^|\\s)${siteName.replace(/\\./g, '\\\\.')}(\\s|$)`).test(trimmed);
      
      if (isSiteLine && nameMatch) {
        return false;
      }
      return true;
    });

    const newContent = filtered.join('\n');

    if (newContent === content) {
      logger.info(`No hosts entry found for ${siteName}, nothing to remove.`);
      return true;
    }

    if (process.platform === 'darwin') {
      // Create a temporary file with the new content and copy it over with privileges
      const tempPath = `/tmp/local-bench-hosts-${Date.now()}`;
      try {
        fs.writeFileSync(tempPath, newContent);
        const script = buildPrivilegedShellScript(
          `cp '${tempPath}' ${HOSTS_FILE} && rm '${tempPath}'`,
          `${HOSTS_PERMISSION_PROMPT_BASE} Action: Remove host entry for ${siteName}.`
        );
        const { code } = await execPromise('osascript', ['-e', script]);
        if (code !== 0) {
          logger.error(`Failed to remove hosts entry for ${siteName} (osascript failed)`);
          return false;
        }
      } catch (err) {
        logger.error(`Failed to write temp hosts file: ${err}`);
        return false;
      }
    } else {
      try {
        fs.writeFileSync(HOSTS_FILE, newContent);
      } catch {
        const escapedName = siteName.replace(/\./g, '\\.');
        const { code } = await execPromise('sudo', [
          'sed', '-i', `/[[:space:]]${escapedName}\\([[:space:]]\\|$\\)/d`, HOSTS_FILE,
        ]);
        if (code !== 0) return false;
      }
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
    const promptLabel = benchLabel?.trim() || benchId;

    const lines = content.split('\n');
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.includes(marker)) return false;
      
      const isSiteLine = trimmed.startsWith('127.0.0.1') || trimmed.startsWith('::1');
      if (isSiteLine && siteNames.some(siteName => new RegExp(`(^|\\s)${siteName.replace(/\\./g, '\\\\.')}(\\s|$)`).test(trimmed))) {
        return false;
      }
      return true;
    });

    const newContent = filtered.join('\n');
    if (newContent === content) {
      return true;
    }

    if (process.platform === 'darwin') {
      const tempPath = `/tmp/local-bench-bench-hosts-${Date.now()}`;
      try {
        fs.writeFileSync(tempPath, newContent);
        const script = buildPrivilegedShellScript(
          `cp '${tempPath}' ${HOSTS_FILE} && rm '${tempPath}'`,
          `${HOSTS_PERMISSION_PROMPT_BASE} Action: Remove hosts entries for bench ${promptLabel}.`
        );
        const { code } = await execPromise('osascript', ['-e', script]);
        return code === 0;
      } catch (err) {
        logger.error(`Failed to remove bench hosts entries: ${err}`);
        return false;
      }
    } else {
      try {
        fs.writeFileSync(HOSTS_FILE, newContent);
      } catch {
        let sedCmd = `sed -i '/${marker.replace(/[#:]/g, '\\\\$&')}/d' ${HOSTS_FILE}`;
        for (const siteName of siteNames) {
          const escapedName = siteName.replace(/\\./g, '\\\\.');
          sedCmd += ` && sed -i '/[[:space:]]${escapedName}\\([[:space:]]\\|$\\)/d' ${HOSTS_FILE}`;
        }
        const { code } = await execPromise('sudo', ['sh', '-c', sedCmd]);
        return code === 0;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to remove hosts entries for bench ${benchId}:`, error);
    return false;
  }
};

/**
 * Remove all hosts entries managed by Local Bench from /etc/hosts.
 * This is used by the Nuke feature to clean up dormant entries.
 */
export const removeAllLocalBenchHostsEntries = async (): Promise<boolean> => {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');
    
    if (!content.includes(MARKER_PREFIX)) {
      return true;
    }

    const lines = content.split('\n');
    const filtered = lines.filter((line) => !line.includes(MARKER_PREFIX));
    const newContent = filtered.join('\n');

    if (newContent === content) {
      return true;
    }

    if (process.platform === 'darwin') {
      const tempPath = `/tmp/local-bench-nuke-hosts-${Date.now()}`;
      try {
        fs.writeFileSync(tempPath, newContent);
        const script = buildPrivilegedShellScript(
          `cp '${tempPath}' ${HOSTS_FILE} && rm '${tempPath}'`,
          `${HOSTS_PERMISSION_PROMPT_BASE} Action: Remove all dormant host entries.`
        );
        const { code } = await execPromise('osascript', ['-e', script]);
        return code === 0;
      } catch (err) {
        logger.error(`Failed to remove all dormant hosts entries: ${err}`);
        return false;
      }
    } else {
      try {
        fs.writeFileSync(HOSTS_FILE, newContent);
      } catch {
        const { code } = await execPromise('sudo', [
          'sed', '-i', `/${MARKER_PREFIX.replace(/[#:]/g, '\\\\$&')}/d`, HOSTS_FILE,
        ]);
        return code === 0;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to remove all dormant hosts entries:`, error);
    return false;
  }
};
