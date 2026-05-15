import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const catalogPath = path.join(root, 'src/main/default-catalog.json');
const trackedBenchVersions = ['version-15', 'version-16', 'develop'];

const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');
const checkMode = args.has('--check');

const run = (command) => execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

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

const sourceCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const nextCatalog = sourceCatalog.map(normalizeCatalogApp);

const currentContent = JSON.stringify(sourceCatalog, null, 2) + '\n';
const nextContent = JSON.stringify(nextCatalog, null, 2) + '\n';
const changed = currentContent !== nextContent;

if (checkMode) {
  if (changed) {
    console.error('default-catalog.json is out of date. Run: npm run catalog:build');
    process.exit(1);
  }

  console.log('default-catalog.json is up to date.');
  process.exit(0);
}

if (!writeMode) {
  console.log('Preview mode: no files written. Use --write to persist changes.');
  console.log(`Would ${changed ? '' : 'not '}update ${catalogPath}`);
  process.exit(0);
}

fs.writeFileSync(catalogPath, nextContent, 'utf8');
console.log(`${changed ? 'Updated' : 'No changes in'} ${catalogPath}`);
