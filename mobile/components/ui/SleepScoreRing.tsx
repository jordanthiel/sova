import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Typography } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-color';

export function scoreColor(score: number): string {
  if (score >= 80) return '#68D391';
  if (score >= 60) return '#C7AEFF';
  if (score >= 40) return '#F6AD55';
  return '#FC8181';
}

interface SleepScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

/** Circular progress ring showing sleep score as % (0–100). */
export function SleepScoreRing({
  score,
  size = 48,
  strokeWidth,
  showLabel = false,
}: SleepScoreRingProps) {
  const colors = useThemeColors();
  const r = (size - (strokeWidth ?? Math.max(2, size / 12))) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = strokeWidth ?? Math.max(2, size / 12);
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(100, Math.max(0, score)) / 100;
  const dashOffset = circumference * (1 - progress);
  const trackColor = colors.borderLight ?? 'rgba(255,255,255,0.08)';
  const fillColor = scoreColor(score);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Track */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* Progress ring — start from top: rotate -90 so 0 is at top */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={fillColor}
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[styles.center, { width: size, height: size }]}>
          <Text
            style={[
              size <= 28 ? Typography.small : size <= 40 ? Typography.caption : Typography.bodyMedium,
              { color: colors.text, fontWeight: '600' },
            ]}
            numberOfLines={1}
          >
            {Math.round(score)}%
          </Text>
        </View>
      </View>
      {showLabel && (
        <Text style={[Typography.small, { color: colors.textTertiary, marginTop: 4 }]}>
          Night score
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
