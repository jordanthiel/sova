import { IconSymbol } from '@/components/ui/icon-symbol';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Ask your sleep coach...' }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const colors = useThemeColors();

  const canSend = message.trim().length > 0 && !disabled;

  const handleSend = () => {
    if (canSend) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSend(message.trim());
      setMessage('');
    }
  };

  return (
    <View style={[styles.container, { borderTopColor: colors.borderLight }]}>
      <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          editable={!disabled}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
      </View>
      <TouchableOpacity
        style={[
          styles.sendButton,
          { backgroundColor: canSend ? colors.accent : colors.border },
        ]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.7}
      >
        <IconSymbol name="paperplane.fill" size={18} color={canSend ? '#0B1426' : colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: Spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.sm,
    borderTopWidth: 1,
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    ...Typography.body,
    minHeight: 46,
    maxHeight: 100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
