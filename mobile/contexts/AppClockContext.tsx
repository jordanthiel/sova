import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyAppClockFromEnvIfNeeded,
  applyAppClockPersisted,
  getAppClockPersisted,
  getAppNow,
  getAppNowMs,
  isAppClockOverridden,
  setAppClockFixed,
  setAppClockOffset,
  setAppClockSystem,
  subscribeAppClock,
  type AppClockPersisted,
} from '@/lib/appClock';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sova_app_clock_v1';

type AppClockContextValue = {
  /** Bumps when override changes; use for effect deps. */
  revision: number;
  /** Milliseconds from epoch (app clock). */
  nowMs: number;
  now: Date;
  isOverridden: boolean;
  persisted: AppClockPersisted;
  useDeviceTime: () => void;
  setFixedTime: (d: Date) => void;
  addOffsetMs: (deltaMs: number) => void;
};

const AppClockContext = createContext<AppClockContextValue | null>(null);

export function AppClockProvider({ children }: { children: React.ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const p = JSON.parse(raw) as AppClockPersisted;
          if (p && (p.mode === 'system' || p.mode === 'offset' || p.mode === 'fixed')) {
            applyAppClockPersisted({
              mode: p.mode,
              offsetMs: typeof p.offsetMs === 'number' ? p.offsetMs : 0,
              fixedAtMs: typeof p.fixedAtMs === 'number' ? p.fixedAtMs : null,
            });
          }
        } else {
          applyAppClockFromEnvIfNeeded();
        }
      } catch {
        applyAppClockFromEnvIfNeeded();
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setRevision((r) => r + 1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeAppClock(() => setRevision((r) => r + 1));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [hydrated, revision]);

  const persist = useCallback(async (p: AppClockPersisted) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* noop */
    }
  }, []);

  const useDeviceTime = useCallback(() => {
    setAppClockSystem();
    void persist(getAppClockPersisted());
  }, [persist]);

  const setFixedTime = useCallback(
    (d: Date) => {
      setAppClockFixed(d);
      void persist(getAppClockPersisted());
    },
    [persist]
  );

  const addOffsetMs = useCallback(
    (deltaMs: number) => {
      const cur = getAppClockPersisted();
      if (cur.mode === 'fixed' && cur.fixedAtMs != null) {
        setAppClockFixed(new Date(cur.fixedAtMs + deltaMs));
      } else if (cur.mode === 'offset') {
        setAppClockOffset(cur.offsetMs + deltaMs);
      } else {
        setAppClockOffset(deltaMs);
      }
      void persist(getAppClockPersisted());
    },
    [persist]
  );

  const value = useMemo(() => {
    void tick;
    const nowMs = getAppNowMs();
    return {
      revision,
      nowMs,
      now: getAppNow(),
      isOverridden: isAppClockOverridden(),
      persisted: getAppClockPersisted(),
      useDeviceTime,
      setFixedTime,
      addOffsetMs,
    };
  }, [revision, tick, useDeviceTime, setFixedTime, addOffsetMs]);

  return <AppClockContext.Provider value={value}>{children}</AppClockContext.Provider>;
}

export function useAppClock(): AppClockContextValue {
  const ctx = useContext(AppClockContext);
  if (!ctx) {
    throw new Error('useAppClock must be used within AppClockProvider');
  }
  return ctx;
}

/**
 * Re-reads app clock on an interval so UI (awake minutes, greetings) stays fresh.
 * @param intervalMs default 15s (aligned with provider tick; fine for most screens)
 */
export function useAppNow(intervalMs = 15_000): Date {
  const { revision } = useAppClock();
  const [now, setNow] = useState(() => getAppNow());

  useEffect(() => {
    setNow(getAppNow());
  }, [revision]);

  useEffect(() => {
    const id = setInterval(() => setNow(getAppNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, revision]);

  return now;
}
