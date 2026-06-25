"use client";

import type { ClientsDailyRow } from "@/lib/analytics-data";
import {
  CLIENT_SOURCES_ORDER,
  clientSourceColor,
  clientSourceLabel,
} from "@/components/admin/analytics-constants";

type KindFilter = "all" | "generation" | "analyze";

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function aggregateByDay(
  rows: ClientsDailyRow[],
  kindFilter: KindFilter,
  clientSourceFilter: string,
): { day: string; label: string; bySource: Record<string, number>; total: number }[] {
  const byDay = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (kindFilter !== "all" && row.kind !== kindFilter) continue;
    if (clientSourceFilter !== "all" && row.client_source !== clientSourceFilter) continue;
    const dayKey = row.day.slice(0, 10);
    const bucket = byDay.get(dayKey) ?? {};
    bucket[row.client_source] = (bucket[row.client_source] ?? 0) + row.requests;
    byDay.set(dayKey, bucket);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bySource]) => {
      const total = Object.values(bySource).reduce((s, n) => s + n, 0);
      return { day, label: formatDayLabel(day), bySource, total };
    });
}

export function ClientsDailyChart({
  rows,
  kindFilter,
  clientSourceFilter = "all",
}: {
  rows: ClientsDailyRow[];
  kindFilter: KindFilter;
  clientSourceFilter?: string;
}) {
  const series = aggregateByDay(rows, kindFilter, clientSourceFilter);
  const maxTotal = Math.max(1, ...series.map((s) => s.total));
  const activeSources = CLIENT_SOURCES_ORDER.filter((src) =>
    series.some((s) => (s.bySource[src] ?? 0) > 0),
  );

  if (series.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-8 text-center text-sm text-zinc-400">
        No requests in this period yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        {activeSources.map((src) => (
          <span key={src} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: clientSourceColor(src) }}
            />
            {clientSourceLabel(src)}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[480px] items-end gap-2" style={{ height: 220 }}>
          {series.map((point) => {
            const barHeightPx = Math.max(2, Math.round((point.total / maxTotal) * 180));
            return (
            <div key={point.day} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="flex w-full flex-col-reverse justify-end"
                style={{ height: 180 }}
                title={`${point.label}: ${point.total} requests`}
              >
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-md bg-zinc-800/60"
                  style={{ height: barHeightPx }}
                >
                  {activeSources.map((src) => {
                    const value = point.bySource[src] ?? 0;
                    if (value <= 0) return null;
                    const pct = point.total > 0 ? (value / point.total) * 100 : 0;
                    return (
                      <div
                        key={src}
                        style={{
                          height: `${pct}%`,
                          backgroundColor: clientSourceColor(src),
                          minHeight: value > 0 ? 2 : 0,
                        }}
                        title={`${clientSourceLabel(src)}: ${value}`}
                      />
                    );
                  })}
                </div>
              </div>
              <span className="text-[10px] text-zinc-500">{point.label}</span>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
