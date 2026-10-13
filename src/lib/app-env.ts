/**
 * ¿Es el entorno de producción? APP_ENV=production, o un build de producción sin APP_ENV
 * explícito de staging/desarrollo. Única regla para validar la configuración e indexar la web.
 */
export function isProductionEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.APP_ENV === "production" || (env.NODE_ENV === "production" && env.APP_ENV !== "staging" && env.APP_ENV !== "development");
}
