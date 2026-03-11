/**
 * Shared config for react-native-gifted-charts.
 * Keeps bar/line charts consistent and modern across the app.
 */
import { ChartTypography } from './theme';

const BAR_RADIUS = 8;
const SPACING = 24;
const INITIAL_SPACING = 20;
const END_SPACING = 20;

export const chartConfig = {
  barRadius: BAR_RADIUS,
  barBorderTopLeftRadius: BAR_RADIUS,
  barBorderTopRightRadius: BAR_RADIUS,
  spacing: SPACING,
  initialSpacing: INITIAL_SPACING,
  endSpacing: END_SPACING,
  noOfSections: 4,
  hideRules: true,
} as const;

export function getBarChartAxisStyles(colors: { textTertiary: string; borderLight: string }) {
  return {
    xAxisLabelTextStyle: { ...ChartTypography.axisLabel, color: colors.textTertiary },
    yAxisTextStyle: { ...ChartTypography.axisLabel, color: colors.textTertiary },
    xAxisColor: colors.borderLight,
    yAxisColor: colors.borderLight,
  };
}

export function getTooltipContainerStyle(colors: { surfaceElevated: string }) {
  return {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center' as const,
    minWidth: 80,
  };
}
