import { useState } from 'react';
import { StyleSheet, ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ParentList } from '@/components/baby/ParentList';
import { BabyShareModal } from '@/components/baby/BabyShareModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export default function BabyShareScreen() {
  const { babyId } = useLocalSearchParams<{ babyId: string }>();
  const [modalVisible, setModalVisible] = useState(false);
  const colors = useThemeColors();

  if (!babyId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState icon="exclamationmark.triangle.fill" title="Invalid Baby" message="No baby ID was provided." />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ParentList babyId={babyId} onInvitePress={() => setModalVisible(true)} />
      </ScrollView>
      <BabyShareModal
        visible={modalVisible}
        babyId={babyId}
        onClose={() => setModalVisible(false)}
        onSuccess={() => {
          // Refresh parent list
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
});
