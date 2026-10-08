import { defineConfig } from "@playwright/test";

// The walk runs against the bundled CLI in demo mode. Run `npm run build` first; `npm run e2e` does both.
// Demo servers: the demo project, the two fixtures that check skipped against missed, and a second demo project
// that the save tests change; plus the setup site.
export default defineConfig({
  testDir: "e2e",
  timeout: 600_000,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4198", browserName: "chromium" },
  webServer: [
    { command: "node packages/cli/dist/cli.mjs demo --port 4198", url: "http://127.0.0.1:4198/", reuseExistingServer: false, timeout: 60_000 },
    { command: "node packages/cli/dist/cli.mjs demo --port 4190", url: "http://127.0.0.1:4190/", reuseExistingServer: false, timeout: 60_000 },
    { command: "node packages/cli/dist/cli.mjs demo --fixture quick-route --port 4195", url: "http://127.0.0.1:4195/", reuseExistingServer: false, timeout: 60_000 },
    { command: "node packages/cli/dist/cli.mjs demo --fixture no-user-interface --port 4194", url: "http://127.0.0.1:4194/", reuseExistingServer: false, timeout: 60_000 },
    { command: "node packages/cli/dist/cli.mjs init --no-open --no-keychain --port 4191", url: "http://127.0.0.1:4191/setup", reuseExistingServer: false, timeout: 60_000 },
  ],
});
