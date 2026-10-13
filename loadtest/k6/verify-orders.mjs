/**
 * Integridad tras una prueba k6: ningún pedido confirmado perdido ni duplicado.
 *   DATABASE_URL=<bd de staging> EMAIL=carga-k6-<id>@example.com CONFIRMADOS=<pedidos_confirmados de k6> \
 *     npx tsx loadtest/k6/verify-orders.mjs
 * (necesita DATA_HASH_KEY del mismo entorno para calcular el índice ciego del email)
 * Sale con código 1 si hay menos pedidos en la BD que confirmados o claves de idempotencia repetidas.
 * Puede haber MÁS pedidos en la BD que confirmados: pedidos guardados cuya respuesta no llegó al
 * cliente (tiempo de espera agotado); un reintento con la misma Idempotency-Key los recupera.
 */
import { PrismaClient } from "@prisma/client";
import { emailHash } from "../../src/lib/crypto.ts";

const email = process.env.EMAIL;
const confirmed = Number(process.env.CONFIRMADOS ?? NaN);
if (!email || !Number.isFinite(confirmed)) throw new Error("Define EMAIL y CONFIRMADOS");

const db = new PrismaClient();
try {
  const rows = await db.order.findMany({ where: { customerEmailHash: emailHash(email) }, select: { idempotencyKey: true } });
  const keys = rows.map((r) => r.idempotencyKey).filter(Boolean);
  const result = {
    confirmadosAClientes: confirmed,
    enBaseDeDatos: rows.length,
    clavesIdempotenciaRepetidas: keys.length - new Set(keys).size,
    guardadosSinConfirmacionAlCliente: Math.max(0, rows.length - confirmed),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = rows.length < confirmed || result.clavesIdempotenciaRepetidas > 0 ? 1 : 0;
} finally {
  await db.$disconnect();
}
