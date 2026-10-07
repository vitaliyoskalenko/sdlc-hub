import { defineConfig } from "@playwright/test";

// The walk runs against the bundled CLI in demo mode. Run `npm run build` first; `npm run e2e` does both.
export default defineConfig({
  testDir: "e2e",
  timeout: 600_000,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4198", browserName: "chromium" },
  webServer: {
    command: "node packages/cli/dist/cli.mjs demo --port 4198",
    url: "http://127.0.0.1:4198/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
