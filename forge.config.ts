import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import path from 'node:path';

const isDarwin = process.platform === 'darwin';
const iconBasePath = path.resolve(process.cwd(), 'resources/icons/icon');

/**
 * macOS Code Signing and Notarization Configuration
 * 
 * For production releases on macOS:
 * 1. Set APPLE_ID and APPLE_PASSWORD environment variables
 * 2. Ensure Apple Developer certificate is installed in Keychain
 * 3. Uncomment signing and notarization config below
 * 
 */
const macOSConfig = {
  // osxSign: {
  //   identity: 'Developer ID Application: YOUR_NAME (TEAMID)',
  //   'hardened-runtime': true,
  //   'entitlements': 'build/entitlements.plist',
  // },
  // osxNotarize: {
  //   tool: 'notarytool',
  //   appleId: process.env.APPLE_ID,
  //   appleIdPassword: process.env.APPLE_PASSWORD,
  //   teamId: process.env.APPLE_TEAM_ID,
  // },
};

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Frappe Local',
    executableName: 'frappe-local',
    appBundleId: 'in.lubus.frappe-local',
    appCategoryType: 'public.app-category.developer-tools',
    asar: true,
    extraResource: ['./bin', './resources/icons/icon.png'],
    icon: iconBasePath,
    // Platform-specific configurations
    ...(isDarwin && {
      // macOS-specific settings
      ...macOSConfig,
    }),
  },
  rebuildConfig: {},
  makers: [
    // Cross-platform ZIP archives (works on all platforms)
    new MakerZIP({}, ['darwin', 'linux', 'win32']),
    // macOS DMG Disk Image
    new MakerDMG({
      icon: path.resolve(process.cwd(), 'resources/icons/icon.icns'),
      background: path.resolve(process.cwd(), 'resources/dmg-background.png'),
      iconSize: 120,
      additionalDMGOptions: {
        window: {
          size: {
            width: 600,
            height: 400,
          },
        },
      },
      contents: (opts: { appPath: string }) => [
        { x: 150, y: 200, type: 'file', path: opts.appPath },
        { x: 450, y: 200, type: 'link', path: '/Applications' },
      ],
    }),
    // Windows Squirrel Setup installer (creates .exe)
    new MakerSquirrel({
      authors: 'Lubus',
      description: 'Desktop app for managing local Frappe benches and sites.',
    }),
    // Linux Debian/Ubuntu package (.deb)
    new MakerDeb({}),
    // Linux RedHat/Fedora package (.rpm)
    new MakerRpm({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'lubusIN',
          name: 'frappe-local'
        },
        prerelease: false
      }
    }
  ],
};

export default config;
