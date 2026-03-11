/**
 * Theme hooks — always dark mode for Sova's night-sky design.
 */

import { Colors, Gradients } from '@/constants/theme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // Always use dark theme for our night-sky design
  const colorFromProps = props.dark;
  if (colorFromProps) {
    return colorFromProps;
  }
  return Colors.dark[colorName];
}

/**
 * Returns the full color set (always dark theme).
 */
export function useThemeColors() {
  return Colors.dark;
}

/**
 * Returns the gradient set (always dark theme).
 */
export function useThemeGradients() {
  return Gradients.dark;
}
