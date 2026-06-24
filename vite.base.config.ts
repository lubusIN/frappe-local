import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import path from 'node:path';

export const externalModules = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      '@frappe-local': path.resolve(__dirname, 'src'),
    },
  },
});