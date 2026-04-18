import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'src/renderer',
  plugins: [vue()],
  build: {
    outDir: '../../.vite/renderer/main_window',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});