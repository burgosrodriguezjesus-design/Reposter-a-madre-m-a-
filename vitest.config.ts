import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATA_ENCRYPTION_KEYS: "kt1:AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=,kt2:ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=",
      DATA_ENCRYPTION_ACTIVE_KEY: "kt2",
      DATA_HASH_KEY: "QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl8=",
    },
  },
});
