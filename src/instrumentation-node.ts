import http from "node:http";
import { checkEnvironment } from "@/lib/env";
import { instrumentHttpServer } from "@/lib/http-metrics";
import { log } from "@/lib/logger";
import { inc, registerGauge } from "@/lib/metrics";
import { jobStats } from "@/lib/jobs";
import { securityAlert } from "@/lib/alerts";

/** Arranque del servidor (solo Node.js): valida la configuración y registra métricas. */
export function startup() {
  const { errors, warnings } = checkEnvironment();
  for (const w of warnings) log.warn("config.warning", { message: w });
  if (errors.length) {
    for (const e of errors) log.error("config.error", { message: e });
    throw new Error(`Configuración insegura o incompleta: ${errors.join(" · ")}`);
  }
  instrumentHttpServer(http.Server.prototype);
  registerGauge("jobs_pending", async () => (await jobStats()).pending, "Trabajos en cola");
  registerGauge("jobs_failed", async () => (await jobStats()).failed, "Trabajos fallidos definitivamente");
  registerGauge("jobs_oldest_pending_seconds", async () => (await jobStats()).oldestPendingSec, "Antigüedad del trabajo pendiente más antiguo");
}

export async function reportError(message: string, info: { path: string; method: string; route: string; kind: string; digest?: string }) {
  inc("http_server_errors_total", { kind: info.kind });
  log.error("request.error", { path: info.path.split("?")[0], method: info.method, route: info.route, digest: info.digest, message });
  if (/P1001|P1002|P1008|P1017|P2024|Can't reach database|Connection terminated|too many connections/i.test(message)) {
    await securityAlert("db.error", "Errores de conexión con la base de datos.", { route: info.route }, { dedupe: "db", severity: "critical" });
  }
}
