import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

// SMOKE_BASE_URL points the tests at a running deployment (devbox run smoke); without it they start the app locally.
const smokeBaseUrl = process.env.SMOKE_BASE_URL;

// The local app runs on E2E_PORT, else PORT, else a free port, so a busy 3000 does not break the tests.
// Playwright loads this file again in every worker: the chosen port goes into the environment the workers inherit.
function freePort(): string {
  const script = "const s=require('node:net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
  return execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim();
}
if (!smokeBaseUrl && !process.env.E2E_PORT) process.env.E2E_PORT = process.env.PORT || freePort();
if (!smokeBaseUrl && !process.env.TASK_API_STUB_PORT) process.env.TASK_API_STUB_PORT = freePort();
const port = process.env.E2E_PORT;
const stubPort = process.env.TASK_API_STUB_PORT;
// The app and the tests both read the stub's address from TASK_API_URL (spec 001).
if (!smokeBaseUrl) process.env.TASK_API_URL = `http://127.0.0.1:${stubPort}`;

export default defineConfig({
  testDir: "./e2e",
  ...(smokeBaseUrl
    ? {}
    : {
        workers: 1,
        webServer: [
          {
            command: "node e2e/support/task-api-stub.mjs",
            url: `http://127.0.0.1:${stubPort}/__stub/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
          {
            command: `pnpm build && pnpm exec next start --port ${port}`,
            url: `http://localhost:${port}/api/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }),
  use: { baseURL: smokeBaseUrl || `http://localhost:${port}` },
});
