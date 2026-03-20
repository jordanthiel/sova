import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { Radius, Shadows, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';
import { useBabies } from '@/hooks/useBabies';
import { track } from '@/services/analytics/track';
import { SkeletonLoader } from '@/components/ui/SkeletonLoader';

function BabyRowShimmer() {
  return (
    <View style={styles.babyRowShimmer}>
      <SkeletonLoader width={40} height={40} borderRadius={20} />
      <SkeletonLoader width={120} height={18} style={{ marginLeft: Spacing.md }} />
    </View>
  );
}

export default function SelectBabyScreen() {
  const colors = useThemeColors();
  const { currentBabyId, setCurrentBabyId } = useCurrentBaby();
  const { babies, loading } = useBabies();

  const handleSelect = (babyId: string) => {
    setCurrentBabyId(babyId);
    track('switch_baby', { babyId });
    router.back();
  };

  const handleAddBaby = () => {
    router.back();
    router.push('/baby-setup');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: colors.textSecondary }]}>×</Text>
          </TouchableOpacity>
          <Text style={[Typography.h3, { color: colors.text }]}>Switch baby</Text>
          <View style={styles.closeBtn} />
        </View>
        <View style={styles.content}>
          <BabyRowShimmer />
          <BabyRowShimmer />
          <BabyRowShimmer />
        </View>
      </SafeAreaView>
    );
  }

  if (babies.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: colors.textSecondary }]}>×</Text>
          </TouchableOpacity>
          <Text style={[Typography.h3, { color: colors.text }]}>Switch baby</Text>
          <View style={styles.closeBtn} />
        </View>
        <View style={styles.empty}>
          <Text style={[Typography.bodyMedium, { color: colors.textSecondary }]}>No babies yet</Text>
          <TouchableOpacity style={[styles.addButton, { borderColor: colors.border }]} onPress={handleAddBaby}>
            <Text style={[Typography.bodyMedium, { color: colors.accent }]}>+ Add new baby</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Text style={[styles.closeText, { color: colors.textSecondary }]}>×</Text>
        </TouchableOpacity>
        <Text style={[Typography.h3, { color: colors.text }]}>Switch baby</Text>
        <View style={styles.closeBtn} />
      </View>
      <View style={styles.content}>
        {babies.map((baby) => {
          const isActive = currentBabyId === baby.id;
          return (
            <TouchableOpacity
              key={baby.id}
              style={[
                styles.babyRow,
                { backgroundColor: isActive ? colors.accent : colors.accentSoft },
              ]}
              activeOpacity={0.7}
              onPress={() => handleSelect(baby.id)}
            >
              <Avatar
                name={baby.name}
                size={40}
                backgroundColor={isActive ? 'rgba(255,255,255,0.2)' : undefined}
                textColor={isActive ? '#FFFFFF' : undefined}
              />
              <Text
                style={[
                  Typography.bodyLarge,
                  { color: isActive ? '#0B1426' : colors.text, marginLeft: Spacing.md },
                ]}
              >
                {baby.name}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.addButton, { borderColor: colors.border }]}
          onPress={handleAddBaby}
          activeOpacity={0.7}
        >
          <Text style={[Typography.bodyMedium, { color: colors.accent }]}>+ Add new baby</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
  },
  content: {
    padding: Spacing.md,
  },
  babyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  babyRowShimmer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  empty: {
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
});
