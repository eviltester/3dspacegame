import { defineConfig } from '@playwright/test';

// The browser-test runner owns server startup, isolated browser contexts,
// assertions, reports and failure evidence.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Pointer-lock and WebGL tests share a machine; serial execution avoids fighting
  // for focus/GPU time and makes maximum-load measurements more comparable.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/browser-results.json' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 5_000,
    // Keep useful failure evidence without capturing images for every input event.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
    screenshot: 'only-on-failure'
  },
  webServer: {
    // Always build once before starting: the Pages smoke test serves this exact
    // artifact on 5181 and CI deploys it unchanged after all checks succeed.
    // Never reuse the player's port 5173 server or attach to a stale build.
    command: 'npm run build && npm run dev -- --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
