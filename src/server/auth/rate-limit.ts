import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-process memory only — the app runs as a single container/instance (see
 * docker-compose.yml, no Redis or similar in the stack), so this is enough and doesn't
 * add a dependency just for this. Limits reset on container restart, an acceptable
 * trade-off for a self-hosted app with a handful of users.
 */
const buckets = new Map<string, Bucket>();

// Without cleanup, the map would grow over time in a long-running process (a new key
// per login attempt, including a stranger's/attacker's) — periodically discard expired
// entries.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Fixed-window rate limiter. Returns `true` if the attempt is within the limit (and
 * counts it), `false` if the key is already over the limit in the current window.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

/** Discard the counter for a given key after a successful login. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
