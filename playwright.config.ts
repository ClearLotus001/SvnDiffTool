import { defineConfig } from '@playwright/test';

const e2eBaseUrl = process.env.VERSORA_E2E_BASE_URL?.trim() || 'http://127.0.0.1:4173';
const e2eUrl = new URL(e2eBaseUrl);
const e2ePort = e2eUrl.port || (e2eUrl.protocol === 'https:' ? '443' : '80');
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: isCi ? 45_000 : 30_000,
  fullyParallel: false,
  workers: isCi ? 2 : 4,
  expect: {
    timeout: isCi ? 10_000 : 5_000,
  },
  use: {
    baseURL: e2eBaseUrl,
    headless: true,
    reducedMotion: isCi ? 'reduce' : 'no-preference',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: {
    command: `npm run build:renderer && npx vite preview --host ${e2eUrl.hostname} --port ${e2ePort} --strictPort`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
