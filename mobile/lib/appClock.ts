/**
 * App-wide "current time" for UI, recommendations, and day boundaries.
 * Use real `Date` / `Date.now()` for server writes, subscription expiry, and OS notification scheduling.
 */

export type AppClockMode = 'system' | 'offset' | 'fixed';

export interface AppClockPersisted {
  mode: AppClockMode;
  offsetMs: number;
  fixedAtMs: number | null;
}

type Listener = () => void;

let mode: AppClockMode = 'system';
let offsetMs = 0;
let fixedAtMs: number | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

export function getAppNowMs(): number {
  if (mode === 'fixed' && fixedAtMs != null) return fixedAtMs;
  if (mode === 'offset') return Date.now() + offsetMs;
  return Date.now();
}

export function getAppNow(): Date {
  return new Date(getAppNowMs());
}

export function isAppClockOverridden(): boolean {
  return mode !== 'system';
}

export function getAppClockPersisted(): AppClockPersisted {
  return { mode, offsetMs, fixedAtMs };
}

export function applyAppClockPersisted(next: AppClockPersisted): void {
  mode = next.mode;
  offsetMs = Number.isFinite(next.offsetMs) ? next.offsetMs : 0;
  fixedAtMs = typeof next.fixedAtMs === 'number' && Number.isFinite(next.fixedAtMs) ? next.fixedAtMs : null;
  if (mode === 'system') {
    offsetMs = 0;
    fixedAtMs = null;
  }
  if (mode === 'fixed' && fixedAtMs == null) mode = 'system';
  if (mode === 'offset' && offsetMs === 0) mode = 'system';
  emit();
}

export function setAppClockSystem(): void {
  mode = 'system';
  offsetMs = 0;
  fixedAtMs = null;
  emit();
}

/** Shift simulated time relative to the device clock (still advances in real time). */
export function setAppClockOffset(nextOffsetMs: number): void {
  if (!Number.isFinite(nextOffsetMs) || nextOffsetMs === 0) {
    setAppClockSystem();
    return;
  }
  mode = 'offset';
  offsetMs = nextOffsetMs;
  fixedAtMs = null;
  emit();
}

/** Freeze simulated time at an absolute instant (local interpretation via Date). */
export function setAppClockFixed(at: Date): void {
  const t = at.getTime();
  if (!Number.isFinite(t)) return;
  mode = 'fixed';
  offsetMs = 0;
  fixedAtMs = t;
  emit();
}

export function subscribeAppClock(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** When no saved override exists, apply ISO 8601 from env (dev / QA). */
export function applyAppClockFromEnvIfNeeded(): void {
  const iso = process.env.EXPO_PUBLIC_APP_CLOCK_ISO;
  if (typeof iso !== 'string' || !iso.trim()) return;
  const t = Date.parse(iso.trim());
  if (Number.isNaN(t)) return;
  setAppClockFixed(new Date(t));
}
