/**
 * Persist which days (dateKey yyyy-MM-dd) the user has marked as excluded from
 * wake window and LLM recommendations (e.g. anomaly or travel).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@sova/excluded_days_';

export async function getExcludedDateKeys(babyId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${babyId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function setExcludedDateKeys(babyId: string, dateKeys: string[]): Promise<void> {
  await AsyncStorage.setItem(`${KEY_PREFIX}${babyId}`, JSON.stringify(dateKeys));
}

export async function toggleDayExcluded(babyId: string, dateKey: string): Promise<boolean> {
  const current = await getExcludedDateKeys(babyId);
  const set = new Set(current);
  let excluded: boolean;
  if (set.has(dateKey)) {
    set.delete(dateKey);
    excluded = false;
  } else {
    set.add(dateKey);
    excluded = true;
  }
  await setExcludedDateKeys(babyId, Array.from(set));
  return excluded;
}

export async function isDayExcluded(babyId: string, dateKey: string): Promise<boolean> {
  const keys = await getExcludedDateKeys(babyId);
  return keys.includes(dateKey);
}

export const excludedDaysRepo = {
  getExcludedDateKeys,
  setExcludedDateKeys,
  toggleDayExcluded,
  isDayExcluded,
};
