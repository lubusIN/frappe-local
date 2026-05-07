import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    vue(),
    Icons({
      compiler: 'vue3',
      autoInstall: true,
    }),
  ],
  optimizeDeps: {
    // Force Vite to pre-bundle CJS packages used by frappe-ui source imports
    // so they get proper ESM default-export interop at runtime.
    include: [
      // CJS packages used directly or transitively by frappe-ui / socket.io-client
      'feather-icons',
      'dayjs',
      'debug',
      'highlight.js',
      'highlight.js/lib/core',
      'interactjs',
      'xmlhttprequest-ssl',
    ],
    // Keep frappe-ui out of dep prebundle so unplugin-icons can resolve its virtual ~icons imports.
    exclude: ['frappe-ui'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../../.vite/renderer/main_window',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
