import { createSupabaseServer } from "@/lib/supabase";

export type ClientsDailyRow = {
  day: string;
  client_source: string;
  kind: string;
  requests: number;
  unique_actors: number;
};

export type TopUserRow = {
  email: string | null;
  total_requests: number;
  generations: number;
  analyzes: number;
  last_seen: string | null;
};

export type ExtensionFunnelRow = {
  day: string;
  mode: string;
  client_source: string;
  locale: string;
  platform: string;
  browser: string;
  clicks: number;
  starts_ok: number;
  starts_err: number;
  results_shown: number;
  errors_shown: number;
  copies: number;
  unique_users_clicked: number;
};

export type ExtensionOutcomeRow = {
  day: string;
  endpoint: string;
  client_source: string;
  locale: string;
  style: string;
  requests: number;
  success: number;
  truncated: number;
  rate_limited: number;
  upstream_error: number;
  empty_response: number;
  unique_actors: number;
};

export type RecentEventRow = {
  created_at: string;
  endpoint: string;
  client_source: string;
  request_origin: string | null;
  allowed: boolean;
  user_id: string | null;
  outcome: string | null;
  error_code: string | null;
  latency_ms: number | null;
  style: string | null;
  correlation_id: string | null;
};

export type AnalyticsDashboardData = {
  days: number;
  summary: {
    totalUsers: number;
    activeUsers30d: number;
    requestsInPeriod: number;
    uniqueActorsInPeriod: number;
    generationsInPeriod: number;
    analyzesInPeriod: number;
  };
  clientsDaily: ClientsDailyRow[];
  topUsers: TopUserRow[];
  recentEvents: RecentEventRow[];
  extensionFunnel: ExtensionFunnelRow[];
  extensionOutcomes: ExtensionOutcomeRow[];
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function thirtyDaysAgoIso(): string {
  return daysAgoIso(30);
}

export async function fetchAnalyticsDashboard(days: number): Promise<AnalyticsDashboardData> {
  const supabase = createSupabaseServer();
  const sinceDay = daysAgoIso(days);
  const since30d = thirtyDaysAgoIso();

  const [
    totalUsersRes,
    activeUsersRes,
    clientsDailyRes,
    topUsersRes,
    recentEventsRes,
    actorRowsRes,
    extensionFunnelRes,
    extensionOutcomesRes,
  ] = await Promise.all([
    supabase.from("imageprompt_users").select("id", { count: "exact", head: true }),
    supabase
      .from("analytics_user_activity")
      .select("user_id", { count: "exact", head: true })
      .gte("last_seen", since30d)
      .gt("total_requests", 0),
    supabase
      .from("analytics_clients_daily")
      .select("day, client_source, kind, requests, unique_actors")
      .gte("day", sinceDay)
      .order("day", { ascending: true }),
    supabase
      .from("analytics_user_activity")
      .select("email, total_requests, generations, analyzes, last_seen")
      .gt("total_requests", 0)
      .order("total_requests", { ascending: false })
      .limit(50),
    supabase
      .from("extension_analyze_events")
      .select(
        "created_at, endpoint, client_source, request_origin, allowed, user_id, outcome, error_code, latency_ms, style, correlation_id",
      )
      .gte("created_at", sinceDay)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("analytics_requests")
      .select("user_id, ip_hash")
      .gte("event_time", sinceDay)
      .eq("allowed", true),
    supabase
      .from("analytics_extension_funnel")
      .select(
        "day, mode, client_source, locale, platform, browser, clicks, starts_ok, starts_err, results_shown, errors_shown, copies, unique_users_clicked",
      )
      .gte("day", sinceDay)
      .order("day", { ascending: true }),
    supabase
      .from("analytics_extension_outcomes_daily")
      .select(
        "day, endpoint, client_source, locale, style, requests, success, truncated, rate_limited, upstream_error, empty_response, unique_actors",
      )
      .gte("day", sinceDay)
      .order("day", { ascending: true }),
  ]);

  if (totalUsersRes.error) {
    throw new Error(`imageprompt_users: ${totalUsersRes.error.message}`);
  }
  if (activeUsersRes.error) {
    throw new Error(`analytics_user_activity: ${activeUsersRes.error.message}`);
  }
  if (clientsDailyRes.error) {
    throw new Error(`analytics_clients_daily: ${clientsDailyRes.error.message}`);
  }
  if (topUsersRes.error) {
    throw new Error(`analytics_user_activity list: ${topUsersRes.error.message}`);
  }
  if (recentEventsRes.error) {
    throw new Error(`extension_analyze_events: ${recentEventsRes.error.message}`);
  }
  if (actorRowsRes.error) {
    throw new Error(`analytics_requests actors: ${actorRowsRes.error.message}`);
  }
  if (extensionFunnelRes.error) {
    throw new Error(`analytics_extension_funnel: ${extensionFunnelRes.error.message}`);
  }
  if (extensionOutcomesRes.error) {
    throw new Error(`analytics_extension_outcomes_daily: ${extensionOutcomesRes.error.message}`);
  }

  const clientsDaily: ClientsDailyRow[] = (clientsDailyRes.data || []).map((row) => ({
    day: String(row.day),
    client_source: String(row.client_source ?? "unknown"),
    kind: String(row.kind ?? ""),
    requests: Number(row.requests ?? 0) || 0,
    unique_actors: Number(row.unique_actors ?? 0) || 0,
  }));

  let requestsInPeriod = 0;
  let generationsInPeriod = 0;
  let analyzesInPeriod = 0;
  for (const row of clientsDaily) {
    requestsInPeriod += row.requests;
    if (row.kind === "generation") generationsInPeriod += row.requests;
    else if (row.kind === "analyze") analyzesInPeriod += row.requests;
  }

  const uniqueActorsInPeriod = new Set(
    (actorRowsRes.data || [])
      .map((row) => row.user_id ?? row.ip_hash)
      .filter((key): key is string => Boolean(key)),
  ).size;

  return {
    days,
    summary: {
      totalUsers: totalUsersRes.count ?? 0,
      activeUsers30d: activeUsersRes.count ?? 0,
      requestsInPeriod,
      uniqueActorsInPeriod,
      generationsInPeriod,
      analyzesInPeriod,
    },
    clientsDaily,
    extensionFunnel: (extensionFunnelRes.data || []).map((row) => ({
      day: String(row.day),
      mode: String(row.mode ?? "unknown"),
      client_source: String(row.client_source ?? "unknown"),
      locale: String(row.locale ?? "unknown"),
      platform: String(row.platform ?? "unknown"),
      browser: String(row.browser ?? "unknown"),
      clicks: Number(row.clicks ?? 0) || 0,
      starts_ok: Number(row.starts_ok ?? 0) || 0,
      starts_err: Number(row.starts_err ?? 0) || 0,
      results_shown: Number(row.results_shown ?? 0) || 0,
      errors_shown: Number(row.errors_shown ?? 0) || 0,
      copies: Number(row.copies ?? 0) || 0,
      unique_users_clicked: Number(row.unique_users_clicked ?? 0) || 0,
    })),
    extensionOutcomes: (extensionOutcomesRes.data || []).map((row) => ({
      day: String(row.day),
      endpoint: String(row.endpoint ?? ""),
      client_source: String(row.client_source ?? "unknown"),
      locale: String(row.locale ?? "unknown"),
      style: String(row.style ?? "unknown"),
      requests: Number(row.requests ?? 0) || 0,
      success: Number(row.success ?? 0) || 0,
      truncated: Number(row.truncated ?? 0) || 0,
      rate_limited: Number(row.rate_limited ?? 0) || 0,
      upstream_error: Number(row.upstream_error ?? 0) || 0,
      empty_response: Number(row.empty_response ?? 0) || 0,
      unique_actors: Number(row.unique_actors ?? 0) || 0,
    })),
    recentEvents: (recentEventsRes.data || []).map((row) => ({
      created_at: String(row.created_at ?? ""),
      endpoint: String(row.endpoint ?? ""),
      client_source: String(row.client_source ?? "unknown"),
      request_origin: row.request_origin ?? null,
      allowed: row.allowed === true,
      user_id: row.user_id ?? null,
      outcome: row.outcome ?? null,
      error_code: row.error_code ?? null,
      latency_ms: row.latency_ms != null ? Number(row.latency_ms) : null,
      style: row.style ?? null,
      correlation_id: row.correlation_id ?? null,
    })),
    topUsers: (topUsersRes.data || []).map((row) => ({
      email: row.email ?? null,
      total_requests: Number(row.total_requests ?? 0) || 0,
      generations: Number(row.generations ?? 0) || 0,
      analyzes: Number(row.analyzes ?? 0) || 0,
      last_seen: row.last_seen ?? null,
    })),
  };
}
