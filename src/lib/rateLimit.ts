/**
 * In-memory per-caller rate limit and duplicate suppression.
 *
 * Deliberately simple and single-instance: state lives in module variables.
 * In a multi-instance or (cold-starting) serverless deploy this would leak
 * limits across workers — swap the maps for a shared store (e.g. Redis) behind
 * the same `guardSend` interface and behaviour stays identical.
 */

const RATE_WINDOW_MS = 60_000 // 1 minute
const RATE_MAX_PER_WINDOW = 5 // at most 5 sends per window per caller
const DEDUP_WINDOW_MS = 30_000 // 30 s

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: 'rate-limited' | 'duplicate'; message: string; retryAfterSec: number }

// ip -> timestamps of recent allowed sends (rate limit)
const sentAt = new Map<string, number[]>()
// dedupKey -> timestamp of last identical send (duplicate suppression)
const lastByKey = new Map<string, number>()

function prune(now: number): void {
  for (const [ip, times] of sentAt) {
    const kept = times.filter((t) => now - t < RATE_WINDOW_MS)
    if (kept.length === 0) sentAt.delete(ip)
    else sentAt.set(ip, kept)
  }
}

function dedupPrune(now: number): void {
  for (const [key, at] of lastByKey) {
    if (now - at >= DEDUP_WINDOW_MS) lastByKey.delete(key)
  }
}

/**
 * Decide whether a send may proceed. On allow it also records the event so the
 * next call can rate-limit / dedupe against it.
 *
 * @param ip   caller identifier (usually the remote IP)
 * @param key  content fingerprint of this specific message
 *
 * @throws nothing — returns a GuardResult the caller maps to an error message.
 */
export function guardSend(ip: string, key: string): GuardResult {
  const now = Date.now()
  prune(now)
  dedupPrune(now)

  // 1. Rate limit.
  const times = sentAt.get(ip) ?? []
  if (times.length >= RATE_MAX_PER_WINDOW) {
    const oldest = times[0]
    const retryAfterSec = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000))
    return {
      ok: false,
      reason: 'rate-limited',
      retryAfterSec,
      message: `För många meddelanden. Försök igen om ${retryAfterSec}s.`,
    }
  }

  // 2. Duplicate suppression — same content from the same caller within window.
  const last = lastByKey.get(key)
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
    const retryAfterSec = Math.max(1, Math.ceil((DEDUP_WINDOW_MS - (now - last)) / 1000))
    return {
      ok: false,
      reason: 'duplicate',
      retryAfterSec,
      message: `Du skickade redan liknande för ${Math.max(1, Math.ceil((now - last) / 1000))}s sedan.`,
    }
  }

  // 3. Allow and record the event.
  times.push(now)
  sentAt.set(ip, times)
  lastByKey.set(key, now)
  return { ok: true }
}
