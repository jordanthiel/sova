import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { BabySwitcher } from '@/components/baby/BabySwitcher';
import { ProfileAvatarButton } from '@/components/ProfileAvatarButton';
import { TrendsTab } from '@/components/insights/TrendsTab';
import { InsightsTab } from '@/components/insights/InsightsTab';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useBabies } from '@/hooks/useBabies';
import { useRealtimeCaregivers } from '@/hooks/useRealtimeCaregivers';
import { useSleepData } from '@/hooks/useSleepData';
import { useRealtimeSleepSessions } from '@/hooks/useRealtimeSleepSessions';
import { track } from '@/services/analytics/track';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

type TabId = 'trends' | 'insights';

export default function InsightsScreen() {
  const { babies, loading: babiesLoading } = useBabies();
  const { currentBabyId, setCurrentBabyId } = useCurrentBaby();
  const { baby, ageDays } = useSleepData({ babyId: currentBabyId });
  const { sessions: allSessions } = useRealtimeSleepSessions(currentBabyId);
  const { caregivers } = useRealtimeCaregivers(currentBabyId);
  const [activeTab, setActiveTab] = useState<TabId>('trends');
  const colors = useThemeColors();

  useEffect(() => {
    if (!babiesLoading && babies.length > 0 && !currentBabyId) {
      setCurrentBabyId(babies[0].id);
    }
  }, [babies, babiesLoading, currentBabyId, setCurrentBabyId]);

  useFocusEffect(
    useCallback(() => {
      track('view_insights', { babyId: currentBabyId });
    }, [currentBabyId])
  );

  const ageMonths = Math.floor(ageDays / 30);

  if (babiesLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard style={{ marginBottom: Spacing.md }} />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    );
  }

  if (babies.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
        <EmptyState
          icon="✨"
          title="Select a baby"
          message="Choose a baby to view insights and recommendations."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <BabySwitcher
          currentBabyId={currentBabyId}
          babies={babies}
          onBabyChange={(id) => {
            track('switch_baby', { babyId: id });
            setCurrentBabyId(id);
          }}
        />
        <ProfileAvatarButton />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trends' && styles.tabActive]}
          onPress={() => setActiveTab('trends')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              Typography.captionMedium,
              { color: activeTab === 'trends' ? '#0B1426' : colors.textSecondary },
            ]}
          >
            Trends
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'insights' && styles.tabActive]}
          onPress={() => setActiveTab('insights')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              Typography.captionMedium,
              { color: activeTab === 'insights' ? '#0B1426' : colors.textSecondary },
            ]}
          >
            Insights
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab content */}
      {activeTab === 'trends' ? (
        currentBabyId && baby ? (
          <TrendsTab sessions={allSessions} ageMonths={ageMonths} caregivers={caregivers} />
        ) : (
          <View style={styles.loadingContainer}>
            <SkeletonCard />
          </View>
        )
      ) : (
        <InsightsTab />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1426',
  },
  loadingContainer: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: '#4ECDC4',
  },
});
