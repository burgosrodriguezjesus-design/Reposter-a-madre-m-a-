import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Pruebas de integración contra una base de datos PostgreSQL REAL de pruebas:
 *   DATABASE_URL=<bd de pruebas con rol reposteria_app> DIRECT_URL=<misma bd, dueño> npm run test:integration
 * Nunca contra producción.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
