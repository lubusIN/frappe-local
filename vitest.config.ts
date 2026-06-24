import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      electron: path.join(currentDirectory, 'tests/mocks/electron.ts'),
      '@frappe-local': path.join(currentDirectory, 'src'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'scratch/**'],
  },
});
