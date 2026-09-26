import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/roll20-macro-generator/',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], permissions: ['clipboard-read', 'clipboard-write'] },
    },
  ],
  webServer: {
    command: 'npm run build:web && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/roll20-macro-generator/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
