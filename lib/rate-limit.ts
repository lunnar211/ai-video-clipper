const buckets = new Map<string, number[]>();

/**
 * In-memory per-IP rate limiter (same pattern as the sister sites).
 * `limit` requests per `windowMs`. Returns true when the request is
 * allowed. `now` is injectable for tests.
 */
export function checkRateLimit(
  ip: string,
  limit = 5,
  windowMs = 60_000,
  now = Date.now(),
): boolean {
  const prev = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (prev.length >= limit) {
    buckets.set(ip, prev);
    return false;
  }
  prev.push(now);
  buckets.set(ip, prev);
  return true;
}

/** Test helper: forget all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Best-effort client IP from proxy headers. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
