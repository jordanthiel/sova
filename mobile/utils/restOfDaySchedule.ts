import type { RestOfDayScheduleEvent } from '@/types/domain';
import { formatDuration, roundTimeStringToNearest5 } from '@/utils/formatTime';

export type ParsedRestOfDayRow =
  | {
      kind: 'nap';
      key: string;
      napLabel: string;
      timeRange: string;
      capLabel?: string;
    }
  | {
      kind: 'bedtime';
      key: string;
      time: string;
    };

/** Parse server events into rows for schedule UI (nap windows + bedtime). */
export function parseRestOfDaySchedule(
  events: RestOfDayScheduleEvent[],
  napsCompletedToday: number,
  refDate: Date
): ParsedRestOfDayRow[] {
  const rows: ParsedRestOfDayRow[] = [];
  let napNum = 1 + napsCompletedToday;
  let i = 0;
  while (i < events.length) {
    const evt = events[i];
    if (evt.event === 'nap_start') {
      const next = events[i + 1];
      const startStr = roundTimeStringToNearest5(evt.time, refDate);
      let timeRange: string;
      if (next?.event === 'nap_end') {
        const endStr = roundTimeStringToNearest5(next.time, refDate);
        timeRange = `${startStr} – ${endStr}`;
        i += 2;
      } else {
        timeRange = startStr;
        i += 1;
      }
      const capLabel =
        evt.cap_minutes != null && evt.cap_minutes > 0
          ? `Cap ${formatDuration(evt.cap_minutes)}`
          : undefined;
      rows.push({
        kind: 'nap',
        key: `nap-${napNum}-${startStr}`,
        napLabel: `Nap ${napNum}`,
        timeRange,
        capLabel,
      });
      napNum += 1;
    } else if (evt.event === 'bedtime') {
      rows.push({
        kind: 'bedtime',
        key: `bedtime-${evt.time}`,
        time: roundTimeStringToNearest5(evt.time, refDate),
      });
      i += 1;
    } else {
      i += 1;
    }
  }
  return rows;
}
