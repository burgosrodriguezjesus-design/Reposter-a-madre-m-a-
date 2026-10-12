import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { redact } from "@/lib/logger";

/**
 * Registro de auditoría a prueba de manipulaciones.
 * Cada entrada guarda el hash SHA-256 de su contenido más el hash de la anterior (cadena):
 * modificar o borrar una entrada intermedia rompe la cadena y `verifyAuditChain` lo detecta.
 * Además, la base de datos impide UPDATE/DELETE/TRUNCATE (trigger en la migración `seguridad`).
 * Los detalles nunca contienen datos personales en claro (se enmascaran por si acaso).
 */
export type Actor = { id: string; email: string; role: string } | null;
export type Severity = "info" | "warning" | "alert";

export type AuditEntry = {
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  severity?: Severity;
  actor?: Actor;
  ipHash?: string | null;
};

const GENESIS = "0".repeat(64);
const LOCK_ID = 4_242_001;

/** JSON con claves ordenadas: PostgreSQL (jsonb) no conserva el orden original de las claves. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  }
  return value;
}

function digest(prevHash: string, row: unknown[]): string {
  return createHash("sha256").update(prevHash).update(JSON.stringify(stable(row))).digest("hex");
}

function canonical(e: {
  createdAt: Date;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  severity: string;
  ipHash: string | null;
  details: unknown;
}) {
  return [
    e.createdAt.toISOString(),
    e.actorId,
    e.actorEmail,
    e.actorRole,
    e.action,
    e.entity,
    e.entityId,
    e.severity,
    e.ipHash,
    e.details ?? null,
  ];
}

export async function audit(entry: AuditEntry): Promise<void> {
  const details = entry.details ? (redact(entry.details, 0, "secrets") as Prisma.InputJsonValue) : undefined;
  await db.$transaction(async (tx) => {
    // Serializa las inserciones para que la cadena sea lineal
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID})`;
    const last = await tx.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
    const row = {
      createdAt: new Date(),
      actorId: entry.actor?.id ?? null,
      actorEmail: entry.actor?.email ?? null,
      actorRole: entry.actor?.role ?? null,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      severity: entry.severity ?? "info",
      ipHash: entry.ipHash ?? null,
      details: details ?? null,
    };
    const prevHash = last?.hash ?? GENESIS;
    const hash = digest(prevHash, canonical(row));
    await tx.auditLog.create({ data: { ...row, details, prevHash, hash } });
  });
}

/** Recorre todo el registro y comprueba la cadena de hashes. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAtSeq?: number; head?: string }> {
  let cursor = 0;
  let prev: string | null = null;
  let checked = 0;
  let head: string | undefined;
  for (;;) {
    const rows = await db.auditLog.findMany({ where: { seq: { gt: cursor } }, orderBy: { seq: "asc" }, take: 1000 });
    if (rows.length === 0) break;
    for (const r of rows) {
      if (prev !== null && r.prevHash !== prev) return { ok: false, checked, brokenAtSeq: r.seq };
      const expected = digest(r.prevHash, canonical({ ...r, details: r.details ?? null }));
      if (expected !== r.hash) return { ok: false, checked, brokenAtSeq: r.seq };
      prev = r.hash;
      head = r.hash;
      checked++;
      cursor = r.seq;
    }
  }
  return { ok: true, checked, head };
}
