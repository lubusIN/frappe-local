import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const appsSourcePath = path.join(root, 'apps.json');
const registryPath = path.join(root, 'src/main/services/apps-registry.json');
const trackedBenchVersions = ['version-15', 'version-16', 'develop'];

const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');
const checkMode = args.has('--check');

const run = (command) => execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const parseRepoName = (repo) => {
  const withoutGitSuffix = String(repo).trim().replace(/\.git$/i, '');
  const repoName = withoutGitSuffix.split('/').filter(Boolean).at(-1);
  return repoName || withoutGitSuffix;
};

const titleizeAppName = (id) =>
  String(id)
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const normalizeSourceApp = (entry) => {
  const app = typeof entry === 'string' ? { repo: entry } : { ...entry };
  const source = app.repo ?? app.source;

  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Each app in apps.json must be a repository URL string or an object with repo.');
  }

  const id = String(app.id ?? parseRepoName(source)).trim().toLowerCase();
  const { repo: _repo, source: _source, ...rest } = app;
  void _repo;
  void _source;

  return {
    ...rest,
    id,
    name: String(app.name ?? titleizeAppName(id)).trim(),
    description: String(app.description ?? `Frappe app from ${source}`).trim(),
    source: source.trim(),
    version: String(app.version ?? '0.0.0').trim(),
    category: app.category ?? 'other',
    compatibility: app.compatibility ?? {
      supportedBenchVersions: trackedBenchVersions,
    },
  };
};

const parseSemverTagParts = (value) => {
  const normalized = String(value).trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }

  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
};

const normalizeBenchVersion = (value) => String(value).trim().toLowerCase();

const benchVersionToSemver = (value) => {
  const normalized = normalizeBenchVersion(value);
  const match = normalized.match(/^version-(\d+)$/);
  if (!match) {
    return null;
  }

  return `${match[1]}.0.0`;
};

const compareSemverTags = (left, right) => {
  const leftParts = parseSemverTagParts(left);
  const rightParts = parseSemverTagParts(right);

  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
};

const listHeads = (source) => {
  const output = run(`git ls-remote --heads ${source}`);
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1]?.replace('refs/heads/', ''))
    .filter(Boolean);
};

const getLatestTag = (source) => {
  const output = run(`git ls-remote --tags ${source}`);
  const tags = output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1]?.replace('refs/tags/', '').replace(/\^\{\}$/, ''))
    .filter((tag) => Boolean(tag) && /^v?\d+(?:\.\d+){1,2}$/.test(tag));

  if (tags.length === 0) {
    return null;
  }

  return [...new Set(tags)].sort(compareSemverTags).at(-1) ?? null;
};

const inferBranchForVersion = (version, heads) => {
  if (version === 'develop') {
    if (heads.includes('develop')) return 'develop';
    if (heads.includes('main')) return 'main';
    if (heads.includes('master')) return 'master';
    return null;
  }

  if (heads.includes(version)) return version;
  if (heads.includes('main')) return 'main';
  if (heads.includes('master')) return 'master';
  return null;
};

const isBenchVersionWithinCompatibility = (benchVersion, compatibility) => {
  const normalizedBenchVersion = normalizeBenchVersion(benchVersion);
  if (normalizedBenchVersion === 'develop') {
    return true;
  }

  const benchSemver = benchVersionToSemver(normalizedBenchVersion);
  if (!benchSemver) {
    return false;
  }

  const minimum = compatibility?.minimumFrappeVersion;
  if (minimum && compareSemverTags(benchSemver, minimum) < 0) {
    return false;
  }

  const maximum = compatibility?.maximumFrappeVersion;
  if (maximum && compareSemverTags(benchSemver, maximum) > 0) {
    return false;
  }

  return true;
};

const isValidBranchForBenchVersion = (benchVersion, branch) => {
  const normalizedBenchVersion = normalizeBenchVersion(benchVersion);
  const normalizedBranch = String(branch).trim().toLowerCase();

  if (normalizedBenchVersion !== 'develop' && normalizedBranch === 'develop') {
    return false;
  }

  return true;
};

const normalizeCatalogApp = (app) => {
  const next = { ...app };

  let heads;
  try {
    heads = listHeads(app.source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch heads for ${app.id}: ${message}`);
  }

  let latestTag = null;
  try {
    latestTag = getLatestTag(app.source);
  } catch {
    latestTag = null;
  }

  if (latestTag) {
    next.version = latestTag;
  }

  const existingInstallBranches = app.installBranches ?? {};
  const installBranches = {};

  const explicitSupportedBenchVersions = Array.isArray(app.compatibility?.supportedBenchVersions)
    ? app.compatibility.supportedBenchVersions.map(normalizeBenchVersion)
    : null;

  const candidateBenchVersions = explicitSupportedBenchVersions && explicitSupportedBenchVersions.length > 0
    ? trackedBenchVersions.filter(
        (version) =>
          explicitSupportedBenchVersions.includes(version) &&
          isBenchVersionWithinCompatibility(version, app.compatibility)
      )
    : trackedBenchVersions.filter((version) => isBenchVersionWithinCompatibility(version, app.compatibility));

  for (const benchVersion of candidateBenchVersions) {
    const candidate = existingInstallBranches[benchVersion]?.trim();
    if (candidate && heads.includes(candidate) && isValidBranchForBenchVersion(benchVersion, candidate)) {
      installBranches[benchVersion] = candidate;
      continue;
    }

    const inferred = inferBranchForVersion(benchVersion, heads);
    if (inferred) {
      installBranches[benchVersion] = inferred;
    }
  }

  if (Object.keys(installBranches).length > 0) {
    next.installBranches = installBranches;
  } else {
    delete next.installBranches;
  }

  const fallbackInstallBranch =
    installBranches['version-16'] ||
    installBranches['version-15'] ||
    installBranches.develop ||
    app.installBranch;

  const hasExplicitInstallBranch = typeof app.installBranch === 'string' && app.installBranch.trim().length > 0;
  const hasInstallBranches = Object.keys(installBranches).length > 0;

  if (fallbackInstallBranch && (hasExplicitInstallBranch || !hasInstallBranches)) {
    next.installBranch = fallbackInstallBranch;
  } else if (!hasExplicitInstallBranch) {
    delete next.installBranch;
  }

  const existingCompatibility = app.compatibility ?? {};
  const supportedBenchVersions = trackedBenchVersions.filter((version) => Boolean(installBranches[version]));

  next.compatibility = {
    ...existingCompatibility,
    ...(supportedBenchVersions.length > 0 ? { supportedBenchVersions } : {}),
  };

  return next;
};

const sourceApps = JSON.parse(fs.readFileSync(appsSourcePath, 'utf8'));
const sourceCatalog = sourceApps.map(normalizeSourceApp);
const nextCatalog = sourceCatalog.map(normalizeCatalogApp);

const currentContent = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : '';
const nextContent = JSON.stringify(nextCatalog, null, 2) + '\n';
const changed = currentContent !== nextContent;

if (checkMode) {
  if (changed) {
    console.error('src/main/services/apps-registry.json is out of date. Run: npm run catalog:build');
    process.exit(1);
  }

  console.log('src/main/services/apps-registry.json is up to date.');
  process.exit(0);
}

if (!writeMode) {
  console.log('Preview mode: no files written. Use --write to persist changes.');
  console.log(`Would ${changed ? '' : 'not '}update ${registryPath}`);
  process.exit(0);
}

fs.writeFileSync(registryPath, nextContent, 'utf8');
console.log(`${changed ? 'Updated' : 'No changes in'} ${registryPath}`);
