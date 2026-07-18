import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "shared/test/**/*.test.ts",
      "nav-publisher/test/**/*.test.ts",
      "attestation-service/test/**/*.test.ts",
      "iso20022-adapter/test/**/*.test.ts",
    ],
    testTimeout: 10_000,
  },
});
