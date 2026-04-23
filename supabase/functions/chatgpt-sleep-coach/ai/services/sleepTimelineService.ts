import type { SleepSession } from '../types/sessions.ts';
import type { TimelineEvent } from '../types/sessions.ts';
import { startOfDayInTimezone, toLocalDateKey } from '../utils/sleepMath.ts';

export function getTodaySleepTimeline(
  childId: string,
  sleepData: SleepSession[],
  dateAnchorIso: string,
  timezone: string,
): TimelineEvent[] {
  void childId;
  const dayStart = startOfDayInTimezone(dateAnchorIso, timezone).getTime();
  const key = toLocalDateKey(dateAnchorIso, timezone);
  const today = sleepData.filter((s) => new Date(s.start_time).getTime() >= dayStart);
  const events: TimelineEvent[] = [];

  for (const s of [...today].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())) {
    const sk = toLocalDateKey(s.start_time, timezone);
    if (sk !== key && new Date(s.start_time).getTime() < dayStart) continue;
    if (s.type === 'nap') {
      events.push({ kind: 'nap_start', at: s.start_time, label: 'Nap start', meta: { session: 'nap' } });
      if (s.end_time) {
        events.push({ kind: 'nap_end', at: s.end_time, label: 'Nap end', meta: { session: 'nap' } });
      }
    } else {
      events.push({ kind: 'night_start', at: s.start_time, label: 'Night sleep start', meta: { session: 'night' } });
      if (s.end_time) {
        events.push({ kind: 'night_end', at: s.end_time, label: 'Night wake / end', meta: { session: 'night' } });
      }
    }
  }
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
