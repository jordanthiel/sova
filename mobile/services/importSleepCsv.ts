import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { parseSleepCsv, type ParsedSleepRow } from '@/utils/sleepCsvImport';

const BATCH_SIZE = 50;

export interface ImportSleepCsvResult {
  imported: number;
  failed: number;
  errors: string[];
}

/**
 * Read CSV file from picker and return raw text.
 */
export async function pickAndReadCsv(): Promise<{ content: string; name: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/plain', 'application/csv'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;

  const doc = result.assets[0];
  const content = await FileSystem.readAsStringAsync(doc.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return { content, name: doc.name ?? 'export.csv' };
}

/**
 * Insert parsed sleep rows for a baby. Uses batches to avoid timeouts.
 */
export async function importSleepSessions(
  babyId: string,
  userId: string,
  rows: ParsedSleepRow[]
): Promise<ImportSleepCsvResult> {
  const errors: string[] = [];
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const inserts = batch.map((r) => ({
      baby_id: babyId,
      logged_by: userId,
      type: r.type,
      start_time: r.startTime.toISOString(),
      end_time: r.endTime.toISOString(),
      duration_minutes: r.durationMinutes,
      notes: r.notes,
    }));

    const { error } = await supabase.from('sleep_sessions').insert(inserts);

    if (error) {
      failed += batch.length;
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      imported += batch.length;
    }
  }

  return { imported, failed, errors };
}
