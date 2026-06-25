"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalyticsDashboardData,
  ExtensionFunnelRow,
  ExtensionOutcomeRow,
} from "@/lib/analytics-data";
import { ClientsDailyChart } from "@/components/admin/ClientsDailyChart";
import { CLIENT_SOURCES_ORDER, clientSourceLabel } from "@/components/admin/analytics-constants";

type KindFilter = "all" | "generation" | "analyze";
type ClientSourceFilter = "all" | (typeof CLIENT_SOURCES_ORDER)[number];

const PERIOD_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

type AggregatedFunnelRow = {
  mode: string;
  client_source: string;
  locale: string;
  browser: string;
  clicks: number;
  starts_ok: number;
  starts_err: number;
  results_shown: number;
  errors_shown: number;
  copies: number;
};

type AggregatedOutcomeRow = {
  endpoint: string;
  client_source: string;
  style: string;
  locale: string;
  requests: number;
  success: number;
  truncated: number;
  rate_limited: number;
  upstream_error: number;
  empty_response: number;
};

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

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function sumRows<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + pick(row), 0);
}

function aggregateFunnel(rows: ExtensionFunnelRow[]): AggregatedFunnelRow[] {
  const map = new Map<string, AggregatedFunnelRow>();
  for (const row of rows) {
    const key = `${row.mode}|${row.client_source}|${row.locale}|${row.browser}`;
    const existing = map.get(key);
    if (existing) {
      existing.clicks += row.clicks;
      existing.starts_ok += row.starts_ok;
      existing.starts_err += row.starts_err;
      existing.results_shown += row.results_shown;
      existing.errors_shown += row.errors_shown;
      existing.copies += row.copies;
    } else {
      map.set(key, {
        mode: row.mode,
        client_source: row.client_source,
        locale: row.locale,
        browser: row.browser,
        clicks: row.clicks,
        starts_ok: row.starts_ok,
        starts_err: row.starts_err,
        results_shown: row.results_shown,
        errors_shown: row.errors_shown,
        copies: row.copies,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}

function aggregateOutcomes(rows: ExtensionOutcomeRow[]): AggregatedOutcomeRow[] {
  const map = new Map<string, AggregatedOutcomeRow>();
  for (const row of rows) {
    const key = `${row.endpoint}|${row.client_source}|${row.style}|${row.locale}`;
    const existing = map.get(key);
    if (existing) {
      existing.requests += row.requests;
      existing.success += row.success;
      existing.truncated += row.truncated;
      existing.rate_limited += row.rate_limited;
      existing.upstream_error += row.upstream_error;
      existing.empty_response += row.empty_response;
    } else {
      map.set(key, {
        endpoint: row.endpoint,
        client_source: row.client_source,
        style: row.style,
        locale: row.locale,
        requests: row.requests,
        success: row.success,
        truncated: row.truncated,
        rate_limited: row.rate_limited,
        upstream_error: row.upstream_error,
        empty_response: row.empty_response,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.requests - a.requests);
}

function periodHint(days: number): string {
  if (days === 1) return "Today (UTC)";
  return `Last ${days} days`;
}

export function AnalyticsDashboard() {
  const [days, setDays] = useState(30);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [clientSourceFilter, setClientSourceFilter] = useState<ClientSourceFilter>("all");
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

  const funnelAgg = useMemo(
    () => (data ? aggregateFunnel(data.extensionFunnel) : []),
    [data],
  );
  const outcomesAgg = useMemo(
    () => (data ? aggregateOutcomes(data.extensionOutcomes) : []),
    [data],
  );

  const funnelTotals = useMemo(() => {
    if (!data) return null;
    const clicks = sumRows(data.extensionFunnel, (r) => r.clicks);
    const startsOk = sumRows(data.extensionFunnel, (r) => r.starts_ok);
    const resultsShown = sumRows(data.extensionFunnel, (r) => r.results_shown);
    const copies = sumRows(data.extensionFunnel, (r) => r.copies);
    const errorsShown = sumRows(data.extensionFunnel, (r) => r.errors_shown);
    return { clicks, startsOk, resultsShown, copies, errorsShown };
  }, [data]);

  const outcomeTotals = useMemo(() => {
    if (!data) return null;
    const requests = sumRows(data.extensionOutcomes, (r) => r.requests);
    const success = sumRows(data.extensionOutcomes, (r) => r.success);
    const truncated = sumRows(data.extensionOutcomes, (r) => r.truncated);
    const rateLimited = sumRows(data.extensionOutcomes, (r) => r.rate_limited);
    const upstreamError = sumRows(data.extensionOutcomes, (r) => r.upstream_error);
    const emptyResponse = sumRows(data.extensionOutcomes, (r) => r.empty_response);
    return { requests, success, truncated, rateLimited, upstreamError, emptyResponse };
  }, [data]);

  const clientSourcesInData = useMemo(() => {
    if (!data) return [];
    const present = new Set(data.clientsDaily.map((r) => r.client_source));
    return CLIENT_SOURCES_ORDER.filter((src) => present.has(src));
  }, [data]);

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
          {PERIOD_OPTIONS.map(({ days: d, label }) => (
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
              {label}
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
              hint={`${data.summary.uniqueActorsInPeriod} unique actor(s) · ${periodHint(data.days)}`}
            />
            <StatCard
              label="Generations / analyzes"
              value={`${data.summary.generationsInPeriod} / ${data.summary.analyzesInPeriod}`}
              hint={periodHint(data.days)}
            />
          </div>

          <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-semibold text-zinc-200">Requests by client</h2>
                <div className="flex flex-wrap gap-2">
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">Client:</span>
                <button
                  type="button"
                  onClick={() => setClientSourceFilter("all")}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    clientSourceFilter === "all"
                      ? "bg-indigo-600/80 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All clients
                </button>
                {clientSourcesInData.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setClientSourceFilter(src)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      clientSourceFilter === src
                        ? "bg-indigo-600/80 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {clientSourceLabel(src)}
                  </button>
                ))}
              </div>
            </div>
            <ClientsDailyChart
              rows={data.clientsDaily}
              kindFilter={kindFilter}
              clientSourceFilter={clientSourceFilter}
            />
          </section>

          {funnelTotals ? (
            <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
              <h2 className="mb-1 text-sm font-semibold text-zinc-200">Extension funnel</h2>
              <p className="mb-4 text-xs text-zinc-500">
                Client-side events from extension-lite: clicks → start → result → copy.
              </p>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Clicks"
                  value={funnelTotals.clicks}
                  hint={`Start rate ${pct(funnelTotals.startsOk, funnelTotals.clicks)}`}
                />
                <StatCard
                  label="Starts ok"
                  value={funnelTotals.startsOk}
                  hint={`Result rate ${pct(funnelTotals.resultsShown, funnelTotals.startsOk)}`}
                />
                <StatCard
                  label="Results shown"
                  value={funnelTotals.resultsShown}
                  hint={`Copy rate ${pct(funnelTotals.copies, funnelTotals.resultsShown)}`}
                />
                <StatCard
                  label="Copies"
                  value={funnelTotals.copies}
                  hint={`Errors shown ${funnelTotals.errorsShown}`}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                      <th className="pb-2 pr-4 font-medium">Mode</th>
                      <th className="pb-2 pr-4 font-medium">Client</th>
                      <th className="pb-2 pr-4 font-medium">Locale</th>
                      <th className="pb-2 pr-4 font-medium">Browser</th>
                      <th className="pb-2 pr-4 font-medium">Clicks</th>
                      <th className="pb-2 pr-4 font-medium">Start %</th>
                      <th className="pb-2 pr-4 font-medium">Result %</th>
                      <th className="pb-2 pr-4 font-medium">Copy %</th>
                      <th className="pb-2 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnelAgg.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-zinc-500">
                          No extension funnel data yet
                        </td>
                      </tr>
                    ) : (
                      funnelAgg.map((row) => (
                        <tr
                          key={`${row.mode}-${row.client_source}-${row.locale}-${row.browser}`}
                          className="border-b border-white/5"
                        >
                          <td className="py-2.5 pr-4 text-zinc-200">{row.mode}</td>
                          <td className="py-2.5 pr-4 text-zinc-300">
                            {clientSourceLabel(row.client_source)}
                          </td>
                          <td className="py-2.5 pr-4 text-zinc-400">{row.locale}</td>
                          <td className="py-2.5 pr-4 text-zinc-400">{row.browser}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-300">{row.clicks}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                            {pct(row.starts_ok, row.clicks)}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                            {pct(row.results_shown, row.starts_ok)}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                            {pct(row.copies, row.results_shown)}
                          </td>
                          <td className="py-2.5 tabular-nums text-zinc-400">{row.errors_shown}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {outcomeTotals ? (
            <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
              <h2 className="mb-1 text-sm font-semibold text-zinc-200">Backend outcomes</h2>
              <p className="mb-4 text-xs text-zinc-500">
                Server-side analyze/remix results: success, truncation, and error mix.
              </p>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Requests" value={outcomeTotals.requests} />
                <StatCard
                  label="Success"
                  value={outcomeTotals.success}
                  hint={pct(outcomeTotals.success, outcomeTotals.requests)}
                />
                <StatCard label="Truncated" value={outcomeTotals.truncated} />
                <StatCard label="Rate limited" value={outcomeTotals.rateLimited} />
                <StatCard
                  label="Upstream / empty"
                  value={outcomeTotals.upstreamError + outcomeTotals.emptyResponse}
                  hint={`${outcomeTotals.upstreamError} upstream · ${outcomeTotals.emptyResponse} empty`}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                      <th className="pb-2 pr-4 font-medium">Endpoint</th>
                      <th className="pb-2 pr-4 font-medium">Client</th>
                      <th className="pb-2 pr-4 font-medium">Style</th>
                      <th className="pb-2 pr-4 font-medium">Locale</th>
                      <th className="pb-2 pr-4 font-medium">Requests</th>
                      <th className="pb-2 pr-4 font-medium">Success %</th>
                      <th className="pb-2 pr-4 font-medium">Truncated</th>
                      <th className="pb-2 pr-4 font-medium">Rate limited</th>
                      <th className="pb-2 pr-4 font-medium">Upstream</th>
                      <th className="pb-2 font-medium">Empty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcomesAgg.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-6 text-center text-zinc-500">
                          No backend outcome data yet
                        </td>
                      </tr>
                    ) : (
                      outcomesAgg.map((row) => (
                        <tr
                          key={`${row.endpoint}-${row.client_source}-${row.style}-${row.locale}`}
                          className="border-b border-white/5"
                        >
                          <td className="py-2.5 pr-4 text-zinc-200">{row.endpoint}</td>
                          <td className="py-2.5 pr-4 text-zinc-300">
                            {clientSourceLabel(row.client_source)}
                          </td>
                          <td className="py-2.5 pr-4 text-zinc-400">{row.style}</td>
                          <td className="py-2.5 pr-4 text-zinc-400">{row.locale}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-300">{row.requests}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                            {pct(row.success, row.requests)}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">{row.truncated}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">{row.rate_limited}</td>
                          <td className="py-2.5 pr-4 tabular-nums text-zinc-400">{row.upstream_error}</td>
                          <td className="py-2.5 tabular-nums text-zinc-400">{row.empty_response}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

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

          <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5 sm:p-6">
            <h2 className="mb-1 text-sm font-semibold text-zinc-200">Recent analyze events</h2>
            <p className="mb-4 text-xs text-zinc-500">
              Raw API calls with outcome, error, latency, and correlation for debugging.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Endpoint</th>
                    <th className="pb-2 pr-4 font-medium">Client</th>
                    <th className="pb-2 pr-4 font-medium">Outcome</th>
                    <th className="pb-2 pr-4 font-medium">Error</th>
                    <th className="pb-2 pr-4 font-medium">Latency</th>
                    <th className="pb-2 pr-4 font-medium">Style</th>
                    <th className="pb-2 pr-4 font-medium">Allowed</th>
                    <th className="pb-2 font-medium">Correlation</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-zinc-500">
                        No analyze events yet
                      </td>
                    </tr>
                  ) : (
                    data.recentEvents.map((row, i) => (
                      <tr
                        key={`${row.created_at}-${i}`}
                        className="border-b border-white/5"
                      >
                        <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-200">{row.endpoint || "—"}</td>
                        <td className="py-2.5 pr-4 text-zinc-200">
                          {clientSourceLabel(row.client_source)}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-300">{row.outcome ?? "—"}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-zinc-500">
                          {row.error_code ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                          {row.latency_ms != null ? `${row.latency_ms}ms` : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-400">{row.style ?? "—"}</td>
                        <td className="py-2.5 pr-4 tabular-nums text-zinc-400">
                          {row.allowed ? "yes" : "no"}
                        </td>
                        <td className="py-2.5 font-mono text-xs text-zinc-500">
                          {row.correlation_id ? `${row.correlation_id.slice(0, 8)}…` : "—"}
                        </td>
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
