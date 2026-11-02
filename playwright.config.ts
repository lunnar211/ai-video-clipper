import { defineConfig } from "@playwright/test";

/**
 * First Playwright suite (ClipForge Phase 7).
 *
 * Runs against a production build: CI builds, then starts the server.
 * Locally, if a dev server is already on :3000 it is reused instead.
 * Specs cover only honest, signed-out states — no test accounts, no
 * secrets, no real AI calls.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    // Dummy public values ONLY so the sign-in form renders in tests.
    // No real backend exists behind them; specs never submit a sign-in.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
