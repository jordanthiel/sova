import { StyleSheet, View, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Shadows, Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { format } from 'date-fns';
import type { Database } from '@/lib/supabase';

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessageComponent({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const colors = useThemeColors();

  const markdownStyles = {
    body: { color: colors.chatAssistantText, fontSize: 16, lineHeight: 22 },
    text: { color: colors.chatAssistantText, fontSize: 16, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { color: colors.chatAssistantText, fontWeight: '600' as const },
    em: { color: colors.chatAssistantText, fontStyle: 'italic' as const },
    link: { color: colors.accent },
    list_item: { color: colors.chatAssistantText, fontSize: 16, lineHeight: 22 },
    bullet_list_icon: { color: colors.chatAssistantText },
    ordered_list_icon: { color: colors.chatAssistantText },
    code_inline: { color: colors.chatAssistantText, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 4, borderRadius: 4 },
    code_block: { color: colors.chatAssistantText, backgroundColor: 'rgba(255,255,255,0.08)', padding: Spacing.sm, borderRadius: Radius.md },
    heading1: { color: colors.chatAssistantText, fontSize: 20 },
    heading2: { color: colors.chatAssistantText, fontSize: 18 },
    heading3: { color: colors.chatAssistantText, fontSize: 16 },
    blockquote: { borderLeftColor: colors.accent, backgroundColor: colors.shimmer },
    hr: { backgroundColor: colors.border },
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubbleWrapper, isUser ? null : styles.assistantContentWrapper]}>
        <View
          style={[
            isUser ? styles.messageBubble : styles.assistantContent,
            isUser && Shadows.sm,
            isUser && { backgroundColor: colors.chatUser, borderBottomRightRadius: 4 },
          ]}
        >
          {isUser ? (
            <Text
              style={[
                Typography.body,
                { color: colors.chatUserText, lineHeight: 22 },
              ]}
            >
              {message.content}
            </Text>
          ) : (
            <Markdown style={markdownStyles} mergeStyle>
              {message.content?.trim() || ''}
            </Markdown>
          )}
        </View>
        <Text
          style={[
            styles.timestamp,
            { color: colors.textTertiary },
            isUser ? { textAlign: 'right' } : { textAlign: 'left' },
          ]}
        >
          {format(new Date(message.created_at), 'h:mm a')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'stretch',
  },
  bubbleWrapper: {
    maxWidth: '78%',
  },
  assistantContentWrapper: {
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  messageBubble: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  assistantContent: {
    paddingVertical: Spacing.sm,
  },
  timestamp: {
    ...Typography.small,
    marginTop: 3,
    paddingHorizontal: Spacing.xs,
  },
});
