import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "extension/**/*.test.ts"],
    environmentMatchGlobs: [["src/frontend/**/*.test.tsx", "jsdom"]],
    setupFiles: ["src/frontend/test-setup.ts"],
  },
});
