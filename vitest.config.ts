import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // Many tests build real git repositories from the fixtures; under a full parallel run that takes seconds.
    testTimeout: 30_000,
  },
});
