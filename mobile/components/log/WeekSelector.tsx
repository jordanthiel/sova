import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, subWeeks, addWeeks, startOfWeek, endOfWeek } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

interface WeekSelectorProps {
  selectedWeekStart: Date; // Sunday of the selected week
  onWeekChange: (weekStart: Date) => void;
}

export function WeekSelector({ selectedWeekStart, onWeekChange }: WeekSelectorProps) {
  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);

  const handlePrev = () => {
    Haptics.selectionAsync();
    onWeekChange(subWeeks(selectedWeekStart, 1));
  };

  const handleNext = () => {
    Haptics.selectionAsync();
    onWeekChange(addWeeks(selectedWeekStart, 1));
  };

  const handleDatePress = () => {
    Haptics.selectionAsync();
    setShowPicker(true);
  };

  const handlePickerChange = (_event: any, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (date) onWeekChange(startOfWeek(date, { weekStartsOn: 0 }));
  };

  const weekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 0 });
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const isCurrentOrFutureWeek = selectedWeekStart.getTime() >= currentWeekStart.getTime();

  return (
    <View>
      <View style={styles.container}>
        <TouchableOpacity style={styles.arrowButton} onPress={handlePrev} activeOpacity={0.7}>
          <Text style={[Typography.bodyMedium, { color: colors.textSecondary }]}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dateButton} onPress={handleDatePress} activeOpacity={0.7}>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
            Week of {format(selectedWeekStart, 'MMM d')}
          </Text>
          <Text style={[Typography.small, { color: colors.textTertiary }]}>
            {format(selectedWeekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.arrowButton, isCurrentOrFutureWeek && styles.arrowButtonDisabled]}
          onPress={handleNext}
          activeOpacity={0.7}
          disabled={isCurrentOrFutureWeek}
        >
          <Text style={[Typography.bodyMedium, { color: isCurrentOrFutureWeek ? colors.textTertiary : colors.textSecondary }]}>›</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={selectedWeekStart}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handlePickerChange}
            themeVariant="dark"
            maximumDate={new Date()}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setShowPicker(false)}
              activeOpacity={0.7}
            >
              <Text style={[Typography.buttonSmall, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  arrowButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  arrowButtonDisabled: {
    opacity: 0.5,
  },
  dateButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  pickerWrapper: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  doneButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
});
