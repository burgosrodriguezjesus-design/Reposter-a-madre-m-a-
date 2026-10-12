import { describe, expect, it } from "vitest";
import { checkSlot, getDayAvailability, localNow, slotsForDate, type AvailabilityContext } from "./availability";

// 2026-10-12 es lunes
const hours = [
  { weekday: 1, opensAt: "09:30", closesAt: "11:00" },
  { weekday: 1, opensAt: "17:00", closesAt: "18:00" },
  { weekday: 2, opensAt: "09:30", closesAt: "11:00" },
];

function ctx(overrides: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return {
    now: { date: "2026-10-11", minutes: 10 * 60 }, // domingo 10:00
    leadHours: 24,
    hours,
    blocked: [],
    counts: { perDay: {}, perSlot: {} },
    slotMinutes: 30,
    maxOrdersPerSlot: 2,
    maxOrdersPerDay: 10,
    maxAdvanceDays: 60,
    ...overrides,
  };
}

describe("availability", () => {
  it("genera franjas dentro del horario partido", () => {
    expect(slotsForDate("2026-10-12", hours, 30)).toEqual(["09:30", "10:00", "10:30", "17:00", "17:30"]);
    expect(slotsForDate("2026-10-11", hours, 30)).toEqual([]);
  });

  it("respeta la antelación mínima", () => {
    const day = getDayAvailability("2026-10-12", ctx());
    expect(day.status).toBe("open");
    expect(day.slots.filter((s) => s.available).map((s) => s.time)).toEqual(["10:00", "10:30", "17:00", "17:30"]);
    expect(checkSlot("2026-10-12", "09:30", ctx())).toMatchObject({ ok: false });
    expect(checkSlot("2026-10-12", "10:00", ctx())).toEqual({ ok: true });
  });

  it("marca días cerrados, bloqueados y demasiado pronto", () => {
    expect(getDayAvailability("2026-10-11", ctx()).status).toBe("closed");
    const monday = ctx({ now: { date: "2026-10-12", minutes: 9 * 60 } });
    expect(getDayAvailability("2026-10-12", monday).status).toBe("too-soon");
    expect(getDayAvailability("2026-10-14", ctx()).status).toBe("closed");
    const blocked = ctx({ blocked: [{ startDate: "2026-10-12", endDate: "2026-10-13", reason: "Vacaciones" }] });
    expect(getDayAvailability("2026-10-13", blocked)).toMatchObject({ status: "blocked", reason: "Vacaciones" });
    expect(getDayAvailability("2027-01-20", ctx()).status).toBe("too-far");
  });

  it("controla la capacidad por franja y por día", () => {
    const full = ctx({ counts: { perDay: {}, perSlot: { "2026-10-12 10:00": 2 } } });
    expect(checkSlot("2026-10-12", "10:00", full)).toMatchObject({ ok: false });
    const dayFull = ctx({ counts: { perDay: { "2026-10-13": 10 }, perSlot: {} } });
    expect(getDayAvailability("2026-10-13", dayFull).status).toBe("full");
  });

  it("rechaza horas fuera de horario o mal formadas", () => {
    expect(checkSlot("2026-10-12", "12:00", ctx())).toMatchObject({ ok: false });
    expect(checkSlot("2026-02-30", "10:00", ctx())).toMatchObject({ ok: false });
  });

  it("calcula la hora local del negocio", () => {
    expect(localNow("Europe/Madrid", new Date("2026-10-12T08:15:00Z"))).toEqual({ date: "2026-10-12", minutes: 10 * 60 + 15 });
    expect(localNow("Europe/Madrid", new Date("2026-12-31T23:30:00Z"))).toEqual({ date: "2027-01-01", minutes: 30 });
  });
});
