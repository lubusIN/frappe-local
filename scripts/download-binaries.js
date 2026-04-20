import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const BIN_DIR = path.resolve(__dirname, '../bin');
const DOCKER_COMPOSE_VERSION = 'v2.24.5';
const PODMAN_VERSION = 'v4.9.3'; // Adjust version as needed for stability

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

const platform = os.platform();
const arch = os.arch();

const COMPOSE_URLS = {
  darwin: `https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-darwin-${getComposeArch(arch)}`,
  linux: `https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${getComposeArch(arch)}`,
  win32: `https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-windows-${getComposeArch(arch)}.exe`,
};

// Assuming podman-remote as the binary on MacOS/Windows
const PODMAN_URLS = {
  darwin: `https://github.com/containers/podman/releases/download/${PODMAN_VERSION}/podman-remote-release-darwin_${getPodmanArch(arch)}.zip`,
  linux: `https://github.com/containers/podman/releases/download/${PODMAN_VERSION}/podman-remote-release-linux_${getPodmanArch(arch)}.zip`,
  win32: `https://github.com/containers/podman/releases/download/${PODMAN_VERSION}/podman-remote-release-windows_${getPodmanArch(arch)}.zip`,
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
    execSync(`unzip -o ${zipPath} -d ${targetDir}`);
  } else if (platform === 'win32') {
    execSync(`powershell -command "Expand-Archive -Force '${zipPath}' '${targetDir}'"`);
  }
}

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

    // Download Podman Zip
    const podmanZipTarget = path.join(BIN_DIR, 'podman.zip');
    await downloadFile(podmanUrl, podmanZipTarget);
    
    // Extract Podman
    extractZip(podmanZipTarget, BIN_DIR);
    
    // Cleanup zip buffer
    fs.unlinkSync(podmanZipTarget);

    // Symlink or rename the binary to `podman`
    const podmanBinaryName = platform === 'win32' ? 'podman.exe' : 'podman';
    const extractedPodman = path.join(BIN_DIR, `podman-remote-static-linux_${getPodmanArch(arch)}`, 'podman-remote-static'); // example, let's fix it later.
    
    // Actually the zip files from `containers/podman` extract directly into binaries or nested dirs. Let's just find the podman executable
    const files = fs.readdirSync(BIN_DIR);
    let podmanFound = false;
    
    // Make anything resembling podman executable
    for (const file of files) {
      if (file.toLowerCase().includes('podman') && file !== 'podman' && file !== 'podman.exe') {
        const fullPath = path.join(BIN_DIR, file);
        if (platform !== 'win32') {
            try {
                fs.chmodSync(fullPath, 0o755);
            } catch (ignore) {}
        }
        
        // Let's copy or rename it to 'podman'
        if (file.includes('podman-remote')) {
           const podmanDest = path.join(BIN_DIR, platform === 'win32' ? 'podman.exe' : 'podman');
           if(fs.existsSync(podmanDest)) fs.unlinkSync(podmanDest);
           fs.renameSync(fullPath, podmanDest);
           podmanFound = true;
        }
      }
    }
    
    if (platform !== 'win32' && !podmanFound) {
      const podmanTarget = path.join(BIN_DIR, 'podman');
      if (fs.existsSync(podmanTarget)) {
         fs.chmodSync(podmanTarget, 0o755);
      }
    }

    console.log('Successfully bundled podman and docker-compose!');
  } catch (error) {
    console.error('Failed to bundle dependencies:', error);
    process.exit(1);
  }
}

main();
