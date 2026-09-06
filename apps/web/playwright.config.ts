import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/storybook",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.03,
      threshold: 0.3,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:6106",
    colorScheme: "light",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: "node scripts/serve-storybook.mjs",
    reuseExistingServer: !process.env.CI,
    url: "http://127.0.0.1:6106/index.json",
  },
});
