import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import forge from '@electron-forge/core';

const releaseDirectory = path.resolve('release-artifacts');
const supportedExtensions = new Set(['.zip', '.dmg', '.exe', '.deb', '.rpm']);
const requiredExtensions = {
  darwin: ['.dmg'],
  linux: ['.deb', '.rpm'],
  win32: ['.exe'],
};

fs.rmSync(releaseDirectory, { recursive: true, force: true });
fs.mkdirSync(releaseDirectory, { recursive: true });

console.log(`Building release artifacts for ${process.platform}-${process.arch}`);
const results = await forge.api.make({ interactive: false });
const artifacts = results
  .flatMap((result) => result.artifacts)
  .filter((artifact) => supportedExtensions.has(path.extname(artifact).toLowerCase()));

if (artifacts.length === 0) {
  throw new Error('Electron Forge completed without producing any release artifacts.');
}

const expectedExtensions = requiredExtensions[process.platform];
if (!expectedExtensions) {
  throw new Error(`Unsupported release platform: ${process.platform}`);
}

const hasInstaller = artifacts.some((artifact) =>
  expectedExtensions.includes(path.extname(artifact).toLowerCase())
);
if (!hasInstaller) {
  throw new Error(`Missing required ${expectedExtensions.join(' or ')} installer`);
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
