import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ is Playwright's, not vitest's: its *.spec.ts files import
    // @playwright/test and must never be collected by vitest.
    exclude: ["node_modules/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
