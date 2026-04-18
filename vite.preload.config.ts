import { mergeConfig } from 'vite';
import baseConfig, { externalModules } from './vite.base.config';

export default mergeConfig(baseConfig, {
  build: {
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['es'],
      fileName: () => 'preload.js',
    },
    outDir: '.vite/build',
    rollupOptions: {
      external: externalModules,
    },
    sourcemap: true,
    emptyOutDir: false,
  },
});