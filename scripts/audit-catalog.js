import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const appsSourcePath = path.join(root, 'apps.json');
const registryPath = path.join(root, 'src/main/services/apps-registry.json');
const outputPath = path.join(root, 'docs/app-catalog-audit.md');

const trackedBenchVersions = ['version-15', 'version-16', 'develop'];
const trackedUpstreamBranches = ['version-15', 'version-16', 'develop', 'main', 'master'];

const parseVersionParts = (value) => {
  const normalized = String(value).trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }

  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
};

const compareVersions = (left, right) => {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);

  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let i = 0; i < 3; i += 1) {
    if (leftParts[i] !== rightParts[i]) {
      return leftParts[i] - rightParts[i];
    }
  }

  return 0;
};

const run = (command) => {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
};

const parseRepoName = (repo) => {
  const withoutGitSuffix = String(repo).trim().replace(/\.git$/i, '');
  const repoName = withoutGitSuffix.split('/').filter(Boolean).at(-1);
  return repoName || withoutGitSuffix;
};

const normalizeSourceApp = (entry) => {
  const app = typeof entry === 'string' ? { repo: entry } : { ...entry };
  const source = app.repo ?? app.source;

  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Each app in apps.json must be a repository URL string or an object with repo.');
  }

  return {
    id: String(app.id ?? parseRepoName(source)).trim().toLowerCase(),
    source: source.trim(),
  };
};

const getRemoteHeads = (source) => {
  const output = run(`git ls-remote --heads ${source}`);
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1]?.replace('refs/heads/', ''))
    .filter((name) => Boolean(name) && trackedUpstreamBranches.includes(name));
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

  return [...new Set(tags)].sort(compareVersions).at(-1) ?? null;
};

const normalizeExpectedBranchMap = (app) => {
  const supported = app.compatibility?.supportedBenchVersions?.length
    ? app.compatibility.supportedBenchVersions
    : trackedBenchVersions;

  const installBranches = app.installBranches ?? {};

  const expected = {};
  for (const version of supported) {
    if (installBranches[version]) {
      expected[version] = installBranches[version];
    } else if (app.installBranch) {
      expected[version] = app.installBranch;
    } else if (version === 'develop') {
      expected[version] = 'develop';
    } else {
      expected[version] = version;
    }
  }

  return expected;
};

const sourceApps = JSON.parse(fs.readFileSync(appsSourcePath, 'utf8')).map(normalizeSourceApp);
const sourceById = new Map(sourceApps.map((app) => [app.id, app]));
const catalog = JSON.parse(fs.readFileSync(registryPath, 'utf8')).map((app) => ({
  ...app,
  source: sourceById.get(String(app.id).trim().toLowerCase())?.source ?? app.source,
}));

const rows = [];
const checklist = [];

for (const app of catalog) {
  const row = {
    id: app.id,
    source: app.source,
    catalogVersion: app.version,
    latestTag: 'n/a',
    heads: [],
    matrix: normalizeExpectedBranchMap(app),
    status: 'ok',
    notes: [],
  };

  try {
    const heads = getRemoteHeads(app.source);
    row.heads = heads;

    const latestTag = getLatestTag(app.source);
    if (latestTag) {
      row.latestTag = latestTag;

      if (parseVersionParts(app.version) && compareVersions(app.version, latestTag) < 0) {
        row.notes.push(`Catalog version ${app.version} is behind latest tag ${latestTag}.`);
      }
    }

    for (const [benchVersion, branch] of Object.entries(row.matrix)) {
      if (!heads.includes(branch)) {
        row.notes.push(`Branch ${branch} (for ${benchVersion}) not found upstream.`);
      }
    }

    if (row.notes.length > 0) {
      row.status = 'review';
    }
  } catch (error) {
    row.status = 'error';
    row.notes.push(`Audit failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (row.status !== 'ok') {
    checklist.push(`- [ ] ${row.id}: ${row.notes.join(' ')}`);
  }

  rows.push(row);
}

const generatedAt = new Date().toISOString();
const summary = {
  total: rows.length,
  ok: rows.filter((row) => row.status === 'ok').length,
  review: rows.filter((row) => row.status === 'review').length,
  error: rows.filter((row) => row.status === 'error').length,
};

const markdown = [
  '# App Catalog Audit',
  '',
  `Generated: ${generatedAt}`,
  '',
  '## Summary',
  '',
  `- Total apps: ${summary.total}`,
  `- OK: ${summary.ok}`,
  `- Needs review: ${summary.review}`,
  `- Audit errors: ${summary.error}`,
  '',
  '## Review Checklist',
  '',
  ...(checklist.length > 0 ? checklist : ['- [x] No review items.']),
  '',
  '## Detailed Matrix',
  '',
  '| App | Catalog Version | Latest Tag | Branch Matrix | Upstream Heads | Status | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((row) => {
    const matrix = Object.entries(row.matrix)
      .map(([benchVersion, branch]) => `${benchVersion}: ${branch}`)
      .join('<br>');
    const heads = row.heads.length > 0 ? row.heads.join(', ') : 'n/a';
    const notes = row.notes.length > 0 ? row.notes.join(' ') : '-';
    return `| ${row.id} | ${row.catalogVersion} | ${row.latestTag} | ${matrix} | ${heads} | ${row.status} | ${notes} |`;
  }),
  '',
  '## Workflow',
  '',
  '- Add or edit app entries in apps.json when introducing catalog apps.',
  '- Run npm run catalog:build to rebuild src/main/services/apps-registry.json from apps.json and upstream metadata.',
  '- Run npm run catalog:build:check in CI or pre-commit to ensure catalog stays in sync.',
  '- Run node scripts/audit-catalog.js whenever catalog entries are edited.',
  '- Resolve all `Needs review` items before bumping `APP_CATALOG_SEED_VERSION`.',
  '- Re-run relevant tests: `npx vitest run tests/catalog-provider.test.ts tests/bench-create-orchestration.test.ts tests/bench-apps-orchestration.test.ts tests/catalog-compatibility.test.ts`.',
  '- Run typecheck: `npx tsc --noEmit -p tsconfig.renderer.json`.',
  '',
].join('\n');

fs.writeFileSync(outputPath, markdown, 'utf8');
console.log(`Wrote ${outputPath}`);
