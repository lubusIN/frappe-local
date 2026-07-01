import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Constants
const BIN_DIR = path.resolve(__dirname, '../bin');
const DOCKER_COMPOSE_VERSION = 'v2.24.5';
const PODMAN_VERSION = 'v5.8.2';
const CADDY_VERSION = 'v2.8.4';
const BUNDLED_MACHINE_IMAGE_BASENAME = 'podman-machine-image';

// Arch mapping for GitHub releases
const getComposeArch = (arch) => {
  if (arch === 'x64') return 'x86_64';
  if (arch === 'arm64') return 'aarch64';
  return arch;
};

const getPodmanArch = (arch) => {
  if (arch === 'x64') return 'amd64';
  return arch;
};

const getCaddyArch = (arch) => {
  if (arch === 'x64') return 'amd64';
  if (arch === 'arm64') return 'arm64';
  return arch;
};

const platform = os.platform();
const arch = os.arch();

const COMPOSE_URLS = {
  darwin: `https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-darwin-${getComposeArch(arch)}`,
  linux: `https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${getComposeArch(arch)}`,
  win32: `https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-windows-${getComposeArch(arch)}.exe`,
};

const PODMAN_URLS = {
  darwin: `https://github.com/containers/podman/releases/download/${PODMAN_VERSION}/podman-installer-macos-${arch === 'x64' ? 'amd64' : 'arm64'}.pkg`,
  linux: `https://github.com/containers/podman/releases/download/${PODMAN_VERSION}/podman-remote-static-linux_${getPodmanArch(arch)}.tar.gz`,
  win32: `https://github.com/containers/podman/releases/download/${PODMAN_VERSION}/podman-remote-release-windows_${getPodmanArch(arch)}.zip`,
};

const CADDY_URLS = {
  darwin: `https://github.com/caddyserver/caddy/releases/download/${CADDY_VERSION}/caddy_${CADDY_VERSION.replace(/^v/, '')}_mac_${getCaddyArch(arch)}.tar.gz`,
  linux: `https://github.com/caddyserver/caddy/releases/download/${CADDY_VERSION}/caddy_${CADDY_VERSION.replace(/^v/, '')}_linux_${getCaddyArch(arch)}.tar.gz`,
  win32: `https://github.com/caddyserver/caddy/releases/download/${CADDY_VERSION}/caddy_${CADDY_VERSION.replace(/^v/, '')}_windows_${getPodmanArch(arch)}.zip`,
};

const quoteShell = (value) => {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
};

const copyFileWithMode = (src, dest) => {
  fs.copyFileSync(src, dest);
  if (platform !== 'win32') {
    fs.chmodSync(dest, 0o755);
  }
};

const findBinary = (dir, name) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const found = findBinary(fullPath, name);
      if (found) return found;
    } else if (
      file === name ||
      (platform === 'win32' && file === `${name}.exe`) ||
      (platform === 'linux' && name === 'podman' && file.startsWith('podman-remote-static-linux_'))
    ) {
      return fullPath;
    }
  }
  return null;
};

const writePodmanWrapper = () => {
  if (platform === 'win32') {
    return;
  }

  const wrapperPath = path.join(BIN_DIR, 'podman');
  const wrapper = `#!/usr/bin/env sh
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export PATH="$SCRIPT_DIR:$PATH"
export CONTAINERS_HELPER_BINARY_DIR="$SCRIPT_DIR"
exec "$SCRIPT_DIR/podman-real" "$@"
`;
  fs.writeFileSync(wrapperPath, wrapper, 'utf8');
  fs.chmodSync(wrapperPath, 0o755);
};

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} ...`);
    
    // Follow redirects
    const download = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${targetUrl}: ${res.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(targetPath);
        res.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`Successfully downloaded to ${targetPath}`);
          resolve(targetPath);
        });

        file.on('error', (err) => {
          fs.unlink(targetPath, () => reject(err));
        });
      }).on('error', (err) => {
        fs.unlink(targetPath, () => reject(err));
      });
    };
    
    download(url);
  });
}

function extractZip(zipPath, targetDir) {
  console.log(`Extracting ${zipPath} ...`);
  // Simple extraction using open source zip utility natively available
  if (platform === 'darwin' || platform === 'linux') {
    execSync(`unzip -o ${quoteShell(zipPath)} -d ${quoteShell(targetDir)}`);
  } else if (platform === 'win32') {
    const escapedZipPath = zipPath.replace(/'/g, "''");
    const escapedTargetDir = targetDir.replace(/'/g, "''");
    execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${escapedZipPath}' -DestinationPath '${escapedTargetDir}'"`);
  }
}

function extractArchive(archivePath, targetDir) {
  if (archivePath.endsWith('.tar.gz')) {
    console.log(`Extracting ${archivePath} ...`);
    execSync(`tar -xzf ${quoteShell(archivePath)} -C ${quoteShell(targetDir)}`);
    return;
  }

  extractZip(archivePath, targetDir);
}

const findMachineImageInDirectory = (directory) => {
  if (!fs.existsSync(directory)) return null;

  const entries = fs.readdirSync(directory);
  const imageFile = entries.find((entry) =>
    entry.startsWith('podman-machine-default') && (entry.endsWith('.raw') || entry.endsWith('.qcow2'))
  );

  return imageFile ? path.join(directory, imageFile) : null;
};

const resolveMachineImageSource = () => {
  const envSource = process.env.PODMAN_MACHINE_IMAGE_PATH;
  if (envSource && fs.existsSync(envSource)) {
    return envSource;
  }

  // By default, only bundle image when explicitly requested to avoid large installs.
  if (process.env.BUNDLE_PODMAN_MACHINE_IMAGE !== '1') {
    return null;
  }

  const homeDirectory = os.homedir();
  const machineCacheCandidates = [
    path.join(homeDirectory, '.local', 'share', 'containers', 'podman', 'machine', 'applehv'),
    path.join(homeDirectory, '.local', 'share', 'containers', 'podman', 'machine', 'qemu'),
    path.join(homeDirectory, '.local', 'share', 'containers', 'podman', 'machine', 'hyperv'),
    path.join(homeDirectory, '.local', 'share', 'containers', 'podman', 'machine', 'wsl'),
  ];

  for (const candidateDirectory of machineCacheCandidates) {
    const imagePath = findMachineImageInDirectory(candidateDirectory);
    if (imagePath) {
      return imagePath;
    }
  }

  return null;
};

const maybeBundleMachineImage = () => {
  const imageSource = resolveMachineImageSource();
  if (!imageSource) {
    console.log('No local Podman machine image bundled (set BUNDLE_PODMAN_MACHINE_IMAGE=1 or PODMAN_MACHINE_IMAGE_PATH).');
    return;
  }

  const extension = path.extname(imageSource) || '.raw';
  const imageDestination = path.join(BIN_DIR, `${BUNDLED_MACHINE_IMAGE_BASENAME}${extension}`);
  fs.copyFileSync(imageSource, imageDestination);
  console.log(`Bundled Podman machine image: ${imageDestination}`);
};

const bundleEmbeddedGit = () => {
  const dugitePackageJson = require.resolve('dugite/package.json');
  const dugiteGitDirectory = path.join(path.dirname(dugitePackageJson), 'git');
  const gitDestination = path.join(BIN_DIR, 'git');

  if (!fs.existsSync(dugiteGitDirectory)) {
    throw new Error(`Dugite embedded Git directory not found: ${dugiteGitDirectory}`);
  }

  fs.rmSync(gitDestination, { recursive: true, force: true });
  fs.cpSync(dugiteGitDirectory, gitDestination, { recursive: true, verbatimSymlinks: true });
  console.log(`Bundled embedded Git: ${gitDestination}`);
};

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const composeUrl = COMPOSE_URLS[platform];
  const podmanUrl = PODMAN_URLS[platform];

  if (!composeUrl || !podmanUrl) {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  try {
    // Download Docker Compose
    const composeExt = platform === 'win32' ? '.exe' : '';
    const composeTarget = path.join(BIN_DIR, `docker-compose${composeExt}`);
    await downloadFile(composeUrl, composeTarget);
    if (platform !== 'win32') {
      fs.chmodSync(composeTarget, 0o755);
    }

    if (platform === 'darwin') {
      const podmanPkgTarget = path.join(BIN_DIR, 'podman.pkg');
      const podmanExpandDir = path.join(BIN_DIR, 'podman-pkg-expand');

      await downloadFile(podmanUrl, podmanPkgTarget);
      fs.rmSync(podmanExpandDir, { recursive: true, force: true });
      execSync(`pkgutil --expand-full ${quoteShell(podmanPkgTarget)} ${quoteShell(podmanExpandDir)}`);

      const payloadBase = path.join(podmanExpandDir, 'podman.pkg', 'Payload', 'podman');
      const podmanRealDest = path.join(BIN_DIR, 'podman-real');
      const podmanSource = path.join(payloadBase, 'bin', 'podman');
      copyFileWithMode(podmanSource, podmanRealDest);

      // Keep helper binaries beside podman-real and use wrapper env var for lookup.
      const helperCandidates = [
        path.join(payloadBase, 'bin', 'gvproxy'),
        path.join(payloadBase, 'bin', 'vfkit'),
        path.join(payloadBase, 'bin', 'podman-mac-helper'),
      ];

      for (const helperSource of helperCandidates) {
        if (fs.existsSync(helperSource)) {
          const helperDest = path.join(BIN_DIR, path.basename(helperSource));
          copyFileWithMode(helperSource, helperDest);
        }
      }

      // Remove stale qemu artifacts from previous podman bundles.
      fs.rmSync(path.join(BIN_DIR, 'qemu'), { recursive: true, force: true });
      fs.rmSync(path.join(BIN_DIR, 'qemu-system-x86_64'), { force: true });

      writePodmanWrapper();

      fs.rmSync(podmanExpandDir, { recursive: true, force: true });
      fs.rmSync(podmanPkgTarget, { force: true });
      maybeBundleMachineImage();
    } else {
      const podmanArchiveName = platform === 'linux' ? 'podman.tar.gz' : 'podman.zip';
      const podmanArchiveTarget = path.join(BIN_DIR, podmanArchiveName);
      const podmanExtractDir = path.join(BIN_DIR, 'podman-extract');
      await downloadFile(podmanUrl, podmanArchiveTarget);

      // Extract Podman and move executable from extracted artifacts
      fs.rmSync(podmanExtractDir, { recursive: true, force: true });
      fs.mkdirSync(podmanExtractDir, { recursive: true });
      extractArchive(podmanArchiveTarget, podmanExtractDir);

      const podmanExecutable = findBinary(podmanExtractDir, platform === 'win32' ? 'podman.exe' : 'podman');
      const podmanDest = path.join(BIN_DIR, platform === 'win32' ? 'podman.exe' : 'podman');
      if (!podmanExecutable) {
        throw new Error('Could not find extracted podman binary');
      }

      copyFileWithMode(podmanExecutable, podmanDest);

      fs.rmSync(podmanExtractDir, { recursive: true, force: true });
      fs.rmSync(podmanArchiveTarget, { force: true });
      maybeBundleMachineImage();
    }

    const caddyUrl = CADDY_URLS[platform];
    const caddyExt = platform === 'win32' ? '.exe' : '';
    const caddyArchiveName = platform === 'win32' ? 'caddy.zip' : 'caddy.tar.gz';
    const caddyArchiveTarget = path.join(BIN_DIR, caddyArchiveName);
    const caddyExtractDir = path.join(BIN_DIR, 'caddy-extract');
    await downloadFile(caddyUrl, caddyArchiveTarget);

    fs.rmSync(caddyExtractDir, { recursive: true, force: true });
    fs.mkdirSync(caddyExtractDir, { recursive: true });
    extractArchive(caddyArchiveTarget, caddyExtractDir);

    const caddyExecutable = findBinary(caddyExtractDir, platform === 'win32' ? 'caddy.exe' : 'caddy');
    const caddyDest = path.join(BIN_DIR, `caddy${caddyExt}`);
    if (!caddyExecutable) {
      throw new Error('Could not find extracted caddy binary');
    }

    copyFileWithMode(caddyExecutable, caddyDest);

    fs.rmSync(caddyExtractDir, { recursive: true, force: true });
    fs.rmSync(caddyArchiveTarget, { force: true });

    console.log('Successfully bundled podman and docker-compose!');

function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const download = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          download(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch image ${targetUrl}: ${res.statusCode}`));
          return;
        }
        
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] }));
        res.on('error', reject);
      }).on('error', reject);
    };
    download(url);
  });
}

    // Download apps.json catalog
    const appsJsonUrl = 'https://frappe-brewery.pages.dev/index/apps.json';
    const appsJsonTarget = path.join(BIN_DIR, 'apps.json');
    await downloadFile(appsJsonUrl, appsJsonTarget);
    console.log('Successfully downloaded apps.json catalog!');

    // Cache images
    const appsData = JSON.parse(fs.readFileSync(appsJsonTarget, 'utf8'));
    let imagesCached = 0;
    for (const app of appsData.apps) {
      if (app.media && app.media.icon && app.media.icon.startsWith('http')) {
        try {
          const { buffer, contentType } = await fetchImageBuffer(app.media.icon);
          const base64 = buffer.toString('base64');
          const mimeType = contentType || (app.media.icon.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
          app.media.icon = `data:${mimeType};base64,${base64}`;
          imagesCached++;
        } catch (err) {
          console.warn(`Failed to cache image for ${app.slug}:`, err.message);
        }
      }
    }
    
    if (imagesCached > 0) {
      fs.writeFileSync(appsJsonTarget, JSON.stringify(appsData, null, 2));
      console.log(`Successfully cached ${imagesCached} app icons!`);
    }

    bundleEmbeddedGit();
  } catch (error) {
    console.error('Failed to bundle dependencies:', error);
    process.exit(1);
  }
}

main();
