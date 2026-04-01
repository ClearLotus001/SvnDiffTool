import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function resolveManualChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');

  if (normalized.includes('/node_modules/')) {
    if (normalized.includes('/react/') || normalized.includes('/react-dom/')) {
      return 'react-vendor';
    }
    return 'vendor';
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveManualChunk(id);
        },
      },
    },
  },
  server: {
    port: 5173,
    watch: process.platform === 'win32'
      ? {
          usePolling: true,
          interval: 150,
        }
      : undefined,
  },
});
