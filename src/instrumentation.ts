import type { Instrumentation } from "next";

/** Se ejecuta una vez al arrancar cada instancia del servidor. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startup } = await import("./instrumentation-node");
    startup();
  }
}

/** Errores del servidor: se registran sin datos personales y se cuentan para las alertas. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./instrumentation-node");
  const message = error instanceof Error ? error.message : String(error);
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  await reportError(message, { path: request.path, method: request.method, route: context.routePath, kind: context.routeType, digest });
};
