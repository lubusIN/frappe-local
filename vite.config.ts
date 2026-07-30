import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import Icons from 'unplugin-icons/vite';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export const externalModules = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  resolve: {
    alias: {
      '@frappe-local': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: 'src/renderer',
  plugins: [
    vue(),
    Icons({
      compiler: 'vue3',
      autoInstall: true,
    }),
    electron({
      main: {
        entry: path.resolve(__dirname, 'src/main/main.ts'),
        onstart(args) {
          args.startup(['.', '--no-sandbox'], { cwd: process.cwd() });
        },
        vite: {
          resolve: {
            alias: {
              '@frappe-local': path.resolve(__dirname, 'src'),
            },
          },
          build: {
            outDir: path.resolve(__dirname, '.vite/build'),
            rollupOptions: {
              external: externalModules,
            },
          },
        },
      },
      preload: {
        input: path.resolve(__dirname, 'src/main/preload.ts'),
        vite: {
          resolve: {
            alias: {
              '@frappe-local': path.resolve(__dirname, 'src'),
            },
          },
          build: {
            outDir: path.resolve(__dirname, '.vite/build'),
            rollupOptions: {
              external: externalModules,
            },
          },
        },
      },
    }),
  ],
  optimizeDeps: {
    include: [
      'feather-icons',
      'dayjs',
      'debug',
      'highlight.js',
      'highlight.js/lib/core',
      'interactjs',
      'xmlhttprequest-ssl',
    ],
    exclude: ['frappe-ui'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
  },
});
