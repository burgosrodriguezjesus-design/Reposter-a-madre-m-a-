import type { OpeningSchedule } from "@/lib/schedule";

export function OpeningHours({ schedule, compact = false }: { schedule: OpeningSchedule; compact?: boolean }) {
  return (
    <dl className={compact ? "space-y-1 text-xs text-cocoa-600" : "divide-y divide-sand-300/60 text-[15px]"}>
      {schedule.map((day) => (
        <div key={day.weekday} className={compact ? "flex justify-between gap-4" : "flex justify-between gap-6 py-2.5"}>
          <dt className={compact ? "" : "font-medium text-cocoa-800"}>{compact ? day.name.slice(0, 3) : day.name}</dt>
          <dd className={day.intervals.length ? "text-right text-cocoa-700" : "text-right text-cocoa-500"}>
            {day.intervals.length
              ? day.intervals.map((i) => `${i.opensAt}–${i.closesAt}`).join(" · ")
              : "Cerrado"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
