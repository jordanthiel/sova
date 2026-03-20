import { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { Button } from '@/components/ui/Button';
import { format, differenceInMinutes } from 'date-fns';
import { formatDuration } from '@/utils/formatTime';

interface ManualLogModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { type: 'nap' | 'night'; start_time: string; end_time: string; notes?: string; duration_minutes: number }) => void;
}

export function ManualLogModal({ visible, onClose, onSave }: ManualLogModalProps) {
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const [type, setType] = useState<'nap' | 'night'>('nap');
  const [startTime, setStartTime] = useState(new Date(Date.now() - 60 * 60 * 1000)); // 1 hour ago
  const [endTime, setEndTime] = useState(new Date());
  const [notes, setNotes] = useState('');
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null);

  const handleSave = () => {
    if (endTime <= startTime) {
      Alert.alert('Invalid Times', 'End time must be after start time.');
      return;
    }
    const durationMins = differenceInMinutes(endTime, startTime);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      type,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: notes.trim() || undefined,
      duration_minutes: durationMins,
    });
    // Reset
    setType('nap');
    setStartTime(new Date(Date.now() - 60 * 60 * 1000));
    setEndTime(new Date());
    setNotes('');
  };

  const onTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setPickerMode(null);
    if (selectedDate) {
      if (pickerMode === 'start') setStartTime(selectedDate);
      else setEndTime(selectedDate);
    }
  };

  const durationMins = Math.max(0, differenceInMinutes(endTime, startTime));

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
            <Text style={[Typography.h2, { color: colors.text, textAlign: 'center', marginBottom: Spacing.lg }]}>
              Log Past Sleep
            </Text>

            {/* Type selector */}
            <View style={styles.typeSelector}>
              <TouchableOpacity
                onPress={() => setType('nap')}
                activeOpacity={0.8}
                style={{ flex: 1, borderRadius: Radius.lg, overflow: 'hidden' }}
              >
                <LinearGradient
                  colors={type === 'nap' ? [...gradients.nap] : [colors.background, colors.background]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.typeBtn, type !== 'nap' && { borderWidth: 1, borderColor: colors.border }]}
                >
                  <IconSymbol name="sun.max.fill" size={28} color={colors.text} />
                  <Text style={[Typography.bodySemiBold, { color: type === 'nap' ? '#FFFFFF' : colors.text }]}>
                    Nap
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setType('night')}
                activeOpacity={0.8}
                style={{ flex: 1, borderRadius: Radius.lg, overflow: 'hidden' }}
              >
                <LinearGradient
                  colors={type === 'night' ? [...gradients.night] : [colors.background, colors.background]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.typeBtn, type !== 'night' && { borderWidth: 1, borderColor: colors.border }]}
                >
                  <IconSymbol name="moon.fill" size={28} color={colors.text} />
                  <Text style={[Typography.bodySemiBold, { color: type === 'night' ? '#FFFFFF' : colors.text }]}>
                    Night
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Time pickers */}
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={[styles.timeField, { backgroundColor: colors.background, borderColor: pickerMode === 'start' ? colors.accent : colors.border }]}
                onPress={() => setPickerMode('start')}
                activeOpacity={0.7}
              >
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>Start</Text>
                <Text style={[Typography.h3, { color: colors.text }]}>{format(startTime, 'h:mm a')}</Text>
              </TouchableOpacity>

              <Text style={[Typography.body, { color: colors.textTertiary }]}>→</Text>

              <TouchableOpacity
                style={[styles.timeField, { backgroundColor: colors.background, borderColor: pickerMode === 'end' ? colors.accent : colors.border }]}
                onPress={() => setPickerMode('end')}
                activeOpacity={0.7}
              >
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>End</Text>
                <Text style={[Typography.h3, { color: colors.text }]}>{format(endTime, 'h:mm a')}</Text>
              </TouchableOpacity>
            </View>

            {/* Duration preview */}
            <View style={[styles.durationPreview, { backgroundColor: colors.accentSoft }]}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>Duration</Text>
              <Text style={[Typography.bodySemiBold, { color: colors.accent }]}>
                {formatDuration(durationMins)}
              </Text>
            </View>

            {/* Inline picker */}
            {pickerMode && (
              <View style={[styles.pickerContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <DateTimePicker
                  value={pickerMode === 'start' ? startTime : endTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                  maximumDate={new Date()}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    onPress={() => setPickerMode(null)}
                    style={[styles.doneBtn, { backgroundColor: colors.accent }]}
                  >
                    <Text style={[Typography.buttonSmall, { color: '#FFFFFF' }]}>Done</Text>
                  </TouchableOpacity>
                )}
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
                placeholder="Any notes about this sleep?"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={200}
              />
            </View>

            {/* Save */}
            <View style={styles.actions}>
              <Button title="Log Sleep Session" onPress={handleSave} fullWidth />
              <Button title="Cancel" onPress={onClose} variant="ghost" fullWidth style={{ marginTop: Spacing.sm }} />
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
    maxHeight: '90%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  typeBtn: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  timeField: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 2,
  },
  durationPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
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
  notesSection: {
    marginBottom: Spacing.lg,
  },
  notesInput: {
    ...Typography.body,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actions: {
    paddingBottom: Spacing.md,
  },
});
