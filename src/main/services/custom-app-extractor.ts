import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execPromise } from '../utils/exec';
import { randomUUID } from 'node:crypto';
import { createMainLogger } from '../logger';

const logger = createMainLogger('custom-app-extractor');

export type ExtractedAppMetadata = {
  name: string;
  title: string;
  description: string;
  icon?: string;
  branch?: string; // the default branch from github
};

function extractAppTitle(content: string): string | null {
  const hookMatch = content.match(/app_title\s*=\s*["'](.+?)["']/);
  if (hookMatch && hookMatch[1]) return hookMatch[1];
  return null;
}

function extractAppDescription(content: string): string | null {
  const hookMatch = content.match(/app_description\s*=\s*["'](.+?)["']/);
  if (hookMatch && hookMatch[1]) return hookMatch[1];
  return null;
}

function getLocalFileContent(dir: string, filePaths: string[]): string | null {
  for (const p of filePaths) {
    const fullPath = path.join(dir, p);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  }
  return null;
}

function detectIconUrl(appName: string, dir: string): string | null {
  const dashName = appName.replace(/_/g, '-');
  const shortName = dashName.replace(/^frappe-/, '');
  const candidates = [
    `${appName}/public/images/${dashName}-logo.svg`,
    `${appName}/public/images/${dashName}-logo.png`,
    `${appName}/public/images/${shortName}-logo.svg`,
    `${appName}/public/images/${shortName}-logo.png`,
    `${appName}/public/images/${appName}_logo.svg`,
    `${appName}/public/images/${appName}_logo.png`,
    `${appName}/public/images/logo.svg`,
    `${appName}/public/images/logo.png`,
    `${appName}/public/${dashName}-logo.svg`,
    `${appName}/public/${dashName}-logo.png`,
    `${appName}/public/${shortName}-logo.svg`,
    `${appName}/public/${shortName}-logo.png`,
    `${appName}/public/${appName}_logo.svg`,
    `${appName}/public/${appName}_logo.png`,
    `${appName}/public/logo.svg`,
    `${appName}/public/logo.png`,
    `frontend/public/logo.svg`,
    `frontend/public/logo.png`,
    `public/logo.svg`,
    `public/logo.png`,
  ];

  for (const item of candidates) {
    const fullPath = path.join(dir, item);
    if (fs.existsSync(fullPath)) {
      try {
        const ext = path.extname(fullPath).toLowerCase();
        const mimeType = ext === '.svg' ? 'image/svg+xml' : 'image/png';
        const base64Data = fs.readFileSync(fullPath).toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      } catch (err) {
        logger.warn(`Failed to read icon file ${fullPath}: ${err}`);
      }
    }
  }
  return null;
}

export async function extractGithubAppMetadata(repoUrl: string): Promise<ExtractedAppMetadata> {
  logger.info(`Extracting metadata from github repo: ${repoUrl}`);
  
  const tmpDir = path.join(os.tmpdir(), `frappe-extractor-${randomUUID()}`);
  
  try {
    // Determine the default branch first using git ls-remote
    let defaultBranch = 'main';
    try {
      const lsRemote = await execPromise('git', ['ls-remote', '--symref', repoUrl, 'HEAD']);
      if (lsRemote.code === 0) {
        const match = lsRemote.stdout.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
        if (match && match[1]) {
          defaultBranch = match[1];
        }
      }
    } catch (e) {
      logger.warn(`Failed to get default branch via ls-remote for ${repoUrl}: ${e}`);
    }

    // Shallow clone the repo
    const cloneResult = await execPromise('git', ['clone', '--depth', '1', repoUrl, tmpDir]);
    if (cloneResult.code !== 0) {
      throw new Error(`Failed to clone repository ${repoUrl}:\n${cloneResult.stderr || cloneResult.stdout}`);
    }

    // Parse hooks.py
    // We need to figure out appName. Typically it's the folder name inside the repo that has hooks.py
    const files = fs.readdirSync(tmpDir, { withFileTypes: true });
    let appName = '';
    for (const f of files) {
      if (f.isDirectory() && !f.name.startsWith('.') && fs.existsSync(path.join(tmpDir, f.name, 'hooks.py'))) {
        appName = f.name;
        break;
      }
    }

    if (!appName) {
      // Fallback
      const hooksPath = path.join(tmpDir, 'hooks.py');
      if (fs.existsSync(hooksPath)) {
        // Find folder name from pyproject.toml
        const pyproject = getLocalFileContent(tmpDir, ['pyproject.toml']);
        if (pyproject) {
          const match = pyproject.match(/name\s*=\s*["'](.+?)["']/);
          if (match && match[1]) {
            appName = match[1];
          }
        }
      }
    }

    if (!appName) {
      // Extract from URL
      const cleanUrl = repoUrl.replace(/\.git$/, '');
      const parts = cleanUrl.split('/');
      appName = parts[parts.length - 1] || 'unknown_app';
      appName = appName.replace(/-/g, '_');
    }

    const hooksContent = getLocalFileContent(tmpDir, [`${appName}/hooks.py`, 'hooks.py']) ?? '';
    const title = extractAppTitle(hooksContent) || appName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const description = extractAppDescription(hooksContent) || '';
    const icon = detectIconUrl(appName, tmpDir);

    return {
      name: appName,
      title,
      description,
      icon: icon || undefined,
      branch: defaultBranch,
    };
  } finally {
    if (fs.existsSync(tmpDir)) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function extractLocalAppMetadata(localPath: string): Promise<ExtractedAppMetadata> {
  logger.info(`Extracting metadata from local path: ${localPath}`);
  
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local path does not exist: ${localPath}`);
  }

  const appName = path.basename(localPath);
  const hooksContent = getLocalFileContent(localPath, [`${appName}/hooks.py`, 'hooks.py']) ?? '';
  
  const title = extractAppTitle(hooksContent) || appName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const description = extractAppDescription(hooksContent) || '';
  
  // Try to get current branch
  let branch = 'main';
  try {
    const gitStatus = await execPromise('git', ['branch', '--show-current'], localPath);
    if (gitStatus.code === 0 && gitStatus.stdout.trim()) {
      branch = gitStatus.stdout.trim();
    }
  } catch {
    // Ignore git errors for local apps
  }

  const icon = detectIconUrl(appName, localPath);

  return {
    name: appName,
    title,
    description,
    icon: icon || undefined,
    branch,
  };
}

export async function extractCustomApp(type: 'github' | 'local', source: string): Promise<ExtractedAppMetadata> {
  if (type === 'github') {
    return extractGithubAppMetadata(source);
  }
  return extractLocalAppMetadata(source);
}
