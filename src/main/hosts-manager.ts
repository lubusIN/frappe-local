import fs from 'node:fs';
import { execPromise } from './utils/exec';
import { createMainLogger } from './logger';

const logger = createMainLogger('hosts-manager');

const HOSTS_FILE = '/etc/hosts';
const MARKER_PREFIX = '# frappe-cafe:';

const HOSTS_PERMISSION_PROMPT_BASE =
  'Frappe Cafe needs administrator permission to update /etc/hosts for local site routing.';

const escapeAppleScriptString = (value: string): string => value.replace(/"/g, '\\"');

const buildPrivilegedShellScript = (command: string, prompt: string): string =>
  `do shell script "${escapeAppleScriptString(command)}" with administrator privileges with prompt "${escapeAppleScriptString(prompt)}"`;

/**
 * Manages /etc/hosts entries for local site domains.
 *
 * Each managed line is tagged with a trailing comment so we can
 * identify and clean up entries without touching user-managed lines.
 *
 * Format: `127.0.0.1  my-site.local  # frappe-cafe:<benchId>`
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
      // Remove lines matching our site that have our marker
      if (trimmed.includes(siteName) && trimmed.includes(MARKER_PREFIX)) {
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
      const tempPath = `/tmp/frappe-cafe-hosts-${Date.now()}`;
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
          'sed', '-i', `/${escapedName}.*${MARKER_PREFIX}/d`, HOSTS_FILE,
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
 * Remove all hosts entries managed by Frappe Cafe for a specific bench.
 */
export const removeAllHostsEntriesForBench = async (benchId: string): Promise<boolean> => {
  try {
    const content = fs.readFileSync(HOSTS_FILE, 'utf8');
    const marker = `${MARKER_PREFIX}${benchId}`;

    if (!content.includes(marker)) {
      return true;
    }

    if (process.platform === 'darwin') {
      const lines = content.split('\n');
      const filtered = lines.filter((line) => !line.includes(marker));
      const newContent = filtered.join('\n');
      const tempPath = `/tmp/frappe-cafe-bench-hosts-${Date.now()}`;
      try {
        fs.writeFileSync(tempPath, newContent);
        const script = buildPrivilegedShellScript(
          `cp '${tempPath}' ${HOSTS_FILE} && rm '${tempPath}'`,
          `${HOSTS_PERMISSION_PROMPT_BASE} Action: Remove hosts entries for bench ${benchId}.`
        );
        const { code } = await execPromise('osascript', ['-e', script]);
        return code === 0;
      } catch (err) {
        logger.error(`Failed to remove bench hosts entries: ${err}`);
        return false;
      }
    } else {
      const lines = content.split('\n');
      const filtered = lines.filter(line => !line.includes(marker));
      try {
        fs.writeFileSync(HOSTS_FILE, filtered.join('\n'));
      } catch {
        const { code } = await execPromise('sudo', [
          'sed', '-i', `/${marker.replace(/[#:]/g, '\\$&')}/d`, HOSTS_FILE,
        ]);
        return code === 0;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to remove hosts entries for bench ${benchId}:`, error);
    return false;
  }
};
