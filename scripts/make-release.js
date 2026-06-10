import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const forgePackagePath = require.resolve('@electron-forge/cli/package.json');
const forgePackage = require(forgePackagePath);
const forgeCli = path.resolve(
  path.dirname(forgePackagePath),
  forgePackage.bin['electron-forge']
);
const appPackage = require('../package.json');
const makeDirectory = path.resolve('out/make');
const releaseDirectory = path.resolve('release-artifacts');
const supportedExtensions = new Set(['.zip', '.dmg', '.exe', '.deb', '.rpm']);
const requiredExtensions = {
  darwin: ['.zip', '.dmg'],
  linux: ['.zip', '.deb', '.rpm'],
  win32: ['.zip', '.exe'],
};

const expectedExtensions = requiredExtensions[process.platform];
if (!expectedExtensions) {
  throw new Error(`Unsupported release platform: ${process.platform}`);
}

const releaseVersion = process.env.RELEASE_TAG?.replace(/^v/, '');
if (releaseVersion && releaseVersion !== appPackage.version) {
  throw new Error(
    `Release tag ${process.env.RELEASE_TAG} does not match package version ${appPackage.version}`
  );
}

const collectFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
};

fs.rmSync(makeDirectory, { recursive: true, force: true });
fs.rmSync(releaseDirectory, { recursive: true, force: true });
fs.mkdirSync(releaseDirectory, { recursive: true });

console.log(`Building release artifacts for ${process.platform}-${process.arch}`);
const makeResult = spawnSync(process.execPath, [forgeCli, 'make'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (makeResult.error) {
  throw makeResult.error;
}
if (makeResult.signal) {
  throw new Error(`Electron Forge was terminated by ${makeResult.signal}`);
}
if (makeResult.status !== 0) {
  process.exit(makeResult.status ?? 1);
}

const artifacts = collectFiles(makeDirectory)
  .filter((artifact) => supportedExtensions.has(path.extname(artifact).toLowerCase()))
  .sort();

if (artifacts.length === 0) {
  throw new Error(`Electron Forge completed without producing artifacts in ${makeDirectory}`);
}

for (const extension of expectedExtensions) {
  const found = artifacts.some(
    (artifact) => path.extname(artifact).toLowerCase() === extension
  );
  if (!found) {
    throw new Error(`Missing required ${extension} artifact`);
  }
}

for (const artifact of artifacts) {
  const size = fs.statSync(artifact).size;
  if (size === 0) {
    throw new Error(`Artifact is empty: ${artifact}`);
  }

  const destination = path.join(releaseDirectory, path.basename(artifact));
  if (fs.existsSync(destination)) {
    throw new Error(`Duplicate release filename: ${path.basename(artifact)}`);
  }

  fs.copyFileSync(artifact, destination);
  console.log(`Release artifact: ${path.basename(destination)} (${size} bytes)`);
}

console.log(`Prepared ${artifacts.length} artifact(s) in ${releaseDirectory}`);
