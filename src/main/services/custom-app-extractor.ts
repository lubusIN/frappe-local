import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { exec as execGit } from 'dugite';
import { createMainLogger } from '@frappe-local/main/logger';

const logger = createMainLogger('custom-app-extractor');

export type ExtractedAppMetadata = {
  name: string;
  title: string;
  description: string;
  icon?: string;
  branch?: string; // the default branch from github
};

function extractAppTitle(content: string): string | null {
  const hookMatch = content.match(/^[ \t]*app_title\s*=\s*(?:_\()?["'](.+?)["']/m);
  if (hookMatch && hookMatch[1]) return hookMatch[1];
  return null;
}

function extractAppDescription(content: string): string | null {
  const hookMatch = content.match(/^[ \t]*app_description\s*=\s*(?:_\()?["'](.+?)["']/m);
  if (hookMatch && hookMatch[1]) return hookMatch[1];
  return null;
}

function extractAppName(content: string): string | null {
  const hookMatch = content.match(/^[ \t]*app_name\s*=\s*["'](.+?)["']/m);
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

function detectIconUrl(appName: string, dir: string, hooksContent?: string): string | null {
  const dashName = appName.replace(/_/g, '-');
  const shortName = dashName.replace(/^frappe-/, '');
  const candidates: string[] = [];

  if (hooksContent) {
    const logoMatch = hooksContent.match(/^[ \t]*app_logo_url\s*=\s*["'](.+?)["']/m);
    if (logoMatch && logoMatch[1]) {
      const cleanPath = logoMatch[1].replace(/^\/assets\//, '');
      const parts = cleanPath.split('/');
      const assetApp = parts[0];
      const rel = parts.slice(1).join('/');
      if (assetApp && rel) {
        candidates.push(`${assetApp}/public/${rel}`);
      }
    }
  }

  candidates.push(
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
  );

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

function getBundledGitDirectory(): string | undefined {
  const devPath = path.join(app.getAppPath(), 'bin', 'git');
  const prodPath = process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'git') : devPath;
  const gitDirectory = app.isPackaged ? prodPath : devPath;
  return fs.existsSync(gitDirectory) ? gitDirectory : undefined;
}

async function runBundledGit(args: string[], cwd: string) {
  const bundledGitDirectory = getBundledGitDirectory();
  return execGit(args, cwd, bundledGitDirectory ? { env: { LOCAL_GIT_DIRECTORY: bundledGitDirectory } } : undefined);
}

async function getRemoteDefaultBranch(repoUrl: string): Promise<string | undefined> {
  try {
    const lsRemote = await runBundledGit(['ls-remote', '--symref', repoUrl, 'HEAD'], process.cwd());
    if (lsRemote.exitCode === 0) {
      const match = lsRemote.stdout.match(/ref: refs\/heads\/([^\s]+)\s+HEAD/);
      if (match?.[1]) {
        return match[1];
      }
    }
  } catch (e) {
    logger.warn(`Failed to get default branch via bundled git for ${repoUrl}: ${e}`);
  }
  return undefined;
}

async function extractMetadataFromDirectory(dir: string, fallbackName: string, branch: string): Promise<ExtractedAppMetadata> {
  let appName = '';
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      if (f.isDirectory() && !f.name.startsWith('.') && fs.existsSync(path.join(dir, f.name, 'hooks.py'))) {
        appName = f.name;
        break;
      }
    }
  } catch (err) {
    logger.warn(`Failed to read directory ${dir} for app discovery: ${err}`);
  }

  if (!appName) {
    const hooksPath = path.join(dir, 'hooks.py');
    if (fs.existsSync(hooksPath)) {
      const pyproject = getLocalFileContent(dir, ['pyproject.toml']);
      if (pyproject) {
        const match = pyproject.match(/^[ \t]*name\s*=\s*["'](.+?)["']/m);
        if (match && match[1]) {
          appName = match[1].replace(/-/g, '_');
        }
      }
    }
  }

  if (!appName) {
    appName = fallbackName.replace(/-/g, '_');
  }

  const hooksContent = getLocalFileContent(dir, [`${appName}/hooks.py`, 'hooks.py']) ?? '';
  const canonicalName = extractAppName(hooksContent) || appName;

  const title = extractAppTitle(hooksContent) || canonicalName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const description = extractAppDescription(hooksContent) || '';
  const icon = detectIconUrl(canonicalName, dir, hooksContent);

  return {
    name: canonicalName,
    title,
    description,
    icon: icon || undefined,
    branch: branch || 'main',
  };
}

export async function extractGithubAppMetadata(repoUrl: string): Promise<ExtractedAppMetadata> {
  logger.info(`Extracting metadata from github repo: ${repoUrl}`);
  
  const tmpDir = path.join(os.tmpdir(), `frappe-extractor-${randomUUID()}`);
  
  try {
    let defaultBranch = await getRemoteDefaultBranch(repoUrl);

    const cloneResult = await runBundledGit(['clone', '--depth', '1', repoUrl, tmpDir], process.cwd());
    if (cloneResult.exitCode !== 0) {
      throw new Error(`Failed to clone repository ${repoUrl}:\n${cloneResult.stderr || cloneResult.stdout}`);
    }

    if (!defaultBranch) {
      const branchResult = await runBundledGit(['branch', '--show-current'], tmpDir);
      if (branchResult.exitCode === 0 && branchResult.stdout.trim()) {
        defaultBranch = branchResult.stdout.trim();
      }
    }

    const cleanUrl = repoUrl.replace(/\.git$/, '');
    const parts = cleanUrl.split('/');
    const fallbackName = parts[parts.length - 1] || 'unknown_app';

    return await extractMetadataFromDirectory(tmpDir, fallbackName, defaultBranch || 'main');
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

  let branch = 'main';
  try {
    const gitStatus = await runBundledGit(['branch', '--show-current'], localPath);
    if (gitStatus.exitCode === 0 && gitStatus.stdout.trim()) {
      branch = gitStatus.stdout.trim();
    }
  } catch {
    // Ignore git errors for local apps
  }

  const fallbackName = path.basename(localPath);
  return extractMetadataFromDirectory(localPath, fallbackName, branch);
}

export async function extractCustomApp(type: 'github' | 'local', source: string): Promise<ExtractedAppMetadata> {
  if (type === 'github') {
    return extractGithubAppMetadata(source);
  }
  return extractLocalAppMetadata(source);
}
