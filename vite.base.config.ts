import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

export const externalModules = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  clearScreen: false,
});