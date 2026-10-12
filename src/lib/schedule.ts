import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ACTIVE_ORDER_STATUSES } from "@/lib/order-status";
import { getCalendar, localNow, type AvailabilityContext, type CapacityCounts } from "@/lib/availability";

/** Minutos que un pedido pendiente de pago reserva su franja. */
const PAYMENT_HOLD_MINUTES = 35;

async function capacityCounts(fromDate: string): Promise<CapacityCounts> {
  const rows = await db.order.groupBy({
    by: ["scheduledDate", "scheduledTime"],
    where: {
      scheduledDate: { gte: fromDate },
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
  const [hours, blocked, counts] = await Promise.all([
    db.openingHour.findMany(),
    db.blockedDate.findMany({ where: { endDate: { gte: now.date } } }),
    capacityCounts(now.date),
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
