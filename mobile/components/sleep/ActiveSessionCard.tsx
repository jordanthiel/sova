import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Radius, Shadows, Spacing, Fonts } from '@/constants/theme';
import { useThemeGradients } from '@/hooks/use-theme-color';

interface ActiveSessionCardProps {
  sessionId: string;
  babyId: string;
  startTime: Date;
  type: 'nap' | 'night';
  /** When baby is napping: suggested cap time (ISO string) and copy for "Why?" */
  capSuggestion?: { capAt: string; reason: string; explanation: string } | null;
}

export function ActiveSessionCard({ sessionId, babyId, startTime, type, capSuggestion }: ActiveSessionCardProps) {
  const [duration, setDuration] = useState('00:00:00');
  const [whyExpanded, setWhyExpanded] = useState(false);
  const gradients = useThemeGradients();

  useEffect(() => {
    const updateTimer = () => {
      const diff = Date.now() - startTime.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDuration(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const isNap = type === 'nap';
  const gradientColors = isNap ? gradients.nap : gradients.night;
  const showCap = isNap && capSuggestion;

  const handlePress = () => {
    router.push({ pathname: '/log-sleep', params: { babyId, sessionId } });
  };

  return (
    <View style={[styles.wrapper, Shadows.md]}>
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.topRow}>
          <View style={styles.left}>
            <View style={styles.statusRow}>
              <View style={styles.liveDot} />
              <Text style={styles.label}>
                {isNap ? 'Nap in progress' : 'Night sleep'}
              </Text>
            </View>
            <Text style={[styles.timer, { fontFamily: Fonts?.mono }]}>{duration}</Text>
            {showCap && (
              <Text style={styles.capLine}>
                Cap by {format(new Date(capSuggestion.capAt), 'h:mm a')}
              </Text>
            )}
          </View>
          <Text style={styles.tapHint}>Manage →</Text>
        </TouchableOpacity>
        {showCap && (
          <View style={styles.whySection}>
            <TouchableOpacity
              style={styles.whyButton}
              onPress={() => setWhyExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.whyButtonText}>{whyExpanded ? 'Hide' : 'Why?'}</Text>
            </TouchableOpacity>
            {whyExpanded && (
              <View style={styles.whyContent}>
                <Text style={styles.whyReason}>{capSuggestion.reason}</Text>
                <Text style={styles.whyExplanation}>{capSuggestion.explanation}</Text>
              </View>
            )}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  gradient: {
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: Radius.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flex: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timer: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '200',
    color: '#FFFFFF',
  },
  capLine: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  tapHint: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  whySection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  whyButton: {
    alignSelf: 'flex-start',
  },
  whyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  whyContent: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  whyReason: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  whyExplanation: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 16,
  },
});
