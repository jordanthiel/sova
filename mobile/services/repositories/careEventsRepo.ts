import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfDay, endOfDay } from 'date-fns';

export type CareEventType = 'feed' | 'diaper' | 'medication' | 'note' | 'night_wake';

export interface CareEvent {
  id: string;
  babyId: string;
  type: CareEventType;
  timestamp: string;
  note?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'care_events';

async function getAll(): Promise<CareEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAll(events: CareEvent[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

/**
 * Local repository for non-sleep care events (feed, diaper, medication, notes).
 * Uses AsyncStorage for now. Interface designed for easy migration to Supabase later.
 */
export const careEventsRepo = {
  async listByDay(babyId: string, date: Date): Promise<CareEvent[]> {
    const all = await getAll();
    const dayStart = startOfDay(date).getTime();
    const dayEnd = endOfDay(date).getTime();

    return all.filter((e) => {
      if (e.babyId !== babyId) return false;
      const ts = new Date(e.timestamp).getTime();
      return ts >= dayStart && ts <= dayEnd;
    }).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },

  async listByDateRange(babyId: string, start: Date, end: Date): Promise<CareEvent[]> {
    const all = await getAll();
    const startMs = startOfDay(start).getTime();
    const endMs = endOfDay(end).getTime();

    return all.filter((e) => {
      if (e.babyId !== babyId) return false;
      const ts = new Date(e.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    }).sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },

  async create(event: Omit<CareEvent, 'id'>): Promise<CareEvent> {
    const all = await getAll();
    const newEvent: CareEvent = {
      ...event,
      id: `care_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    all.push(newEvent);
    await saveAll(all);
    return newEvent;
  },

  async update(id: string, patch: Partial<CareEvent>): Promise<CareEvent | null> {
    const all = await getAll();
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    await saveAll(all);
    return all[idx];
  },

  async delete(id: string): Promise<void> {
    const all = await getAll();
    const filtered = all.filter((e) => e.id !== id);
    await saveAll(filtered);
  },

  async listRecent(babyId: string, limit = 20): Promise<CareEvent[]> {
    const all = await getAll();
    return all
      .filter((e) => e.babyId === babyId)
      .sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, limit);
  },
};
