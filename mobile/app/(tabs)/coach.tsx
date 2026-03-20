import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatMessageComponent } from '@/components/chat/ChatMessage';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { PremiumUpsellCard } from '@/components/premium/PremiumUpsellCard';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { usePremiumGate } from '@/hooks/usePremiumGate';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { useBabies } from '@/hooks/useBabies';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useCoachMemories } from '@/hooks/useCoachMemories';
import { useCoachConversations } from '@/hooks/useCoachConversations';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { useSleepData } from '@/hooks/useSleepData';
import { supabase } from '@/lib/supabase';
import type { CoachContext } from '@/services/ai/coach';
import * as coachService from '@/services/ai/coach';
import { track } from '@/services/analytics/track';
import { babiesRepo } from '@/services/repositories/babiesRepo';
import type { Baby, BabyPreferences } from '@/types/domain';
import { isPremiumAccessRequiredError } from '@/types/subscription';
import { format, isToday, isYesterday } from 'date-fns';
import { getExtendedDayBounds, sessionOverlapsExtendedDay } from '@/utils/dateUtils';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const CONVERSATION_STARTERS = [
  'Why this nap time?',
  'Move bedtime earlier',
  'Fix early wakeups',
  'Transition to 2 naps',
  "What's a good schedule for my baby's age?",
  'Help with night wakings',
];

// Match FloatingTabBar height so content and input sit above the tab bar
const TAB_BAR_HEIGHT = 64 + 16; // pill minHeight + typical bottom padding

const ADJUSTMENT_CONTROLS: {
  label: string;
  key: keyof BabyPreferences;
  value: boolean;
}[] = [
  { label: 'Prefer longer naps', key: 'preferLongerNaps', value: true },
  { label: 'Prefer earlier bedtime', key: 'preferEarlierBedtime', value: true },
  { label: 'Strict schedule', key: 'strictSchedule', value: true },
  { label: 'Flexible schedule', key: 'strictSchedule', value: false },
];

function extractPreferenceIntent(content: string): Partial<BabyPreferences> {
  const text = content.toLowerCase();
  const patch: Partial<BabyPreferences> = {};

  // Bedtime preference direction
  if (
    /\b(earlier bedtime|bedtime earlier|move bedtime earlier|earlier at night)\b/.test(text) ||
    /\bbedtime\b/.test(text) && /\bearlier\b/.test(text)
  ) {
    patch.preferEarlierBedtime = true;
  } else if (
    /\b(later bedtime|bedtime later|move bedtime later)\b/.test(text) ||
    /\bbedtime\b/.test(text) && /\blater\b/.test(text)
  ) {
    patch.preferEarlierBedtime = false;
  }

  // Nap length preference
  if (/\b(longer naps?|lengthen naps?)\b/.test(text)) {
    patch.preferLongerNaps = true;
  } else if (/\b(shorter naps?|shorten naps?|cap naps? sooner)\b/.test(text)) {
    patch.preferLongerNaps = false;
  }

  // Scheduling style
  if (/\b(strict schedule|more strict|consistent schedule)\b/.test(text)) {
    patch.strictSchedule = true;
  } else if (/\b(flexible schedule|less strict|more flexible)\b/.test(text)) {
    patch.strictSchedule = false;
  }

  // Target nap count ("2 naps", "3 nap schedule")
  const napCountMatch = text.match(/\b([1-4])\s*naps?\b/);
  if (napCountMatch) {
    patch.targetNapCount = Number(napCountMatch[1]);
  }

  // Bedtime target time ("bedtime at 7:30", "target bedtime 19:15")
  const bedtimeTimeMatch = text.match(/\b(?:bedtime|target bedtime)\D{0,12}(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (bedtimeTimeMatch) {
    let hour = Number(bedtimeTimeMatch[1]);
    const minute = Number(bedtimeTimeMatch[2]);
    const ampm = bedtimeTimeMatch[3];
    if (!Number.isNaN(hour) && !Number.isNaN(minute) && minute >= 0 && minute <= 59) {
      if (ampm) {
        const suffix = ampm.toLowerCase();
        if (suffix === 'pm' && hour !== 12) hour += 12;
        if (suffix === 'am' && hour === 12) hour = 0;
      }
      if (hour >= 0 && hour <= 23) {
        patch.bedtimeType = 'target';
        patch.bedtimeTargetTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    }
  } else if (/\bno fixed bedtime|flexible bedtime\b/.test(text)) {
    patch.bedtimeType = 'flexible';
    patch.bedtimeTargetTime = null;
  }

  // Last wake window override ("last wake window 180", "3 hour last wake window")
  const wakeWindowMin = text.match(/\blast wake window\D{0,12}(\d{2,3})\s*(?:m|min|mins|minutes)?\b/);
  if (wakeWindowMin) {
    const minutes = Number(wakeWindowMin[1]);
    if (minutes >= 60 && minutes <= 360) patch.lastWakeWindowMinutes = minutes;
  } else {
    const wakeWindowHours = text.match(/\blast wake window\D{0,12}(\d(?:\.\d)?)\s*(?:h|hr|hrs|hour|hours)\b/);
    if (wakeWindowHours) {
      const minutes = Math.round(Number(wakeWindowHours[1]) * 60);
      if (minutes >= 60 && minutes <= 360) patch.lastWakeWindowMinutes = minutes;
    }
  }

  return patch;
}

function summarizePreferencePatch(patch: Partial<BabyPreferences>): string | null {
  const changes: string[] = [];
  if (patch.preferEarlierBedtime != null) {
    changes.push(patch.preferEarlierBedtime ? 'earlier bedtime preference' : 'later bedtime preference');
  }
  if (patch.preferLongerNaps != null) {
    changes.push(patch.preferLongerNaps ? 'longer nap preference' : 'shorter nap preference');
  }
  if (patch.strictSchedule != null) {
    changes.push(patch.strictSchedule ? 'strict schedule' : 'flexible schedule');
  }
  if (patch.targetNapCount != null) {
    changes.push(`${patch.targetNapCount} naps target`);
  }
  if (patch.bedtimeType === 'target' && patch.bedtimeTargetTime) {
    changes.push(`target bedtime ${patch.bedtimeTargetTime}`);
  } else if (patch.bedtimeType === 'flexible') {
    changes.push('flexible bedtime');
  }
  if (patch.lastWakeWindowMinutes != null) {
    changes.push(`last wake window ${patch.lastWakeWindowMinutes}m`);
  }
  if (changes.length === 0) return null;
  return `Noted - I'll actively update recommendations using: ${changes.join(', ')}.`;
}

export default function CoachScreen() {
  const params = useLocalSearchParams<{ initialMessage?: string }>();
  const { babies, loading: babiesLoading } = useBabies();
  const { currentBabyId, setCurrentBabyId, isHydrated } = useCurrentBaby();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showConversationList, setShowConversationList] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const { baby } = useSleepData({ babyId: currentBabyId });
  const { sessions: allSessions } = useRealtimeSleepSessions(currentBabyId);
  const { conversations, loading: conversationsLoading, refetch: refetchConversations } = useCoachConversations(currentBabyId);
  const { messages, loading: messagesLoading, sendMessage, refetch: refetchMessages } = useChatMessages(currentBabyId, selectedConversationId);
  const { memoryStrings, addMemories } = useCoachMemories(currentBabyId);
  const [sending, setSending] = useState(false);
  const [preferences, setPreferences] = useState<BabyPreferences | null>(null);
  const [pendingSuggestedMemories, setPendingSuggestedMemories] = useState<string[] | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const colors = useThemeColors();
  const gradients = useThemeGradients();
  const initialMessageHandled = useRef(false);
  const prevMessageCountRef = useRef(0);
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const bottomPadding = keyboardVisible ? 0 : TAB_BAR_HEIGHT + insets.bottom;
  const menuSlideAnim = useRef(new Animated.Value(0)).current;
  const MENU_PANEL_WIDTH = Math.min(280, Dimensions.get('window').width * 0.8);
  const premiumGate = usePremiumGate();

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (showConversationList) {
      menuSlideAnim.setValue(0);
      Animated.timing(menuSlideAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      setConversationSearch('');
    }
  }, [showConversationList]);

  const closeMenu = useCallback(() => {
    Animated.timing(menuSlideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShowConversationList(false);
    });
  }, [menuSlideAnim]);

  useEffect(() => {
    if (!isHydrated || babiesLoading || babies.length === 0) return;
    const currentValid = currentBabyId && babies.some((b) => b.id === currentBabyId);
    if (currentValid) return;
    setCurrentBabyId(babies[0].id);
  }, [isHydrated, babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  useEffect(() => {
    if (currentBabyId) {
      setSelectedConversationId(null);
      setShowConversationList(false);
    }
  }, [currentBabyId]);

  // Clear pending memory suggestions when switching conversation or starting a new chat
  useEffect(() => {
    setPendingSuggestedMemories(null);
  }, [selectedConversationId]);

  // When switching conversation, reset so we can detect new messages
  useEffect(() => {
    if (selectedConversationId != null) {
      prevMessageCountRef.current = 0;
    }
  }, [selectedConversationId]);

  // After initial load finishes, sync count so we don't scroll when opening a conversation
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (messagesLoading) {
      wasLoadingRef.current = true;
      return;
    }
    if (selectedConversationId != null && wasLoadingRef.current) {
      wasLoadingRef.current = false;
      prevMessageCountRef.current = messages.length;
    }
  }, [selectedConversationId, messagesLoading]);

  useEffect(() => {
    if (currentBabyId) {
      babiesRepo.getPreferences(currentBabyId).then(setPreferences);
    }
  }, [currentBabyId]);

  const scrollToTopOfLastMessage = useCallback((y: number) => {
    scrollViewRef.current?.scrollTo({ y, animated: true });
  }, []);

  useEffect(() => {
    if (
      params.initialMessage &&
      !initialMessageHandled.current &&
      currentBabyId &&
      baby &&
      !sending
    ) {
      initialMessageHandled.current = true;
      handleSendMessage(params.initialMessage);
    }
  }, [params.initialMessage, currentBabyId, baby]);

  const buildCoachContext = useCallback((prefsOverride?: BabyPreferences): CoachContext | null => {
    if (!baby || !currentBabyId) return null;

    const endedSessions = allSessions
      .filter((s) => s.end_time !== null)
      .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());

    const lastWake = endedSessions.length > 0
      ? new Date(endedSessions[0].end_time!)
      : new Date();

    const awakeMinutes = Math.round((Date.now() - lastWake.getTime()) / 60000);

    const { start: todayStart, end: todayEnd } = getExtendedDayBounds(new Date());
    const todaySessions = allSessions.filter((s) => {
      if (s.end_time === null) return false;
      return sessionOverlapsExtendedDay(s.start_time, s.end_time, todayStart, todayEnd);
    });
    const totalDaySleep = todaySessions
      .filter((s) => s.type === 'nap')
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    const domainBaby: Baby = {
      id: currentBabyId,
      name: baby.name,
      birthdate: baby.birth_date,
      preferences: prefsOverride || preferences || {
        preferLongerNaps: false,
        preferEarlierBedtime: false,
        strictSchedule: false,
        sleepGoals: [],
        bedtimeType: 'flexible',
        bedtimeTargetTime: null,
        targetNapCount: null,
        lastWakeWindowMinutes: null,
      },
      caregivers: [],
    };

    return {
      baby: domainBaby,
      recentEvents: allSessions.slice(0, 20).map((s) => ({
        id: s.id,
        babyId: s.baby_id,
        type: s.type as 'nap' | 'night',
        start: s.start_time,
        end: s.end_time,
        createdBy: s.logged_by,
        note: s.notes,
        durationMinutes: s.duration_minutes,
      })),
      awakeMinutes,
      totalDaySleepMinutes: totalDaySleep,
      memories: memoryStrings.length > 0 ? memoryStrings : undefined,
    };
  }, [baby, currentBabyId, allSessions, preferences, memoryStrings]);

  const handleSendMessage = async (content: string) => {
    if (!currentBabyId || !baby) return;
    if (!premiumGate.hasPremiumAccess) {
      premiumGate.showPaywall('coach');
      return;
    }

    setSending(true);
    track('ask_ai', { babyId: currentBabyId, prompt: content.substring(0, 50) });

    try {
      let effectivePreferences = preferences;
      const intentPatch = extractPreferenceIntent(content);
      if (Object.keys(intentPatch).length > 0) {
        const updated = await babiesRepo.updatePreferences(currentBabyId, intentPatch);
        setPreferences(updated);
        effectivePreferences = updated;
      }

      const result = await sendMessage(content, {
        conversationId: selectedConversationId,
        onCreateConversation: setSelectedConversationId,
      });
      if (!result) throw new Error('Failed to save user message');
      const { message: userMsg, conversationId: convId } = result;
      if (!selectedConversationId) refetchConversations();

      const ctx = buildCoachContext(effectivePreferences ?? undefined);
      if (!ctx) throw new Error('No context available');

      const allMsgs = messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.created_at,
      }));
      allMsgs.push({
        id: userMsg.id,
        role: 'user' as const,
        content,
        timestamp: userMsg.created_at,
      });

      const response = await coachService.chat(allMsgs, ctx);
      const intentNote = summarizePreferencePatch(intentPatch);
      const assistantContent =
        ((response?.message?.content && String(response.message.content).trim()) || '') ||
        "I'm not sure how to respond to that. Try asking about nap times, bedtime, or early wakeups.";
      const composedAssistantContent = intentNote
        ? `${intentNote}\n\n${assistantContent}`
        : assistantContent;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('chat_messages').insert({
          baby_id: currentBabyId,
          user_id: user.id,
          conversation_id: convId,
          role: 'assistant',
          content: composedAssistantContent,
        });
      }

      if (response?.extracted_preferences && currentBabyId) {
        const patch: Partial<BabyPreferences> = {};
        if (response.extracted_preferences.last_wake_window_minutes != null) {
          patch.lastWakeWindowMinutes = response.extracted_preferences.last_wake_window_minutes;
        }
        if (response.extracted_preferences.bedtime_target_time != null && response.extracted_preferences.bedtime_target_time.trim() !== '') {
          patch.bedtimeTargetTime = response.extracted_preferences.bedtime_target_time.trim();
          patch.bedtimeType = 'target';
        }
        if (response.extracted_preferences.bedtime_type != null) {
          patch.bedtimeType = response.extracted_preferences.bedtime_type === 'target' ? 'target' : 'flexible';
          if (patch.bedtimeType === 'flexible') {
            patch.bedtimeTargetTime = null;
          }
        }
        if (response.extracted_preferences.target_nap_count != null) {
          const raw = response.extracted_preferences.target_nap_count;
          patch.targetNapCount = typeof raw === 'number' && Number.isFinite(raw)
            ? Math.max(1, Math.min(4, Math.round(raw)))
            : null;
        }
        if (response.extracted_preferences.prefer_longer_naps != null) {
          patch.preferLongerNaps = !!response.extracted_preferences.prefer_longer_naps;
        }
        if (response.extracted_preferences.prefer_earlier_bedtime != null) {
          patch.preferEarlierBedtime = !!response.extracted_preferences.prefer_earlier_bedtime;
        }
        if (response.extracted_preferences.strict_schedule != null) {
          patch.strictSchedule = !!response.extracted_preferences.strict_schedule;
        }
        if (Object.keys(patch).length > 0) {
          const updated = await babiesRepo.updatePreferences(currentBabyId, patch);
          setPreferences(updated);
        }
      }

      if (response?.suggested_memories && response.suggested_memories.length > 0) {
        setPendingSuggestedMemories(response.suggested_memories);
      }

      // Only refetch when we're in an existing conversation. For new conversations,
      // selectedConversationId hasn't updated yet so refetch would clear messages.
      if (selectedConversationId) refetchMessages(true);
    } catch (error: any) {
      if (isPremiumAccessRequiredError(error)) {
        premiumGate.showPaywall('coach');
        return;
      }
      console.error('Error in coach:', error);
      const { data: { user } } = await supabase.auth.getUser();
      const convId = selectedConversationId;
      if (user && currentBabyId && convId) {
        await supabase.from('chat_messages').insert({
          baby_id: currentBabyId,
          user_id: user.id,
          conversation_id: convId,
          role: 'assistant',
          content: 'Sorry, I encountered an issue. Please try again.',
        });
        refetchMessages(true);
      }
    } finally {
      setSending(false);
    }
  };

  const handlePreferenceToggle = async (key: keyof BabyPreferences, value: boolean) => {
    if (!currentBabyId) return;
    track('change_ai_preference', { key, value });
    const updated = await babiesRepo.updatePreferences(currentBabyId, { [key]: value });
    setPreferences(updated);
  };

  if (babiesLoading || (selectedConversationId !== null && messagesLoading)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  if (babies.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <EmptyState icon="message.fill" title="Sleep Coach" message="Add a baby to start chatting with your AI sleep coach." />
      </SafeAreaView>
    );
  }

  if (!currentBabyId || !baby) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}><SkeletonCard /></View>
      </SafeAreaView>
    );
  }

  if (!premiumGate.hasPremiumAccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <View style={styles.lockedContainer}>
          <PremiumUpsellCard
            feature="coach"
            title="Unlock your AI sleep coach"
            message={`Keep asking personalized questions about ${baby.name}'s sleep, schedules, transitions, and bedtime.`}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isNewConversation = selectedConversationId === null;
  const showWelcome = isNewConversation && messages.length === 0 && !sending;

  const conversationTitle = (() => {
    if (isNewConversation) return null;
    const firstUser = messages.find((m) => m.role === 'user');
    if (firstUser?.content) {
      const trimmed = firstUser.content.trim();
      return trimmed.length > 40 ? `${trimmed.slice(0, 40).trim()}…` : trimmed;
    }
    return 'Chat';
  })();

  const formatConversationDate = (createdAt: string) => {
    const d = new Date(createdAt);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMM d, yyyy');
  };

  const filteredConversations = conversationSearch.trim()
    ? conversations.filter((c) => {
        const label = (c.title?.trim() || formatConversationDate(c.created_at)).toLowerCase();
        return label.includes(conversationSearch.trim().toLowerCase());
      })
    : conversations;

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: bottomPadding }]} edges={['top']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => {
              track('coach_menu_open');
              refetchConversations();
              setShowConversationList(true);
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
          >
            <IconSymbol name="line.3.horizontal" size={24} color={colors.text} />
          </TouchableOpacity>
          {conversationTitle !== null ? (
            <View style={styles.headerTitleWrap}>
              <Text style={[Typography.h3, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                {conversationTitle}
              </Text>
            </View>
          ) : (
            <BabySwitcher
              currentBabyId={currentBabyId}
              babies={babies}
              onBabyChange={(id) => {
                track('switch_baby', { babyId: id });
                setCurrentBabyId(id);
                initialMessageHandled.current = false;
              }}
            />
          )}
        </View>
        <ProfileAvatarButton />
      </View>

      <Modal
        visible={showConversationList}
        animationType="none"
        transparent
        onRequestClose={closeMenu}
      >
        <View style={styles.menuOverlay}>
          <Animated.View
            style={[
              styles.menuPanel,
              {
                width: MENU_PANEL_WIDTH,
                backgroundColor: colors.surfaceSolid,
                paddingTop: Spacing.md + insets.top,
                transform: [
                  {
                    translateX: menuSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-MENU_PANEL_WIDTH, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.menuHeaderRow}>
              <TextInput
                style={[styles.menuSearchInput, { backgroundColor: colors.background, color: colors.text }]}
                placeholder="Search conversations"
                placeholderTextColor={colors.textSecondary}
                value={conversationSearch}
                onChangeText={setConversationSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.menuNewButton, { backgroundColor: colors.accent }]}
                onPress={() => {
                  setSelectedConversationId(null);
                  setShowConversationList(false);
                }}
              >
                <IconSymbol name="plus" size={20} color={colors.background} />
              </TouchableOpacity>
            </View>
            {filteredConversations.length === 0 ? (
              <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
                {conversations.length === 0 ? 'No previous conversations yet.' : 'No matches.'}
              </Text>
            ) : (
              <FlatList
                data={filteredConversations}
                keyExtractor={(item) => item.id}
                style={styles.menuList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.menuItem,
                      item.id === selectedConversationId && styles.menuItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedConversationId(item.id);
                      setShowConversationList(false);
                    }}
                  >
                    <Text
                      style={[Typography.body, { color: colors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.title?.trim() || formatConversationDate(item.created_at)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Animated.View>
          <Pressable style={styles.menuBackdrop} onPress={closeMenu} />
        </View>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={6}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={[styles.messagesContent, { paddingBottom: Spacing.xxl + bottomPadding }]}
          showsVerticalScrollIndicator={false}
        >
          {showWelcome ? (
            <View style={styles.welcomeContainer}>
              <View style={styles.welcomeBadge}>
                <LinearGradient
                  colors={[...gradients.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.welcomeBadgeGradient}
                >
                  <IconSymbol name="moon.fill" size={40} color={colors.background} />
                </LinearGradient>
              </View>
              <Text style={[Typography.h2, { color: colors.text, textAlign: 'center' }]}>
                Sleep Coach
              </Text>
              <Text
                style={[
                  Typography.body,
                  { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
                ]}
              >
                {"I'm here to help with "}{baby.name}{"'s sleep. Ask me anything!"}
              </Text>

              <Text
                style={[
                  Typography.captionMedium,
                  { color: colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
                ]}
              >
                Conversation starters
              </Text>
              <View style={styles.chipsContainer}>
                {CONVERSATION_STARTERS.map((chip, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.chip}
                    onPress={() => {
                      track('ai_coach_chip_tap', { chip });
                      handleSendMessage(chip);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[Typography.caption, { color: colors.accent }]}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.adjustmentSection}>
                <Text
                  style={[
                    Typography.captionMedium,
                    { color: colors.textSecondary, marginBottom: Spacing.sm },
                  ]}
                >
                  AI Preferences
                </Text>
                <View style={styles.adjustmentGrid}>
                  {ADJUSTMENT_CONTROLS.map((ctrl) => {
                    const isActive = preferences?.[ctrl.key] === ctrl.value;
                    return (
                      <TouchableOpacity
                        key={`${ctrl.key}-${ctrl.value}`}
                        style={[
                          styles.adjustmentChip,
                          isActive && styles.adjustmentChipActive,
                        ]}
                        onPress={() =>
                          handlePreferenceToggle(ctrl.key, ctrl.value)
                        }
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            Typography.caption,
                            {
                              color: isActive
                                ? colors.background
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {ctrl.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : (
            <>
              {messages.map((message, index) => {
                const isLast = index === messages.length - 1;
                const content = <ChatMessageComponent key={message.id} message={message} />;
                if (!isLast) return content;
                return (
                  <View
                    key={message.id}
                    onLayout={(e) => {
                      const newCount = messages.length;
                      if (newCount > prevMessageCountRef.current) {
                        prevMessageCountRef.current = newCount;
                        const y = e.nativeEvent.layout.y;
                        scrollToTopOfLastMessage(y);
                      }
                    }}
                  >
                    {content}
                  </View>
                );
              })}
              {sending && <TypingIndicator />}
              {pendingSuggestedMemories != null && pendingSuggestedMemories.length > 0 && (
                <View style={styles.suggestedMemoriesCard}>
                  <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
                    Save these to memory for future recommendations?
                  </Text>
                  {pendingSuggestedMemories.map((text, i) => (
                    <Text key={i} style={[Typography.small, { color: colors.text, marginBottom: Spacing.xs }]}>
                      • {text}
                    </Text>
                  ))}
                  <View style={styles.suggestedMemoriesActions}>
                    <TouchableOpacity
                      style={[styles.suggestedMemoriesBtn, styles.suggestedMemoriesBtnSave]}
                      onPress={async () => {
                        await addMemories(pendingSuggestedMemories!);
                        track('coach_memory_save', { count: pendingSuggestedMemories!.length });
                        setPendingSuggestedMemories(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[Typography.captionMedium, { color: colors.background }]}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestedMemoriesBtn, styles.suggestedMemoriesBtnDiscard]}
                      onPress={() => {
                        setPendingSuggestedMemories(null);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[Typography.captionMedium, { color: colors.textSecondary }]}>{"Don't save"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        <ChatInput onSend={handleSendMessage} disabled={sending} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0918' },
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  keyboardView: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  menuButton: {
    padding: Spacing.xs,
    marginLeft: -Spacing.xs,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  menuOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuPanel: {
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.md,
    paddingBottom: Spacing.lg,
    flex: 0,
    alignSelf: 'stretch',
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  menuSearchInput: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    fontSize: 15,
  },
  menuNewButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
  },
  menuList: {
    flex: 1,
    marginTop: Spacing.xs,
  },
  menuItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  menuItemSelected: {
    backgroundColor: Colors.dark.accentSoft,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
  messagesContainer: { flex: 1 },
  messagesContent: { paddingVertical: Spacing.md, paddingBottom: Spacing.xxl },
  welcomeContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
  },
  welcomeBadge: { marginBottom: Spacing.md },
  welcomeBadgeGradient: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.accentSoft,
  },
  adjustmentSection: {
    marginTop: Spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  adjustmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  adjustmentChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  adjustmentChipActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  suggestedMemoriesCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  suggestedMemoriesActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  suggestedMemoriesBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  suggestedMemoriesBtnSave: {
    backgroundColor: Colors.dark.accent,
  },
  suggestedMemoriesBtnDiscard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});
