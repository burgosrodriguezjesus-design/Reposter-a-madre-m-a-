import "server-only";
import { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { log, maskString } from "@/lib/logger";
import { inc } from "@/lib/metrics";

/**
 * Cola de trabajos transaccional (patrón outbox) sobre PostgreSQL.
 * - Los trabajos se crean en la MISMA transacción que el cambio que los origina (p. ej. el pago
 *   de un pedido): si la transacción falla no hay email; si se confirma, el email se enviará
 *   aunque el proceso caiga justo después.
 * - Varios procesadores en paralelo sin duplicar trabajo (FOR UPDATE SKIP LOCKED).
 * - Reintentos con espera exponencial; tras agotarlos, el trabajo queda en FAILED y se alerta.
 * - `dedupeKey` evita encolar dos veces lo mismo (idempotencia).
 * - El payload solo lleva identificadores: los datos personales se leen (cifrados) al procesar.
 */
export type JobPayload = Record<string, string | number | boolean | null>;

export async function enqueue(
  type: string,
  payload: JobPayload,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number; tx?: Tx } = {},
): Promise<void> {
  const client = opts.tx ?? db;
  const data = { type, payload, dedupeKey: opts.dedupeKey, runAt: opts.runAt, maxAttempts: opts.maxAttempts };
  if (opts.dedupeKey) {
    // Idempotente: si ya existe un trabajo con esa clave, no se duplica.
    await client.job.upsert({ where: { dedupeKey: opts.dedupeKey }, create: data, update: {} });
  } else {
    await client.job.create({ data });
  }
}

type Claimed = { id: string; type: string; payload: JobPayload; attempts: number; maxAttempts: number };
export type JobHandler = (payload: JobPayload, job: { id: string; attempts: number }) => Promise<void>;

/** Reserva hasta `limit` trabajos listos (o abandonados por un proceso caído hace > 5 min). */
async function claim(limit: number, types?: string[]): Promise<Claimed[]> {
  const typeFilter = types?.length ? Prisma.sql`AND "type" IN (${Prisma.join(types)})` : Prisma.empty;
  return db.$queryRaw<Claimed[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1, "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "Job"
      WHERE (("status" = 'PENDING' AND "runAt" <= now()) OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '5 minutes'))
      ${typeFilter}
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

function backoffMs(attempts: number): number {
  const base = Math.min(30_000 * 2 ** (attempts - 1), 6 * 3600_000);
  return base + Math.floor(Math.random() * base * 0.2);
}

export async function processJobs(
  handlers: Record<string, JobHandler>,
  opts: { limit?: number; timeBudgetMs?: number; types?: string[]; onPermanentFailure?: (job: Claimed, error: string) => Promise<void> } = {},
): Promise<{ done: number; retried: number; failed: number }> {
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? 20_000;
  const stats = { done: 0, retried: 0, failed: 0 };
  while (Date.now() - started < budget) {
    const jobs = await claim(opts.limit ?? 10, opts.types);
    if (jobs.length === 0) break;
    await Promise.all(
      jobs.map(async (job) => {
        const handler = handlers[job.type];
        try {
          if (!handler) throw new Error(`Tipo de trabajo desconocido: ${job.type}`);
          await handler(job.payload, { id: job.id, attempts: job.attempts });
          await db.job.update({ where: { id: job.id }, data: { status: "DONE", lockedAt: null, lastError: null } });
          stats.done++;
          inc("jobs_processed_total", { type: job.type, result: "ok" });
        } catch (error) {
          const message = maskString(error instanceof Error ? error.message : String(error)).slice(0, 500);
          const permanent = job.attempts >= job.maxAttempts;
          await db.job.update({
            where: { id: job.id },
            data: permanent
              ? { status: "FAILED", lockedAt: null, lastError: message }
              : { status: "PENDING", lockedAt: null, lastError: message, runAt: new Date(Date.now() + backoffMs(job.attempts)) },
          });
          inc("jobs_processed_total", { type: job.type, result: permanent ? "failed" : "retry" });
          log.warn("job.error", { jobId: job.id, type: job.type, attempts: job.attempts, permanent, message });
          if (permanent) {
            stats.failed++;
            await opts.onPermanentFailure?.(job, message).catch(() => {});
          } else stats.retried++;
        }
      }),
    );
  }
  return stats;
}

/** Vuelve a poner en cola un trabajo fallido (desde el panel). */
export async function retryJob(id: string) {
  await db.job.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, runAt: new Date(), lastError: null } });
}

export async function jobStats() {
  const [pending, failed, oldest] = await Promise.all([
    db.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
    db.job.count({ where: { status: "FAILED" } }),
    db.job.findFirst({ where: { status: "PENDING" }, orderBy: { runAt: "asc" }, select: { runAt: true } }),
  ]);
  return { pending, failed, oldestPendingSec: oldest ? Math.max(0, Math.round((Date.now() - oldest.runAt.getTime()) / 1000)) : 0 };
}
