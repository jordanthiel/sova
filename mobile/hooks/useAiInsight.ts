import { useState, useCallback, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAppNow, getAppNowMs } from '@/lib/appClock';
import { supabase } from '@/lib/supabase';
import { getPremiumAccessErrorFromResponse } from '@/services/subscription';

type Mode = 'next_sleep' | 'nap_evaluation' | 'micro_insight' | 'daily_schedule' | 'forecast' | 'insights_bundle';

interface UseAiInsightOptions {
  /** Cache TTL in milliseconds. Default: 10 minutes */
  cacheTtlMs?: number;
  /** Appended to storage key so different states (e.g. active sleep) don't share cache */
  cacheKeySuffix?: string;
}

interface AiInsightResult<T = Record<string, unknown>> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetch: (params: Record<string, unknown>) => Promise<T | null>;
  clearCache: () => Promise<void>;
}

const CACHE_PREFIX = 'ai_insight_';

export function useAiInsight<T = Record<string, unknown>>(
  mode: Mode,
  babyId: string | null,
  options: UseAiInsightOptions = {}
): AiInsightResult<T> {
  const { cacheTtlMs = 10 * 60 * 1000, cacheKeySuffix = '' } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const suffixPart = cacheKeySuffix ? `_${cacheKeySuffix.replace(/[^a-zA-Z0-9._-]/g, '_')}` : '';
  const cacheKey = `${CACHE_PREFIX}${mode}_${babyId}${suffixPart}`;

  // Clear state when baby (or mode) changes so we don't show previous baby's data
  useEffect(() => {
    setData(null);
    setError(null);
  }, [babyId, mode, suffixPart]);

  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(cacheKey);
    } catch { /* noop */ }
  }, [cacheKey]);

  const fetchInsight = useCallback(
    async (params: Record<string, unknown>): Promise<T | null> => {
      if (!babyId || inflightRef.current) return null;

      // Check cache first
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { data: cachedData, ts } = JSON.parse(cached);
          if (getAppNowMs() - ts < cacheTtlMs) {
            setData(cachedData);
            return cachedData;
          }
        }
      } catch { /* cache miss, proceed */ }

      inflightRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54421';
        const res = await fetch(`${supabaseUrl}/functions/v1/chatgpt-sleep-coach`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            baby_id: babyId,
            mode,
            current_time: getAppNow().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            ...params,
          }),
        });

        if (!res.ok) {
          const premiumError = await getPremiumAccessErrorFromResponse(res, 'insights');
          if (premiumError) throw premiumError;
          const errBody = await res.json().catch(() => ({}));
          throw new Error((errBody as any).error || `Request failed (${res.status})`);
        }

        const result = (await res.json()) as T;
        setData(result);

        // Write to cache
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: result, ts: getAppNowMs() }));
        } catch { /* cache write failure is non-critical */ }

        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to get AI insight');
        console.error(`[useAiInsight/${mode}]`, err);
        return null;
      } finally {
        setLoading(false);
        inflightRef.current = false;
      }
    },
    [babyId, mode, cacheKey, cacheTtlMs]
  );

  return { data, loading, error, fetch: fetchInsight, clearCache };
}
