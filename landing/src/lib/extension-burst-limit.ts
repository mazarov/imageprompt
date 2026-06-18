/**
 * In-memory per-process burst limit for extension POST endpoints.
 * Best-effort when multiple landing replicas run (effective limit ≈ N × perMin).
 * Enable with EXTENSION_BURST_LIMIT_ENABLED=true.
 */

const WINDOW_MS = 60_000;

type BurstBucket = {
  windowStartMs: number;
  count: number;
};

const buckets = new Map<string, BurstBucket>();

function parseBurstLimitPerMin(): number {
  const raw = parseInt(process.env.EXTENSION_BURST_LIMIT_PER_MIN ?? "10", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

export function isExtensionBurstLimitEnabled(): boolean {
  const raw = (process.env.EXTENSION_BURST_LIMIT_ENABLED ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

/** Same IP extraction as extension rate-limit (no crypto — Edge-safe). */
export function extensionBurstLimitClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export type ExtensionBurstLimitResult = {
  allowed: boolean;
  limit: number;
  count: number;
};

export function checkExtensionBurstLimit(
  ip: string,
  now = Date.now(),
): ExtensionBurstLimitResult {
  const limit = parseBurstLimitPerMin();
  const windowStartMs = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const key = `${ip}:${windowStartMs}`;

  const existing = buckets.get(key);
  if (!existing || existing.windowStartMs !== windowStartMs) {
    buckets.set(key, { windowStartMs, count: 1 });
    pruneBurstBuckets(windowStartMs);
    return { allowed: true, limit, count: 1 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { allowed: false, limit, count: existing.count };
  }

  return { allowed: true, limit, count: existing.count };
}

function pruneBurstBuckets(currentWindowStartMs: number): void {
  if (buckets.size <= 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.windowStartMs < currentWindowStartMs - WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

export function extensionBurstLimit429Body() {
  return {
    error: "rate_limited" as const,
    message: "Too many requests. Try again in a minute.",
  };
}
