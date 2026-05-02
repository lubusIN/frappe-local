#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '..');

const iconDirectory = path.join(repositoryRoot, 'resources', 'icons');
const iconSourceSvg = path.join(iconDirectory, 'icon.svg');
const iconPng = path.join(iconDirectory, 'icon.png');
const iconIcns = path.join(iconDirectory, 'icon.icns');
const iconIco = path.join(iconDirectory, 'icon.ico');
const iconsetDirectory = path.join(iconDirectory, 'icon.iconset');

const requiredFiles = [iconSourceSvg];

for (const requiredFile of requiredFiles) {
  if (!fs.existsSync(requiredFile)) {
    console.error(`Missing required file: ${requiredFile}`);
    process.exit(1);
  }
}

const run = (command, args) => {
  execFileSync(command, args, {
    stdio: 'inherit',
  });
};

const ensureCleanDirectory = (directoryPath) => {
  fs.rmSync(directoryPath, { recursive: true, force: true });
  fs.mkdirSync(directoryPath, { recursive: true });
};

const createIcoFromPng = (pngPath, icoPath) => {
  const pngBuffer = fs.readFileSync(pngPath);

  // ICO header: reserved (2 bytes), type (2 bytes), image count (2 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  // Directory entry for one 256x256 PNG image.
  const directoryEntry = Buffer.alloc(16);
  directoryEntry.writeUInt8(0, 0); // width: 0 means 256
  directoryEntry.writeUInt8(0, 1); // height: 0 means 256
  directoryEntry.writeUInt8(0, 2); // palette size
  directoryEntry.writeUInt8(0, 3); // reserved
  directoryEntry.writeUInt16LE(1, 4); // color planes
  directoryEntry.writeUInt16LE(32, 6); // bits per pixel
  directoryEntry.writeUInt32LE(pngBuffer.length, 8); // image data size
  directoryEntry.writeUInt32LE(22, 12); // offset to image data

  fs.writeFileSync(icoPath, Buffer.concat([header, directoryEntry, pngBuffer]));
};

console.log('Generating app icons...');

run('sips', ['-s', 'format', 'png', iconSourceSvg, '--out', iconPng]);

ensureCleanDirectory(iconsetDirectory);

const baseSizes = [16, 32, 64, 128, 256, 512];
for (const size of baseSizes) {
  run('sips', ['-z', String(size), String(size), iconPng, '--out', path.join(iconsetDirectory, `icon_${size}x${size}.png`)]);

  if (size >= 32) {
    const doubleSize = size * 2;
    run('sips', ['-z', String(doubleSize), String(doubleSize), iconPng, '--out', path.join(iconsetDirectory, `icon_${size}x${size}@2x.png`)]);
  }
}

run('iconutil', ['-c', 'icns', iconsetDirectory, '-o', iconIcns]);
createIcoFromPng(path.join(iconsetDirectory, 'icon_256x256.png'), iconIco);

fs.rmSync(iconsetDirectory, { recursive: true, force: true });

console.log(`Generated: ${iconPng}`);
console.log(`Generated: ${iconIcns}`);
console.log(`Generated: ${iconIco}`);
