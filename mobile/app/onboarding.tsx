import { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';

interface OnboardingPage {
  emoji: string;
  title: string;
  description: string;
  accent: string;
}

type IconName = import('@/components/ui/icon-symbol').IconSymbolName;

const PAGES: (Omit<OnboardingPage, 'emoji'> & { icon: IconName })[] = [
  {
    icon: 'house.fill',
    title: 'Today Tab',
    description:
      'See your baby\'s current sleep status at a glance. Get AI-powered nap recommendations, one-tap logging, and a live wake window tracker.',
    accent: '#4ECDC4',
  },
  {
    icon: 'list.clipboard',
    title: 'Log Tab',
    description:
      'Browse sleep history day by day. Log naps, night sleep, feeds, diapers, and medications. Tap the + button anytime.',
    accent: '#FFB84D',
  },
  {
    icon: 'message.fill',
    title: 'AI Coach',
    description:
      'Chat with your personal sleep coach. Ask about nap timing, bedtime, wake windows, or nap transitions — and get personalized answers.',
    accent: '#5BA3E8',
  },
  {
    icon: 'sparkles',
    title: 'Insights',
    description:
      'AI surfaces sleep patterns, consistency metrics, and actionable suggestions. Apply suggestions directly to improve your baby\'s routine.',
    accent: '#818CF8',
  },
  {
    icon: 'gearshape.fill',
    title: 'Settings',
    description:
      'Manage your baby\'s profile, invite caregivers, customize AI preferences, and set up notification reminders.',
    accent: '#68D391',
  },
];

export default function OnboardingScreen() {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const handleNext = () => {
    Haptics.selectionAsync();
    if (currentPage < PAGES.length - 1) {
      scrollRef.current?.scrollTo({
        x: (currentPage + 1) * SCREEN_WIDTH,
        animated: true,
      });
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    router.replace('/(tabs)');
  };

  const isLast = currentPage === PAGES.length - 1;
  const page = PAGES[currentPage];

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#0B1426', '#0D1B2A', '#101E30']}
        style={StyleSheet.absoluteFill}
      />

      {/* Skip button */}
      <View style={styles.skipRow}>
        {!isLast && (
          <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {PAGES.map((p, i) => (
          <View key={i} style={styles.page}>
            <View
              style={[
                styles.emojiCircle,
                { backgroundColor: `${p.accent}20`, borderColor: `${p.accent}40` },
              ]}
            >
              <IconSymbol name={p.icon} size={56} color={p.accent} />
            </View>
            <Text style={[Typography.h1, styles.title]}>{p.title}</Text>
            <Text style={[Typography.body, styles.description]}>
              {p.description}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots + Action */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentPage && {
                  backgroundColor: page.accent,
                  width: 24,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: page.accent }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export async function shouldShowOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return val !== 'true';
  } catch {
    return true;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1426',
  },
  skipRow: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  skipText: {
    ...Typography.bodyMedium,
    color: '#9BAFC4',
  },
  page: {
    width: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emojiCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    color: '#E8EDF2',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    color: '#9BAFC4',
    textAlign: 'center',
    lineHeight: 26,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  nextButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  nextText: {
    ...Typography.button,
    color: '#0B1426',
  },
});
