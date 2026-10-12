import type { Instrumentation } from "next";

/** Se ejecuta una vez al arrancar cada instancia del servidor. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnvironment } = await import("@/lib/env");
  const { log } = await import("@/lib/logger");
  const { errors, warnings } = checkEnvironment();
  for (const w of warnings) log.warn("config.warning", { message: w });
  if (errors.length) {
    for (const e of errors) log.error("config.error", { message: e });
    throw new Error(`Configuración insegura o incompleta: ${errors.join(" · ")}`);
  }
  const { registerGauge } = await import("@/lib/metrics");
  const { jobStats } = await import("@/lib/jobs");
  registerGauge("jobs_pending", async () => (await jobStats()).pending, "Trabajos en cola");
  registerGauge("jobs_failed", async () => (await jobStats()).failed, "Trabajos fallidos definitivamente");
  registerGauge("jobs_oldest_pending_seconds", async () => (await jobStats()).oldestPendingSec, "Antigüedad del trabajo pendiente más antiguo");
}

/** Errores del servidor: se registran sin datos personales y se cuentan para las alertas. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { log } = await import("@/lib/logger");
  const { inc } = await import("@/lib/metrics");
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  inc("http_server_errors_total", { kind: context.routeType });
  log.error("request.error", { path: request.path.split("?")[0], method: request.method, route: context.routePath, digest, message });
  if (/P1001|P1002|P1008|P1017|P2024|Can't reach database|Connection terminated|too many connections/i.test(message)) {
    const { securityAlert } = await import("@/lib/alerts");
    await securityAlert("db.error", "Errores de conexión con la base de datos.", { route: context.routePath }, { dedupe: "db", severity: "critical" });
  }
};
