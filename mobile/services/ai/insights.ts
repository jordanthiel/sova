import type { SleepEvent, Insight, AISuggestion } from '@/types/domain';
import { formatDuration } from '@/utils/formatTime';
import { careEventsRepo } from '@/services/repositories/careEventsRepo';

// TODO: Replace with real AI-generated insights

export function generateInsights(
  babyId: string,
  events: SleepEvent[]
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  const last7Days = events.filter((e) => {
    const diff = now.getTime() - new Date(e.start).getTime();
    return diff < 7 * 24 * 60 * 60 * 1000 && e.end != null;
  });

  const naps = last7Days.filter((e) => e.type === 'nap');
  const nights = last7Days.filter((e) => e.type === 'night');

  if (naps.length >= 3) {
    const avgNap = Math.round(
      naps.reduce((s, e) => s + (e.durationMinutes || 0), 0) / naps.length
    );
    const lengths = naps.map((e) => e.durationMinutes || 0);
    const variance =
      lengths.reduce((s, l) => s + Math.pow(l - avgNap, 2), 0) / lengths.length;
    const stdDev = Math.round(Math.sqrt(variance));

    insights.push({
      id: `insight_nap_pattern_${Date.now()}`,
      babyId,
      createdAt: now.toISOString(),
      title: 'Nap Length Pattern',
      description:
        stdDev < 15
          ? `Naps are very consistent, averaging ${formatDuration(avgNap)}. Great routine!`
          : `Nap lengths vary (avg ${formatDuration(avgNap)}, ±${stdDev}min). This is normal but a more consistent routine may help.`,
      metricRefs: ['avg_nap_length', 'nap_consistency'],
    });
  }

  if (nights.length >= 3) {
    const bedtimes = nights.map((e) => {
      const d = new Date(e.start);
      return d.getHours() * 60 + d.getMinutes();
    });
    const avgBedtimeMin = Math.round(
      bedtimes.reduce((s, t) => s + t, 0) / bedtimes.length
    );
    const bedtimeVariance =
      bedtimes.reduce((s, t) => s + Math.pow(t - avgBedtimeMin, 2), 0) /
      bedtimes.length;
    const bedtimeStdDev = Math.round(Math.sqrt(bedtimeVariance));

    const avgHour = Math.floor(avgBedtimeMin / 60);
    const avgMin = avgBedtimeMin % 60;
    const formattedBedtime = `${avgHour > 12 ? avgHour - 12 : avgHour}:${String(avgMin).padStart(2, '0')} ${avgHour >= 12 ? 'PM' : 'AM'}`;

    insights.push({
      id: `insight_bedtime_consistency_${Date.now()}`,
      babyId,
      createdAt: now.toISOString(),
      title: 'Bedtime Consistency',
      description:
        bedtimeStdDev < 30
          ? `Average bedtime is ${formattedBedtime} with good consistency. Keep it up!`
          : `Bedtime varies by about ${bedtimeStdDev} minutes around ${formattedBedtime}. A more consistent bedtime often improves sleep quality.`,
      metricRefs: ['bedtime_consistency', 'avg_bedtime'],
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: `insight_getting_started_${Date.now()}`,
      babyId,
      createdAt: now.toISOString(),
      title: 'Building Your Sleep Profile',
      description:
        'Keep logging sleep events! After a few days of data, I\'ll start surfacing patterns and personalized insights.',
    });
  }

  return insights;
}

export function computeMetrics(events: SleepEvent[]): {
  avgMorningWakeWindow: number;
  avgMiddayWakeWindow: number;
  avgEveningWakeWindow: number;
  avgNapLengthByNumber: number[];
  nightSleepTotal: number;
  nightWakes: number;
} {
  const naps = events
    .filter((e) => e.type === 'nap' && e.end != null)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const nights = events.filter((e) => e.type === 'night' && e.end != null);

  const napsByDay = new Map<string, SleepEvent[]>();
  naps.forEach((n) => {
    const key = new Date(n.start).toDateString();
    if (!napsByDay.has(key)) napsByDay.set(key, []);
    napsByDay.get(key)!.push(n);
  });

  const wakeWindows: { morning: number[]; midday: number[]; evening: number[] } = {
    morning: [],
    midday: [],
    evening: [],
  };

  napsByDay.forEach((dayNaps) => {
    dayNaps.forEach((nap) => {
      const hour = new Date(nap.start).getHours();
      if (hour < 11) wakeWindows.morning.push(nap.durationMinutes || 0);
      else if (hour < 15) wakeWindows.midday.push(nap.durationMinutes || 0);
      else wakeWindows.evening.push(nap.durationMinutes || 0);
    });
  });

  const avg = (arr: number[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

  const napLengthsByNumber: number[][] = [];
  napsByDay.forEach((dayNaps) => {
    dayNaps.forEach((nap, idx) => {
      if (!napLengthsByNumber[idx]) napLengthsByNumber[idx] = [];
      napLengthsByNumber[idx].push(nap.durationMinutes || 0);
    });
  });

  const nightTotal = nights.reduce((s, n) => s + (n.durationMinutes || 0), 0);

  return {
    avgMorningWakeWindow: avg(wakeWindows.morning),
    avgMiddayWakeWindow: avg(wakeWindows.midday),
    avgEveningWakeWindow: avg(wakeWindows.evening),
    avgNapLengthByNumber: napLengthsByNumber.map(avg),
    nightSleepTotal: nights.length > 0 ? Math.round(nightTotal / nights.length) : 0,
    nightWakes: 0,
  };
}

/**
 * Enhanced metrics computation that includes night wake data from care events.
 */
export async function computeMetricsWithWakes(
  babyId: string,
  events: SleepEvent[]
): Promise<ReturnType<typeof computeMetrics>> {
  const base = computeMetrics(events);
  try {
    const recentCareEvents = await careEventsRepo.listRecent(babyId, 100);
    const nightWakes = recentCareEvents.filter((e) => e.type === 'night_wake');
    const last7Days = nightWakes.filter((e) => {
      const diff = Date.now() - new Date(e.timestamp).getTime();
      return diff < 7 * 24 * 60 * 60 * 1000;
    });
    const nights = events.filter(
      (e) => e.type === 'night' && e.end != null
    );
    const avgWakes = nights.length > 0
      ? Math.round(last7Days.length / Math.max(nights.length, 1))
      : last7Days.length;
    return { ...base, nightWakes: avgWakes };
  } catch {
    return base;
  }
}

export function generateSuggestions(
  babyId: string,
  events: SleepEvent[]
): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  const metrics = computeMetrics(events);

  if (metrics.avgEveningWakeWindow > 0 && metrics.avgEveningWakeWindow > 180) {
    suggestions.push({
      id: `sug_shorten_evening_ww_${Date.now()}`,
      title: 'Shorten evening wake window',
      description:
        'Try shortening the last wake window by 10–15 minutes. This often helps with bedtime resistance and night wakes.',
      actionLabel: 'Apply Suggestion',
      preferenceKey: 'preferEarlierBedtime',
      preferenceValue: true,
    });
  }

  if (
    metrics.avgNapLengthByNumber.length >= 3 &&
    metrics.avgNapLengthByNumber[2] < 30
  ) {
    suggestions.push({
      id: `sug_drop_third_nap_${Date.now()}`,
      title: 'Consider dropping the third nap',
      description:
        'The third nap is consistently short. This may be a sign your baby is ready to transition to 2 naps.',
      actionLabel: 'Learn More',
    });
  }

  if (metrics.avgNapLengthByNumber.length > 0 && metrics.avgNapLengthByNumber[0] < 40) {
    suggestions.push({
      id: `sug_extend_first_nap_${Date.now()}`,
      title: 'Try extending the first nap',
      description:
        'The first nap is averaging under 40 minutes. Slightly extending the morning wake window by 10 minutes may help.',
      actionLabel: 'Apply Suggestion',
      preferenceKey: 'preferLongerNaps',
      preferenceValue: true,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: `sug_keep_going_${Date.now()}`,
      title: 'Looking good!',
      description:
        'Sleep patterns look healthy. Keep logging consistently and I\'ll surface actionable suggestions as patterns emerge.',
      actionLabel: 'Got it',
    });
  }

  return suggestions;
}
