import "server-only";
import { db, type Tx } from "@/lib/db";
import { cached } from "@/lib/micro-cache";
import { getSettings } from "@/lib/settings";
import { ACTIVE_ORDER_STATUSES } from "@/lib/order-status";
import { getCalendar, localNow, type AvailabilityContext, type CapacityCounts } from "@/lib/availability";

/** Minutos que un pedido pendiente de pago reserva su franja. */
const PAYMENT_HOLD_MINUTES = 35;

/** Pedidos que ocupan capacidad desde `fromDate` (o solo ese día con `onlyDate`). */
export async function capacityCounts(fromDate: string, client: Tx | typeof db = db, onlyDate = false): Promise<CapacityCounts> {
  const rows = await client.order.groupBy({
    by: ["scheduledDate", "scheduledTime"],
    where: {
      scheduledDate: onlyDate ? fromDate : { gte: fromDate },
      OR: [
        { status: { in: ACTIVE_ORDER_STATUSES } },
        { status: "PENDING_PAYMENT", createdAt: { gte: new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60_000) } },
      ],
    },
    _count: { _all: true },
  });
  const counts: CapacityCounts = { perDay: {}, perSlot: {} };
  for (const row of rows) {
    counts.perDay[row.scheduledDate] = (counts.perDay[row.scheduledDate] ?? 0) + row._count._all;
    counts.perSlot[`${row.scheduledDate} ${row.scheduledTime}`] = row._count._all;
  }
  return counts;
}

export async function availabilityContext(leadHours: number): Promise<AvailabilityContext> {
  const settings = await getSettings();
  const now = localNow(settings.business.timezone);
  // Micro-caché de pocos segundos: es solo para MOSTRAR huecos; la comprobación definitiva se
  // repite dentro de la transacción del pedido, con bloqueo, sin caché.
  const [hours, blocked, counts] = await Promise.all([
    cached("schedule:hours", 30_000, () => db.openingHour.findMany()),
    cached(`schedule:blocked:${now.date}`, 30_000, () => db.blockedDate.findMany({ where: { endDate: { gte: now.date } } })),
    cached(`schedule:counts:${now.date}`, 5_000, () => capacityCounts(now.date)),
  ]);
  const o = settings.ordering;
  return {
    now,
    leadHours: Math.max(o.minLeadHours, leadHours),
    hours,
    blocked,
    counts,
    slotMinutes: o.slotMinutes,
    maxOrdersPerSlot: o.maxOrdersPerSlot,
    maxOrdersPerDay: o.maxOrdersPerDay,
    maxAdvanceDays: o.maxAdvanceDays,
  };
}

export async function getAvailabilityCalendar(leadHours: number, days = 60) {
  const ctx = await availabilityContext(leadHours);
  return { leadHours: ctx.leadHours, days: getCalendar(ctx, days) };
}

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Horario agrupado para mostrar (lunes primero) y para datos estructurados. */
export async function getOpeningSchedule() {
  const hours = await db.openingHour.findMany({ orderBy: [{ weekday: "asc" }, { opensAt: "asc" }] });
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((weekday) => ({
    weekday,
    name: WEEKDAYS[weekday],
    intervals: hours.filter((h) => h.weekday === weekday).map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt })),
  }));
}

export type OpeningSchedule = Awaited<ReturnType<typeof getOpeningSchedule>>;
