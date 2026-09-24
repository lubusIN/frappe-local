import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue(), Icons({ compiler: 'vue3' })],
  resolve: {
    alias: {
      electron: path.join(currentDirectory, 'tests/mocks/electron.ts'),
      '@frappe-local': path.join(currentDirectory, 'src'),
    },
  },
  test: {
    environment: 'node',
    server: { deps: { inline: ['frappe-ui'] } },
    exclude: ['node_modules/**', 'scratch/**'],
  },
});
