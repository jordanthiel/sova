import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

interface DaySelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

function getDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

export function DaySelector({ selectedDate, onDateChange }: DaySelectorProps) {
  const colors = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);

  const handlePrev = () => {
    Haptics.selectionAsync();
    onDateChange(subDays(selectedDate, 1));
  };

  const handleNext = () => {
    Haptics.selectionAsync();
    onDateChange(addDays(selectedDate, 1));
  };

  const handleDatePress = () => {
    Haptics.selectionAsync();
    setShowPicker(true);
  };

  const handlePickerChange = (_event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (date) {
      onDateChange(date);
    }
  };

  const handlePickerDismiss = () => {
    setShowPicker(false);
  };

  return (
    <View>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.arrowButton}
          onPress={handlePrev}
          activeOpacity={0.7}
        >
          <Text style={[Typography.bodyMedium, { color: colors.textSecondary }]}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateButton}
          onPress={handleDatePress}
          activeOpacity={0.7}
        >
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>
            {getDateLabel(selectedDate)}
          </Text>
          <Text style={[Typography.small, { color: colors.textTertiary }]}>
            {format(selectedDate, 'MMMM d, yyyy')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.arrowButton}
          onPress={handleNext}
          activeOpacity={0.7}
        >
          <Text style={[Typography.bodyMedium, { color: colors.textSecondary }]}>›</Text>
        </TouchableOpacity>
      </View>

      {showPicker && (
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={handlePickerChange}
            themeVariant="dark"
            maximumDate={addDays(new Date(), 1)}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={handlePickerDismiss}
              activeOpacity={0.7}
            >
              <Text style={[Typography.buttonSmall, { color: colors.accent }]}>
                Done
              </Text>
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
