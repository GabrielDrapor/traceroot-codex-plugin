import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["plugins/tracing/test/**/*.test.ts"], environment: "node" },
});
