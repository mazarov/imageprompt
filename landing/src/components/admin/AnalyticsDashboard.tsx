"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnalyticsDashboardData } from "@/lib/analytics-data";
import { ClientsDailyChart } from "@/components/admin/ClientsDailyChart";

type KindFilter = "all" | "generation" | "analyze";

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 shadow-sm shadow-black/20">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function AnalyticsDashboard() {
  const [days, setDays] = useState(30);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(null);
        setError({
          status: res.status,
          message:
            body?.message ||
            body?.error ||
            (res.status === 401
              ? "Sign in required"
              : res.status === 403
                ? "Access denied"
                : "Failed to load analytics"),
        });
        return;
      }
      setData(body as AnalyticsDashboardData);
    } catch {
      setData(null);
      setError({ status: 0, message: "Network error" });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error?.status === 401) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-zinc-900/70 p-8 text-center">
        <h1 className="text-xl font-semibold text-zinc-50">Analytics</h1>
        <p className="mt-3 text-sm text-zinc-400">Sign in with an allowed Google account to view metrics.</p>
        <a
          href={`/api/auth/google?next=${encodeURIComponent("/admin/analytics")}`}
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in with Google
        </a>
      </div>
    );
  }

  if (error?.status === 403) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-8 text-center">
        <h1 className="text-xl font-semibold text-zinc-50">Access denied</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Your account is not in <code className="text-amber-200">ANALYTICS_ADMIN_EMAILS</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-400">Users, clients, and request volume</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                days === d
                  ? "bg-indigo-600 text-white"
                  : "border border-white/10 bg-zinc-900 text-zinc-300 hover:border-white/20"
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-white/20"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error.message}
        </p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total users" value={data.summary.totalUsers} />
            <StatCard
              label="Active users"
              value={data.summary.activeUsers30d}
              hint="Any request in last 30 days"
            />
            <StatCard
              label="Requests"
              value={data.summary.requestsInPeriod}
              hint={`Last ${data.days} days`}
            />
            <StatCard
              label="Generations / analyzes"
              value={`${data.summary.generationsInPeriod} / ${data.summary.analyzesInPeriod}`}
              hint={`Last ${data.days} days`}
            />
          </div>

          <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Requests by client</h2>
              <div className="flex gap-2">
                {(
                  [
                    ["all", "All"],
                    ["generation", "Generations"],
                    ["analyze", "Analyze"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKindFilter(value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      kindFilter === value
                        ? "bg-zinc-100 text-zinc-900"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ClientsDailyChart rows={data.clientsDaily} kindFilter={kindFilter} />
          </section>

          <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-200">Top users by volume</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">Email</th>
                    <th className="pb-2 pr-4 font-medium">Total</th>
                    <th className="pb-2 pr-4 font-medium">Gen</th>
                    <th className="pb-2 pr-4 font-medium">Analyze</th>
                    <th className="pb-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-zinc-500">
                        No activity yet
                      </td>
                    </tr>
                  ) : (
                    data.topUsers.map((row, i) => (
                      <tr
                        key={`${row.email ?? "anon"}-${row.last_seen ?? i}`}
                        className="border-b border-white/5"
                      >
                        <td className="py-2.5 pr-4 text-zinc-200">{row.email ?? "—"}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-zinc-300">{row.total_requests}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-zinc-400">{row.generations}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-zinc-400">{row.analyzes}</td>
                        <td className="py-2.5 tabular-nums text-zinc-500">{formatDate(row.last_seen)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
