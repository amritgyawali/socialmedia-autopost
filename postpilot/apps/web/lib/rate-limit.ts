interface AttemptWindow {
  attempts: number;
  resetAt: number;
}

const windows = new Map<string, AttemptWindow>();
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 8;

export function loginRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { attempts: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  existing.attempts += 1;
  if (existing.attempts > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1_000) };
  }
  return { allowed: true, retryAfter: 0 };
}

export function clearLoginRateLimit(key: string): void {
  windows.delete(key);
}
