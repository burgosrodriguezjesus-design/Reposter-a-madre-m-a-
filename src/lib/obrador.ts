import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { enqueue } from "@/lib/jobs";
import { log } from "@/lib/logger";

/**
 * Conexión con la app del obrador: cada pedido confirmado se envía allí (calendario, producción,
 * ingredientes y lista de la compra) y después sus cancelaciones.
 * - El código de conexión lo genera el obrador (Configuración → Tienda online) y se pega en
 *   Ajustes. Se guarda CIFRADO en una fila propia de Setting que no forma parte de los ajustes
 *   generales (esos llegan a las páginas públicas) y nunca se vuelve a mostrar.
 * - El envío va por la cola de trabajos (outbox): si el obrador no responde se reintenta, y el
 *   obrador no duplica pedidos (usa el número de pedido como referencia única).
 */
const SETTING_KEY = "obrador-connection";
const CONTEXT = "Setting.obrador-connection";
const TOKEN_RE = /^tienda_[A-Za-z0-9_-]{30,100}$/;

type StoredConnection = { origin: string; token: string; connectedAt: string };
export type ObradorConnection = { origin: string; token: string; connectedAt: string };

/** «https://obrador.example#tienda_…» → origen + llave. Solo HTTPS y nombres de dominio (nunca IPs ni credenciales en la URL). */
export function parseConnectionCode(code: string): { origin: string; token: string } | null {
  let url: URL;
  try {
    url = new URL(code.trim());
  } catch {
    return null;
  }
  const token = url.hash.slice(1);
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || !TOKEN_RE.test(token)) return null;
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.startsWith("[") || host === "localhost") return null;
  return { origin: url.origin, token };
}

export async function getObradorConnection(client: Tx | typeof db = db): Promise<ObradorConnection | null> {
  const row = await client.setting.findUnique({ where: { key: SETTING_KEY } });
  const value = row?.value as Partial<StoredConnection> | null | undefined;
  if (!value?.origin || !value.token) return null;
  try {
    return { origin: value.origin, token: decrypt(value.token, CONTEXT), connectedAt: value.connectedAt ?? "" };
  } catch (error) {
    log.error("obrador.connection_unreadable", { error });
    return null;
  }
}

/** Estado para el panel (sin la llave). */
export async function obradorStatus() {
  const connection = await getObradorConnection();
  if (!connection) return { connected: false as const };
  const [pending, failed] = await Promise.all([
    db.job.count({ where: { type: "obrador.sync", status: { in: ["PENDING", "RUNNING"] } } }),
    db.job.count({ where: { type: "obrador.sync", status: "FAILED" } }),
  ]);
  return { connected: true as const, host: new URL(connection.origin).host, connectedAt: connection.connectedAt, pending, failed };
}

export async function saveObradorConnection(code: string): Promise<boolean> {
  const parsed = parseConnectionCode(code);
  if (!parsed) return false;
  const value: StoredConnection = { origin: parsed.origin, token: encrypt(parsed.token, CONTEXT), connectedAt: new Date().toISOString() };
  await db.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
  return true;
}

export async function removeObradorConnection() {
  await db.setting.deleteMany({ where: { key: SETTING_KEY } });
}

/** Encola el envío del pedido al obrador (si está conectado). Idempotente por motivo. */
export async function enqueueObradorSync(orderId: string, reason: string, tx?: Tx) {
  const client = tx ?? db;
  if (!(await client.setting.count({ where: { key: SETTING_KEY } }))) return;
  await enqueue("obrador.sync", { orderId }, { tx, dedupeKey: `obrador:${orderId}:${reason}`, maxAttempts: 12 });
}

const OBRADOR_STATUS: Partial<Record<OrderStatus, "pendiente" | "confirmado" | "cancelado">> = {
  PENDING: "pendiente",
  ACCEPTED: "confirmado",
  IN_PREPARATION: "confirmado",
  READY: "confirmado",
  DELIVERED: "confirmado",
  REJECTED: "cancelado",
  CANCELLED: "cancelado",
};

/** Lo que se envía al obrador: solo lo necesario para preparar el pedido (sin email ni datos de pago). */
export async function obradorPayload(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } } } });
  if (!order) return null;
  const status = OBRADOR_STATUS[order.status];
  // Sin pagar aún (pago online) o anonimizado: no hay nada que apuntar, salvo su cancelación
  if (!status || (order.anonymizedAt && status !== "cancelado")) return null;
  return {
    ref: order.number,
    status,
    customer: { name: order.customerName, phone: order.customerPhone || null },
    pickup_date: order.scheduledDate,
    pickup_time: order.scheduledTime || null,
    items: order.items.map((item) => {
      const options = Array.isArray(item.options) ? (item.options as { group?: string; choice?: string }[]) : [];
      return {
        name: item.name,
        variant: item.variantName,
        quantity: item.quantity,
        options: options.filter((o) => o?.choice).map((o) => (o.group ? `${o.group}: ${o.choice}` : String(o.choice))),
        dedication: item.dedication,
        notes: item.referencePhotoUrl ? "Tiene foto de referencia: verla en el panel de la web" : null,
        line_total: item.lineTotalCents / 100,
      };
    }),
    notes: order.notes,
  };
}

/** Trabajo de la cola: envía el estado actual del pedido. Lanza un error para que se reintente. */
export async function syncOrderToObrador(orderId: string) {
  const connection = await getObradorConnection();
  if (!connection) return;
  const payload = await obradorPayload(orderId);
  if (!payload) return;
  const res = await fetch(`${connection.origin}/api/integraciones/tienda/pedidos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${connection.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Sin datos del pedido en el registro: solo el estado HTTP
    log.warn("obrador.sync_failed", { status: res.status });
    throw new Error(res.status === 401 ? "El obrador ha rechazado el código de conexión" : `El obrador respondió ${res.status}`);
  }
}
