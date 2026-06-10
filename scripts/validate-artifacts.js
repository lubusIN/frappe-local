import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const artifactRoot = path.resolve('out/make');
const supportedExtensions = new Set(['.zip', '.dmg', '.exe', '.deb', '.rpm']);

const requiredExtensions = {
  darwin: [['.dmg']],
  linux: [['.deb', '.rpm']],
  win32: [['.exe']],
};

const collectFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
};

console.log('Validating build artifacts');
console.log(`Platform: ${process.platform}-${process.arch}`);
console.log(`Scanning: ${artifactRoot}`);

const files = collectFiles(artifactRoot);
const artifacts = files.filter((file) =>
  supportedExtensions.has(path.extname(file).toLowerCase())
);

if (artifacts.length === 0) {
  const generatedFiles = files.length
    ? files.map((file) => path.relative(process.cwd(), file)).join('\n  ')
    : '(out/make is empty or missing)';

  throw new Error(`No release artifacts found.\nGenerated files:\n  ${generatedFiles}`);
}

for (const artifact of artifacts) {
  const size = fs.statSync(artifact).size;
  if (size === 0) {
    throw new Error(`Artifact is empty: ${artifact}`);
  }

  console.log(`Found: ${path.relative(process.cwd(), artifact)} (${size} bytes)`);
}

const platformRequirements = requiredExtensions[process.platform];
if (!platformRequirements) {
  throw new Error(`Unsupported release platform: ${process.platform}`);
}

for (const alternatives of platformRequirements) {
  const found = artifacts.some((artifact) =>
    alternatives.includes(path.extname(artifact).toLowerCase())
  );

  if (!found) {
    throw new Error(`Missing required ${alternatives.join(' or ')} artifact`);
  }
}

console.log(`Validated ${artifacts.length} release artifact(s).`);
