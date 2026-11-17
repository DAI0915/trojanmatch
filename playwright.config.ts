import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isLocal = /localhost|127\.0\.0\.1/.test(baseURL);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  outputDir: "test-results/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testIgnore: /p3-demo|demo-recruiter/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", testIgnore: /p3-demo|demo-recruiter/, use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: false } },
    // Demo specs share a small local sandbox pool: run them one viewport at a time.
    { name: "demo-desktop", testMatch: /p3-demo|demo-recruiter/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "demo-mobile",
      testMatch: /p3-demo|demo-recruiter/,
      dependencies: ["demo-desktop"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: false },
    },
  ],
  webServer: isLocal
    ? { command: "npm run start", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
