import { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/SkeletonLoader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Divider } from '@/components/ui/Divider';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import type { Database } from '@/lib/supabase';

type BabyParent = Database['public']['Tables']['baby_parents']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

interface ParentListProps {
  babyId: string;
  onInvitePress: () => void;
}

export function ParentList({ babyId, onInvitePress }: ParentListProps) {
  const [parents, setParents] = useState<(BabyParent & { profile: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const colors = useThemeColors();

  useEffect(() => {
    loadParents();
  }, [babyId]);

  const loadParents = async () => {
    try {
      const { data, error } = await supabase
        .from('baby_parents')
        .select(`*, profiles:parent_id (id, email, full_name)`)
        .eq('baby_id', babyId)
        .eq('status', 'accepted');

      if (error) throw error;

      const parentsWithProfiles = (data || []).map((item: any) => ({
        ...item,
        profile: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
      }));
      setParents(parentsWithProfiles);
    } catch (error) {
      console.error('Error loading parents:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonCard style={{ marginBottom: Spacing.sm }} />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[Typography.h3, { color: colors.text }]}>Parents</Text>
        <Button title="+ Invite" onPress={onInvitePress} variant="secondary" size="sm" />
      </View>

      {parents.length === 0 ? (
        <EmptyState icon="people.fill" title="No parents" message="Invite someone to share access to this baby's data." />
      ) : (
        parents.map((parent, index) => (
          <View key={parent.id}>
            <Card padding="md" style={styles.parentCard}>
              <View style={styles.parentRow}>
                <Avatar name={parent.profile?.full_name || parent.profile?.email || '?'} size={40} />
                <View style={styles.parentInfo}>
                  <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                    {parent.profile?.full_name || parent.profile?.email || 'Unknown'}
                  </Text>
                  {parent.profile?.email && parent.profile?.full_name && (
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                      {parent.profile.email}
                    </Text>
                  )}
                </View>
                <Badge
                  label={parent.role}
                  backgroundColor={parent.role === 'owner' ? colors.accentSoft : colors.successSoft}
                  color={parent.role === 'owner' ? colors.accent : colors.success}
                />
              </View>
            </Card>
            {index < parents.length - 1 && <View style={{ height: Spacing.sm }} />}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  parentCard: {},
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  parentInfo: {
    flex: 1,
  },
});
