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

  if (normalized.includes('/src/components/workbook/')
    || normalized.includes('/src/components/diff/')
    || normalized.includes('/src/components/navigation/')
    || normalized.includes('/src/components/app-shell/')
    || normalized.includes('/src/components/app/')
    || normalized.includes('/src/components/shared/')) {
    return undefined;
  }

  if (normalized.includes('/src/utils/workbook/')
    || normalized.includes('/src/engine/workbook/')
    || normalized.includes('/src/hooks/workbook/')) {
    return 'workbook';
  }

  if (normalized.includes('/src/utils/diff/')
    || normalized.includes('/src/utils/collapse/')
    || normalized.includes('/src/engine/text/')
    || normalized.includes('/src/hooks/virtualization/')) {
    return 'diff-core';
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
