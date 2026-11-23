import { defineConfig } from "@playwright/test";

// Modified by Agental: these specs are written upstream and name the upstream product, so the app
// they launch runs with the upstream identity. The white-label has its own tests.
process.env.RAKAZO_BRAND ??= "upstream";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  globalSetup: "./electron-binary.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
