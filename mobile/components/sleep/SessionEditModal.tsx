import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme-color';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { format, differenceInMinutes } from 'date-fns';
import { formatDuration } from '@/utils/formatTime';
import type { Database } from '@/lib/supabase';
import type { Caregiver } from '@/types/domain';
import { Avatar } from '@/components/ui/Avatar';

type SleepSession = Database['public']['Tables']['sleep_sessions']['Row'];

export type SessionUpdates = {
  start_time: string;
  end_time: string;
  notes?: string;
  duration_minutes: number;
  logged_by?: string;
};

interface SessionEditModalProps {
  visible: boolean;
  session: SleepSession | null;
  caregivers: Caregiver[];
  onClose: () => void;
  onSave: (sessionId: string, updates: SessionUpdates) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionEditModal({ visible, session, caregivers, onClose, onSave, onDelete }: SessionEditModalProps) {
  const colors = useThemeColors();
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [selectedLoggedBy, setSelectedLoggedBy] = useState<string | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'start' | 'end'>('start');
  const lastSessionId = useRef<string | null>(null);

  // Reset form when session changes — tracked by session ID
  useEffect(() => {
    if (visible && session && session.id !== lastSessionId.current) {
      lastSessionId.current = session.id;
      setStartTime(new Date(session.start_time));
      setEndTime(session.end_time ? new Date(session.end_time) : new Date());
      setNotes(session.notes || '');
      setSelectedLoggedBy(session.logged_by);
      setShowStartPicker(false);
      setShowEndPicker(false);
    }
    if (!visible) {
      lastSessionId.current = null;
    }
  }, [visible, session]);

  if (!session) return null;

  const isNap = session.type === 'nap';
  const durationMins = differenceInMinutes(endTime, startTime);

  const handleSave = () => {
    if (endTime <= startTime) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updates: SessionUpdates = {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: notes.trim() || undefined,
      duration_minutes: durationMins,
    };
    if (selectedLoggedBy != null) updates.logged_by = selectedLoggedBy;
    onSave(session.id, updates);
  };

  const handleDelete = () => {
    Alert.alert('Delete Session', 'Are you sure you want to delete this sleep session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          onDelete(session.id);
        },
      },
    ]);
  };

  const onTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      setShowEndPicker(false);
    }
    if (selectedDate) {
      if (pickerMode === 'start') setStartTime(selectedDate);
      else setEndTime(selectedDate);
    }
  };

  const showPicker = showStartPicker || showEndPicker;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[styles.sheet, { backgroundColor: '#132140', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' }, Shadows.lg]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <IconSymbol name={isNap ? 'sun.max.fill' : 'moon.fill'} size={40} color={colors.text} />
              <Text style={[Typography.h2, { color: colors.text }]}>
                Edit {isNap ? 'Nap' : 'Night Sleep'}
              </Text>
              <Badge
                label={formatDuration(durationMins)}
                backgroundColor={isNap ? colors.napColorSoft : colors.nightColorSoft}
                color={isNap ? colors.napColor : colors.nightColor}
                size="md"
              />
            </View>

            {/* Time fields */}
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={[styles.timeField, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => {
                  setPickerMode('start');
                  setShowStartPicker(true);
                  setShowEndPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>Start</Text>
                <Text style={[Typography.h3, { color: colors.text }]}>{format(startTime, 'h:mm a')}</Text>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>{format(startTime, 'MMM d')}</Text>
              </TouchableOpacity>

              <Text style={[Typography.body, { color: colors.textTertiary }]}>→</Text>

              <TouchableOpacity
                style={[styles.timeField, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => {
                  setPickerMode('end');
                  setShowEndPicker(true);
                  setShowStartPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>End</Text>
                <Text style={[Typography.h3, { color: colors.text }]}>{format(endTime, 'h:mm a')}</Text>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>{format(endTime, 'MMM d')}</Text>
              </TouchableOpacity>
            </View>

            {/* Inline picker */}
            {showPicker && (
              <View style={[styles.pickerContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <DateTimePicker
                  value={pickerMode === 'start' ? startTime : endTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    onPress={() => { setShowStartPicker(false); setShowEndPicker(false); }}
                    style={[styles.doneBtn, { backgroundColor: colors.accent }]}
                  >
                    <Text style={[Typography.buttonSmall, { color: '#FFFFFF' }]}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Logged by */}
            {caregivers.length > 0 && (
              <View style={styles.loggedBySection}>
                <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                  Who did this?
                </Text>
                <View style={styles.caregiverRow}>
                  {caregivers.map((c) => {
                    const selected = selectedLoggedBy === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setSelectedLoggedBy(c.id)}
                        style={[
                          styles.caregiverChip,
                          { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.background },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Avatar name={c.name} size={32} />
                        <Text style={[Typography.caption, { color: colors.text, marginTop: 4 }]} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Notes */}
            <View style={styles.notesSection}>
              <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.xs }]}>
                Notes (optional)
              </Text>
              <TextInput
                style={[
                  styles.notesInput,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                ]}
                value={notes}
                onChangeText={setNotes}
                placeholder="How did baby sleep? Any issues?"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={200}
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Button title="Save Changes" onPress={handleSave} fullWidth />
              <Button title="Delete Session" onPress={handleDelete} variant="danger" fullWidth style={{ marginTop: Spacing.sm }} />
            </View>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  timeField: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 2,
  },
  pickerContainer: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  doneBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  loggedBySection: {
    marginBottom: Spacing.lg,
  },
  caregiverRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  caregiverChip: {
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minWidth: 72,
  },
  notesSection: {
    marginBottom: Spacing.lg,
  },
  notesInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    paddingBottom: Spacing.md,
  },
});
