import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
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
    name: 'Frappe Cafe',
    executableName: 'Frappe Cafe',
    appBundleId: 'com.lubusin.frappe.cafe',
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
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
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
};

export default config;