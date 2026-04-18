import { mergeConfig } from 'vite';
import baseConfig, { externalModules } from './vite.base.config';

export default mergeConfig(baseConfig, {
  build: {
    lib: {
      entry: 'src/main/main.ts',
      formats: ['es'],
      fileName: () => 'main.js',
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: externalModules,
    },
    sourcemap: true,
    emptyOutDir: false,
  },
});