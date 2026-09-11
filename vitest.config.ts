import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/foundation/tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "apps/foundation/app"),
    },
  },
});
