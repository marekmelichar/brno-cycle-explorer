import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: WEB,
    trace: 'off',
    acceptDownloads: true,
    // Optional: reuse a pre-installed Chromium (e.g. Claude Code cloud sessions) instead of
    // the browser downloaded by `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'cs-CZ' }, testIgnore: /(mobile|english)\.spec\.ts/ },
    { name: 'desktop-english', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB' }, testMatch: /english\.spec\.ts/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], locale: 'cs-CZ' }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173/api/health',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
