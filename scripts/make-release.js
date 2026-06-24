import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
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
if (releaseVersion && releaseVersion !== appPackage.version && releaseVersion !== 'nightly') {
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

// Generate electron-updater manifest
const finalVersion = appPackage.version;
let channel = 'latest';
if (finalVersion.includes('nightly')) channel = 'nightly';
else if (finalVersion.includes('-alpha')) channel = 'alpha';
else if (finalVersion.includes('-beta')) channel = 'beta';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const suffix = isMac ? '-mac' : (isWin ? '' : '-linux');
const yamlFilename = `${channel}${suffix}.yml`;

let extToMatch = '.zip';
if (isWin) extToMatch = '.exe';
if (!isMac && !isWin) extToMatch = '.rpm';

let targetFile = artifacts.find(f => path.extname(f).toLowerCase() === extToMatch);
if (!isMac && !isWin && !targetFile) targetFile = artifacts.find(f => path.extname(f).toLowerCase() === '.deb');
if (!isMac && !isWin && !targetFile) targetFile = artifacts.find(f => path.extname(f).toLowerCase() === '.AppImage');

if (targetFile) {
  const filePath = targetFile; // it's the absolute path from Forge
  const destinationFileName = path.basename(filePath);
  const destinationFilePath = path.join(releaseDirectory, destinationFileName);
  
  const stat = fs.statSync(destinationFilePath);
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(destinationFilePath));
  const sha512 = hash.digest('base64');
  
  const yamlContent = `version: ${finalVersion}
files:
  - url: ${destinationFileName}
    sha512: ${sha512}
    size: ${stat.size}
path: ${destinationFileName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'`;

  fs.writeFileSync(path.join(releaseDirectory, yamlFilename), yamlContent);
  console.log(`Generated manifest: ${yamlFilename}`);
} else {
  console.log('No suitable artifact found to generate manifest for.');
}
