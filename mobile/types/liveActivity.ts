/**
 * Domain state for the Nap Live Activity.
 * Maps to expo-live-activity's LiveActivityState (title, subtitle, progressBar).
 */

export type NapLiveActivityMode = 'awake' | 'sleeping';

export interface NapLiveActivityStateAwake {
  mode: 'awake';
  windowStartIso: string;
  windowEndIso: string;
  isBedtime: boolean;
  babyName?: string;
  /** When set, detail line shows "Cap by {time}" instead of the window. */
  capAtIso?: string | null;
}

export interface NapLiveActivityStateSleeping {
  mode: 'sleeping';
  sessionStartIso: string;
  sessionType: 'nap' | 'night';
  capAtIso: string | null;
  babyName?: string;
}

export type NapLiveActivityState =
  | NapLiveActivityStateAwake
  | NapLiveActivityStateSleeping;
