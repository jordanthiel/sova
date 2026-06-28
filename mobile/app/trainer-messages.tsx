import { ChatInput } from '@/components/chat/ChatInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTrainerMessages } from '@/hooks/useTrainerMessages';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { supabase } from '@/lib/supabase';
import { trainerConversationsRepo } from '@/services/repositories/trainerConversationsRepo';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function coerceRouteParam(value: string | string[] | undefined): string | null {
  if (value == null) return null;
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || null;
}

export default function TrainerMessagesScreen() {
  const params = useLocalSearchParams<{
    babyId?: string | string[];
    trainerId?: string | string[];
    title?: string | string[];
  }>();
  const babyId = coerceRouteParam(params.babyId);
  const trainerId = coerceRouteParam(params.trainerId);
  const title = coerceRouteParam(params.title) ?? 'Sleep trainer';
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [sending, setSending] = useState(false);
  const { messages, loading: messagesLoading, sendMessage } = useTrainerMessages(conversationId);
  const scrollRef = useRef<ScrollView>(null);
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadConversation() {
      if (!babyId || !trainerId) {
        setLoadingConversation(false);
        return;
      }
      setLoadingConversation(true);
      try {
        const conversation = await trainerConversationsRepo.getOrCreateForBaby(babyId, trainerId);
        if (!cancelled) setConversationId(conversation.id);
      } catch (err) {
        console.error('[TrainerMessagesScreen] conversation error:', err);
      } finally {
        if (!cancelled) setLoadingConversation(false);
      }
    }
    loadConversation();
    return () => {
      cancelled = true;
    };
  }, [babyId, trainerId]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const handleSend = async (body: string) => {
    setSending(true);
    try {
      await sendMessage(body);
    } finally {
      setSending(false);
    }
  };

  const loading = loadingConversation || messagesLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerClose}>
          <Text style={[styles.headerCloseText, { color: colors.textSecondary }]}>×</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[Typography.bodySemiBold, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[Typography.small, { color: colors.textTertiary }]}>Trainer messages</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <>
              <SkeletonCard style={{ marginBottom: Spacing.md }} />
              <SkeletonCard style={{ marginBottom: Spacing.md }} />
            </>
          ) : messages.length === 0 ? (
            <EmptyState
              icon="message.fill"
              title="No messages yet"
              message="Start a conversation about sleep sessions, plans, or follow-up instructions."
            />
          ) : (
            messages.map((message) => {
              const mine = message.senderId === currentUserId;
              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        backgroundColor: mine ? colors.chatUser : 'rgba(255, 255, 255, 0.06)',
                        borderBottomRightRadius: mine ? 4 : Radius.lg,
                        borderBottomLeftRadius: mine ? Radius.lg : 4,
                      },
                    ]}
                  >
                    <Text style={[Typography.body, { color: mine ? colors.chatUserText : colors.text }]}>
                      {message.body}
                    </Text>
                  </View>
                  <Text
                    style={[
                      Typography.small,
                      styles.timestamp,
                      { color: colors.textTertiary, textAlign: mine ? 'right' : 'left' },
                    ]}
                  >
                    {format(new Date(message.createdAt), 'h:mm a')}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
        <ChatInput
          onSend={handleSend}
          disabled={sending || !conversationId}
          placeholder="Message about sleep..."
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0918',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCloseText: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  keyboardWrap: {
    flex: 1,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  messageRow: {
    marginBottom: Spacing.md,
    maxWidth: '82%',
  },
  messageRowMine: {
    alignSelf: 'flex-end',
  },
  messageRowTheirs: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  timestamp: {
    marginTop: 3,
    paddingHorizontal: Spacing.xs,
  },
});
