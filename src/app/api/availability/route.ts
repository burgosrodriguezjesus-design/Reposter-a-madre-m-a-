import { NextResponse } from "next/server";
import { getAvailabilityCalendar } from "@/lib/schedule";

/** Días y horas disponibles para recoger/entregar según la antelación necesaria. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lead = Math.min(24 * 90, Math.max(0, Number(url.searchParams.get("lead")) || 0));
  const days = Math.min(120, Math.max(7, Number(url.searchParams.get("days")) || 60));
  const calendar = await getAvailabilityCalendar(lead, days);
  return NextResponse.json(calendar, { headers: { "Cache-Control": "no-store" } });
}
