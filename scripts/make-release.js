import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import forge from '@electron-forge/core';

const require = createRequire(import.meta.url);
const appPackage = require('../package.json');
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

fs.rmSync(releaseDirectory, { recursive: true, force: true });
fs.mkdirSync(releaseDirectory, { recursive: true });

console.log(`Building release artifacts for ${process.platform}-${process.arch}`);
const results = await forge.api.make({ interactive: false });
const artifacts = results
  .flatMap((result) => result.artifacts)
  .filter((artifact) => supportedExtensions.has(path.extname(artifact).toLowerCase()))
  .sort();

if (artifacts.length === 0) {
  throw new Error('Electron Forge completed without producing release artifacts');
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
