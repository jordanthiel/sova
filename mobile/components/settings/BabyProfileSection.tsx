import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';
import { getBabyPhotoUri, pickBabyPhoto, uploadBabyPhoto } from '@/services/photoUpload';
import type { Baby } from '@/types/domain';
import { calculateAgeDays } from '@/utils/wakeWindowCalculator';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface BabyProfileSectionProps {
  baby: Baby;
  onEditName?: () => void;
}

const SLEEP_GOAL_OPTIONS = [
  'Better naps',
  'Earlier bedtime',
  'Less night wakes',
  'Consistent schedule',
  'Nap transition',
];

export function BabyProfileSection({ baby, onEditName }: BabyProfileSectionProps) {
  const colors = useThemeColors();
  const ageDays = calculateAgeDays(baby.birthdate);
  const ageMonths = Math.floor(ageDays / 30);
  const ageDaysRemainder = ageDays % 30;
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    getBabyPhotoUri(baby.id).then(setPhotoUri);
  }, [baby.id]);

  const handlePickPhoto = async () => {
    try {
      const uri = await pickBabyPhoto();
      if (!uri) return;
      setPhotoUri(uri);
      const uploaded = await uploadBabyPhoto(baby.id, uri);
      setPhotoUri(uploaded);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload photo');
    }
  };

  return (
    <Card padding="lg">
      <View style={styles.profileRow}>
        <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.7}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <Avatar name={baby.name} size={64} />
          )}
          <View style={styles.cameraBadge}>
            <IconSymbol name="camera.fill" size={12} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <TouchableOpacity onPress={onEditName} activeOpacity={0.7}>
            <Text style={[Typography.h2, { color: colors.text }]}>{baby.name}</Text>
          </TouchableOpacity>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            {ageMonths > 0
              ? `${ageMonths} month${ageMonths !== 1 ? 's' : ''}`
              : ''}
            {ageMonths > 0 && ageDaysRemainder > 0 ? ', ' : ''}
            {ageDaysRemainder > 0
              ? `${ageDaysRemainder} day${ageDaysRemainder !== 1 ? 's' : ''}`
              : ''}
            {ageDays === 0 ? 'Newborn' : ' old'}
          </Text>
          <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 2 }]}>
            Born {format(new Date(baby.birthdate), 'MMMM d, yyyy')}
          </Text>
        </View>
      </View>

      {/* <View style={styles.goalsSection}>
        <Text
          style={[
            Typography.captionMedium,
            { color: colors.textSecondary, marginBottom: Spacing.sm },
          ]}
        >
          Sleep Goals
        </Text>
        <View style={styles.chips}>
          {SLEEP_GOAL_OPTIONS.map((goal) => {
            const isSelected = baby.preferences.sleepGoals.includes(goal);
            return (
              <View
                key={goal}
                style={[
                  styles.chip,
                  isSelected && {
                    backgroundColor: 'rgba(199, 174, 255, 0.15)',
                    borderColor: 'rgba(199, 174, 255, 0.3)',
                  },
                ]}
              >
                <Text
                  style={[
                    Typography.caption,
                    { color: isSelected ? colors.accent : colors.textTertiary },
                  ]}
                >
                  {goal}
                </Text>
              </View>
            );
          })}
        </View>
      </View> */}
    </Card>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profileInfo: {
    flex: 1,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#132140',
    borderWidth: 2,
    borderColor: '#0D1B2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalsSection: {
    marginTop: Spacing.lg,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
});
