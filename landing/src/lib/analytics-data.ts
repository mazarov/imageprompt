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

export type AnalyticsDashboardData = {
  days: number;
  summary: {
    totalUsers: number;
    activeUsers30d: number;
    requestsInPeriod: number;
    generationsInPeriod: number;
    analyzesInPeriod: number;
  };
  clientsDaily: ClientsDailyRow[];
  topUsers: TopUserRow[];
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

  return {
    days,
    summary: {
      totalUsers: totalUsersRes.count ?? 0,
      activeUsers30d: activeUsersRes.count ?? 0,
      requestsInPeriod,
      generationsInPeriod,
      analyzesInPeriod,
    },
    clientsDaily,
    topUsers: (topUsersRes.data || []).map((row) => ({
      email: row.email ?? null,
      total_requests: Number(row.total_requests ?? 0) || 0,
      generations: Number(row.generations ?? 0) || 0,
      analyzes: Number(row.analyzes ?? 0) || 0,
      last_seen: row.last_seen ?? null,
    })),
  };
}
