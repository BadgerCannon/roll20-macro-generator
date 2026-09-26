import { defineConfig } from 'vite';

export default defineConfig({
  base: '/roll20-macro-generator/',
  build: { outDir: 'dist/web', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
