/**
 * Sova Design System
 * A near-black navy theme with restrained blue accents.
 */

import { Platform } from 'react-native';

// ─── Color Palette ───────────────────────────────────────────────

export const Colors = {
  light: {
    // Core — we default to dark-mode-first for this design
    text: '#F5F8FF',
    textSecondary: '#AAB7D6',
    textTertiary: '#6E7A96',
    background: '#030509',
    surface: 'rgba(14, 18, 28, 0.96)',
    surfaceElevated: 'rgba(18, 24, 36, 0.98)',
    surfaceSolid: '#090C12',

    // Brand
    tint: '#66A8FF',
    accent: '#66A8FF',
    accentSoft: 'rgba(102, 168, 255, 0.18)',

    // Icons & Tab Bar
    icon: '#7783A0',
    tabIconDefault: '#7783A0',
    tabIconSelected: '#66A8FF',

    // Sleep-specific
    sleepBlue: '#10203B',
    napColor: '#E7BE79',
    napColorSoft: 'rgba(231, 190, 121, 0.16)',
    nightColor: '#7FB3FF',
    nightColorSoft: 'rgba(127, 179, 255, 0.18)',

    // Borders
    border: 'rgba(255, 255, 255, 0.045)',
    borderLight: 'rgba(255, 255, 255, 0.025)',

    // Semantic
    success: '#6FD9A6',
    successSoft: 'rgba(111, 217, 166, 0.16)',
    warning: '#F2B567',
    warningSoft: 'rgba(242, 181, 103, 0.16)',
    error: '#F08585',
    errorSoft: 'rgba(240, 133, 133, 0.16)',

    // Chat
    chatUser: '#4F8FFF',
    chatUserText: '#FFFFFF',
    chatAssistant: 'rgba(255, 255, 255, 0.06)',
    chatAssistantText: '#F5F1FF',

    // Misc
    overlay: 'rgba(0, 0, 0, 0.64)',
    shimmer: 'rgba(102, 168, 255, 0.10)',

    // Moon / stars
    moonYellow: '#F5C978',
    moonGlow: 'rgba(245, 201, 120, 0.22)',
    starWhite: '#FFFFFF',
  },
  dark: {
    // Core
    text: '#F5F8FF',
    textSecondary: '#AAB7D6',
    textTertiary: '#6E7A96',
    background: '#030509',
    surface: 'rgba(14, 18, 28, 0.96)',
    surfaceElevated: 'rgba(18, 24, 36, 0.98)',
    surfaceSolid: '#090C12',

    // Brand
    tint: '#66A8FF',
    accent: '#66A8FF',
    accentSoft: 'rgba(102, 168, 255, 0.18)',

    // Icons & Tab Bar
    icon: '#7783A0',
    tabIconDefault: '#7783A0',
    tabIconSelected: '#66A8FF',

    // Sleep-specific
    sleepBlue: '#10203B',
    napColor: '#E7BE79',
    napColorSoft: 'rgba(231, 190, 121, 0.16)',
    nightColor: '#7FB3FF',
    nightColorSoft: 'rgba(127, 179, 255, 0.18)',

    // Borders
    border: 'rgba(255, 255, 255, 0.045)',
    borderLight: 'rgba(255, 255, 255, 0.025)',

    // Semantic
    success: '#6FD9A6',
    successSoft: 'rgba(111, 217, 166, 0.16)',
    warning: '#F2B567',
    warningSoft: 'rgba(242, 181, 103, 0.16)',
    error: '#F08585',
    errorSoft: 'rgba(240, 133, 133, 0.16)',

    // Chat
    chatUser: '#4F8FFF',
    chatUserText: '#FFFFFF',
    chatAssistant: 'rgba(255, 255, 255, 0.06)',
    chatAssistantText: '#F5F1FF',

    // Misc
    overlay: 'rgba(0, 0, 0, 0.64)',
    shimmer: 'rgba(102, 168, 255, 0.10)',

    // Moon / stars
    moonYellow: '#F5C978',
    moonGlow: 'rgba(245, 201, 120, 0.22)',
    starWhite: '#FFFFFF',
  },
};

// ─── Gradients ───────────────────────────────────────────────────

export const Gradients = {
  light: {
    // Primary brand gradient
    accent: ['#7CB8FF', '#3B82F6'] as const,
    accentSoft: ['rgba(124, 184, 255, 0.24)', 'rgba(59, 130, 246, 0.08)'] as const,

    // Sleep type gradients
    nap: ['#E9CB8A', '#D89A63'] as const,
    napSoft: ['rgba(233, 203, 138, 0.22)', 'rgba(216, 154, 99, 0.08)'] as const,
    night: ['#A7C8FF', '#5E8FFF'] as const,
    nightSoft: ['rgba(167, 200, 255, 0.24)', 'rgba(94, 143, 255, 0.08)'] as const,

    // Urgency / status
    urgent: ['#F29C9C', '#E36E6E'] as const,
    success: ['#6FD9A6', '#45B97B'] as const,

    // Surface / decorative
    hero: ['#030509', '#070B14'] as const,
    heroAccent: ['#0A101D', '#121A2B'] as const,
    warm: ['#E9CB8A', '#D18D78'] as const,
    cool: ['rgba(124, 184, 255, 0.20)', 'rgba(42, 73, 138, 0.08)'] as const,
    sunset: ['#8DB7FF', '#4B7DFF'] as const,
    moonGlow: ['rgba(124, 184, 255, 0.28)', 'rgba(124, 184, 255, 0)'] as const,

    // Card / glass overlays
    glassDark: ['rgba(255, 255, 255, 0.012)', 'rgba(6, 8, 13, 0.985)'] as const,
    glassLight: ['rgba(255, 255, 255, 0.02)', 'rgba(8, 11, 18, 0.99)'] as const,

    // Background
    screenBackground: ['#030509', '#060911', '#0B1020'] as const,
    cardBackground: ['rgba(16, 20, 31, 0.98)', 'rgba(8, 11, 18, 0.99)'] as const,
  },
  dark: {
    accent: ['#7CB8FF', '#3B82F6'] as const,
    accentSoft: ['rgba(124, 184, 255, 0.24)', 'rgba(59, 130, 246, 0.08)'] as const,

    nap: ['#E9CB8A', '#D89A63'] as const,
    napSoft: ['rgba(233, 203, 138, 0.22)', 'rgba(216, 154, 99, 0.08)'] as const,
    night: ['#A7C8FF', '#5E8FFF'] as const,
    nightSoft: ['rgba(167, 200, 255, 0.24)', 'rgba(94, 143, 255, 0.08)'] as const,

    urgent: ['#F29C9C', '#E36E6E'] as const,
    success: ['#6FD9A6', '#45B97B'] as const,

    hero: ['#030509', '#070B14'] as const,
    heroAccent: ['#0A101D', '#121A2B'] as const,
    warm: ['#E9CB8A', '#D18D78'] as const,
    cool: ['rgba(124, 184, 255, 0.20)', 'rgba(42, 73, 138, 0.08)'] as const,
    sunset: ['#8DB7FF', '#4B7DFF'] as const,
    moonGlow: ['rgba(124, 184, 255, 0.28)', 'rgba(124, 184, 255, 0)'] as const,

    glassDark: ['rgba(255, 255, 255, 0.012)', 'rgba(6, 8, 13, 0.985)'] as const,
    glassLight: ['rgba(255, 255, 255, 0.02)', 'rgba(8, 11, 18, 0.99)'] as const,

    screenBackground: ['#030509', '#060911', '#0B1020'] as const,
    cardBackground: ['rgba(16, 20, 31, 0.98)', 'rgba(8, 11, 18, 0.99)'] as const,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ─── Border Radii ────────────────────────────────────────────────

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
} as const;

// ─── Typography ──────────────────────────────────────────────────

export const Typography = {
  h1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
  },
  h2: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
  },
  h3: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
  },
  bodySemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
  captionMedium: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  small: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  buttonSmall: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  timer: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '300' as const,
  },
  timerLarge: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '200' as const,
  },
} as const;

// ─── Chart styles (axis labels, tooltips, legends) ─────────────────

export const ChartTypography = {
  /** X/Y axis labels — readable, not cramped */
  axisLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  /** Small axis (e.g. mini sparklines) */
  axisLabelSmall: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  /** Tooltip title (e.g. day name) */
  tooltipTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  /** Tooltip value/secondary */
  tooltipValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  /** Legend label */
  legendLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
} as const;

// ─── Shadows ─────────────────────────────────────────────────────

export const Shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    android: {
      elevation: 3,
    },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    },
    android: {
      elevation: 6,
    },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
    },
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
    android: {
      elevation: 12,
    },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
  }),
  glow: (color: string) =>
    Platform.select({
      ios: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
    }),
};

// ─── Fonts ───────────────────────────────────────────────────────

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
    /** Use for Text that shows emoji so they render (avoids icon font inheritance). */
    emoji: 'System',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    emoji: undefined,
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    emoji: "system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
  },
});

/** Apply to any Text that displays emoji so they render correctly (system font, not icon font). */
export const EmojiText = { fontFamily: Fonts?.emoji } as const;
