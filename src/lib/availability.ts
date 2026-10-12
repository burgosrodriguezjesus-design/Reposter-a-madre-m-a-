/**
 * Disponibilidad de fechas y horas de recogida/entrega.
 * Funciones puras (sin base de datos) para poder probarlas y reutilizarlas.
 * Todas las fechas son locales del negocio: "YYYY-MM-DD" y horas "HH:MM".
 */

export type OpeningInterval = { weekday: number; opensAt: string; closesAt: string };
export type BlockedRange = { startDate: string; endDate: string; reason?: string | null };
export type CapacityCounts = { perDay: Record<string, number>; perSlot: Record<string, number> };

export type AvailabilityContext = {
  now: { date: string; minutes: number };
  leadHours: number;
  hours: OpeningInterval[];
  blocked: BlockedRange[];
  counts: CapacityCounts;
  slotMinutes: number;
  maxOrdersPerSlot: number; // 0 = sin límite
  maxOrdersPerDay: number; // 0 = sin límite
  maxAdvanceDays: number;
};

export type DayStatus = "open" | "closed" | "blocked" | "full" | "too-soon" | "too-far";

export type DayAvailability = {
  date: string;
  status: DayStatus;
  reason?: string;
  slots: { time: string; available: boolean }[];
};

export function localNow(timeZone: string, now = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Horas de inicio de franja dentro del horario de apertura de ese día. */
export function slotsForDate(date: string, hours: OpeningInterval[], slotMinutes: number): string[] {
  const wd = weekdayOf(date);
  const step = Math.max(10, slotMinutes);
  const times: string[] = [];
  for (const interval of hours.filter((h) => h.weekday === wd).sort((a, b) => a.opensAt.localeCompare(b.opensAt))) {
    const end = toMinutes(interval.closesAt);
    for (let t = toMinutes(interval.opensAt); t + step <= end; t += step) times.push(fromMinutes(t));
  }
  return [...new Set(times)];
}

export function blockedReason(date: string, blocked: BlockedRange[]): string | null {
  const hit = blocked.find((b) => date >= b.startDate && date <= b.endDate);
  return hit ? hit.reason || "Cerrado" : null;
}

export function getDayAvailability(date: string, ctx: AvailabilityContext): DayAvailability {
  const offset = dayNumber(date) - dayNumber(ctx.now.date);
  if (offset > ctx.maxAdvanceDays) return { date, status: "too-far", reason: "Fecha demasiado lejana", slots: [] };

  const blocked = blockedReason(date, ctx.blocked);
  if (blocked) return { date, status: "blocked", reason: blocked, slots: [] };

  const times = slotsForDate(date, ctx.hours, ctx.slotMinutes);
  if (times.length === 0) return { date, status: "closed", reason: "Cerrado", slots: [] };

  const earliest = dayNumber(ctx.now.date) * 1440 + ctx.now.minutes + ctx.leadHours * 60;
  const dayStart = dayNumber(date) * 1440;
  const dayFull = ctx.maxOrdersPerDay > 0 && (ctx.counts.perDay[date] ?? 0) >= ctx.maxOrdersPerDay;

  const slots = times.map((time) => {
    const slotFull =
      ctx.maxOrdersPerSlot > 0 && (ctx.counts.perSlot[`${date} ${time}`] ?? 0) >= ctx.maxOrdersPerSlot;
    return { time, available: !dayFull && !slotFull && dayStart + toMinutes(time) >= earliest };
  });

  if (slots.every((s) => !s.available)) {
    const tooSoon = dayStart + toMinutes(times[times.length - 1]) < earliest;
    if (tooSoon) return { date, status: "too-soon", reason: "Necesitamos más antelación", slots };
    return { date, status: "full", reason: "Completo", slots };
  }
  return { date, status: "open", slots };
}

export function checkSlot(date: string, time: string, ctx: AvailabilityContext): { ok: true } | { ok: false; error: string } {
  if (!isValidDate(date) || !isValidTime(time)) return { ok: false, error: "Fecha u hora no válidas" };
  const day = getDayAvailability(date, ctx);
  if (day.status !== "open") {
    const messages: Record<DayStatus, string> = {
      open: "",
      closed: "Ese día no abrimos",
      blocked: `Ese día no está disponible (${day.reason})`,
      full: "Ese día ya está completo",
      "too-soon": `Este pedido necesita al menos ${ctx.leadHours} h de antelación`,
      "too-far": `Solo aceptamos pedidos con hasta ${ctx.maxAdvanceDays} días de antelación`,
    };
    return { ok: false, error: messages[day.status] };
  }
  const slot = day.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, error: "Esa hora está fuera de nuestro horario" };
  if (!slot.available) return { ok: false, error: "Esa hora ya no está disponible, elige otra" };
  return { ok: true };
}

/** Disponibilidad de varios días a partir de hoy (para el calendario del checkout). */
export function getCalendar(ctx: AvailabilityContext, days: number): DayAvailability[] {
  const list: DayAvailability[] = [];
  for (let i = 0; i <= Math.min(days, ctx.maxAdvanceDays); i++) {
    list.push(getDayAvailability(addDays(ctx.now.date, i), ctx));
  }
  return list;
}
