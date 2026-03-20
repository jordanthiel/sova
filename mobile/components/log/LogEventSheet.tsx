import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { EventLogType } from '@/types/domain';

interface LogEventSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (type: EventLogType, note?: string) => void;
}

const EVENT_TYPES: Array<{
  type: EventLogType;
  icon: import('@/components/ui/icon-symbol').IconSymbolName;
  label: string;
  available: boolean;
}> = [
  { type: 'nap', icon: 'sun.max.fill', label: 'Nap', available: true },
  { type: 'night', icon: 'moon.fill', label: 'Night Sleep', available: true },
  { type: 'feed', icon: 'figure.child', label: 'Feed', available: true },
  { type: 'diaper', icon: 'figure.child', label: 'Diaper', available: true },
  { type: 'medication', icon: 'pills.fill', label: 'Medication', available: true },
  { type: 'night_wake', icon: 'bed.double.fill', label: 'Night Wake', available: true },
  { type: 'note', icon: 'note.text', label: 'Note', available: true },
];

export function LogEventSheet({ visible, onClose, onSubmit }: LogEventSheetProps) {
  const colors = useThemeColors();
  const [selectedType, setSelectedType] = useState<EventLogType | null>(null);
  const [note, setNote] = useState('');

  const handleSelect = (type: EventLogType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'note' || type === 'feed' || type === 'diaper' || type === 'medication' || type === 'night_wake') {
      setSelectedType(type);
    } else {
      onSubmit(type);
      handleClose();
    }
  };

  const handleSubmit = () => {
    if (!selectedType) return;
    if (selectedType === 'note' && !note.trim()) return;
    onSubmit(selectedType, note.trim() || undefined);
    handleClose();
  };

  const handleClose = () => {
    setSelectedType(null);
    setNote('');
    onClose();
  };

  const needsNote = selectedType === 'note';
  const isDetailStep = selectedType != null;

  const placeholderMap: Record<string, string> = {
    note: "What's happening?",
    feed: 'Details (e.g., 4oz bottle, nursed 15min)...',
    diaper: 'Details (e.g., wet, dirty)...',
    medication: 'Name and dose...',
    night_wake: 'Duration or notes (e.g., awake 20min, needed rocking)...',
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <LinearGradient
            colors={['#132140', '#0D1B2A']}
            style={styles.sheetGradient}
          >
            <View style={styles.handle} />
            <Text
              style={[Typography.h3, { color: colors.text, marginBottom: Spacing.lg }]}
            >
              {isDetailStep
                ? `Log ${EVENT_TYPES.find((e) => e.type === selectedType)?.label}`
                : 'Log Event'}
            </Text>

            {isDetailStep ? (
              <View>
                <TextInput
                  style={[
                    styles.noteInput,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                  placeholder={placeholderMap[selectedType!] || 'Add details...'}
                  placeholderTextColor={colors.textTertiary}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  autoFocus
                />
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setSelectedType(null)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[Typography.button, { color: colors.textSecondary }]}
                    >
                      Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      needsNote && !note.trim() && styles.submitBtnDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={needsNote && !note.trim()}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={
                        needsNote && !note.trim()
                          ? ['#333', '#333']
                          : ['#4ECDC4', '#3BA8A0']
                      }
                      style={styles.submitBtnGradient}
                    >
                      <Text
                        style={[
                          Typography.button,
                          {
                            color:
                              needsNote && !note.trim() ? '#666' : '#0B1426',
                          },
                        ]}
                      >
                        Save
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                  {EVENT_TYPES.map(({ type, icon, label, available }) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        !available && styles.typeButtonDisabled,
                      ]}
                      onPress={() => handleSelect(type)}
                      activeOpacity={0.7}
                      disabled={!available}
                    >
                      <IconSymbol name={icon} size={28} color={available ? colors.text : colors.textTertiary} />
                      <Text
                        style={[
                          Typography.captionMedium,
                          {
                            color: available
                              ? colors.text
                              : colors.textTertiary,
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '60%',
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    overflow: 'hidden',
  },
  sheetGradient: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeButton: {
    width: '31%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: Spacing.xs,
  },
  typeButtonDisabled: {
    opacity: 0.4,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    ...Typography.body,
    marginBottom: Spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  submitBtn: {
    flex: 2,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: Radius.xl,
  },
});
