import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests',
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    actionTimeout: 10000,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
