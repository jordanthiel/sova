/**
 * Sova Design System
 * A dark, night-sky inspired theme with glassmorphism and rich gradients.
 */

import { Platform } from 'react-native';

// ─── Color Palette ───────────────────────────────────────────────

export const Colors = {
  light: {
    // Core — we default to dark-mode-first for this design
    text: '#E8EDF2',
    textSecondary: '#9BAFC4',
    textTertiary: '#5E7389',
    background: '#0B1426',
    surface: 'rgba(255, 255, 255, 0.06)',
    surfaceElevated: 'rgba(255, 255, 255, 0.10)',
    surfaceSolid: '#132140',

    // Brand
    tint: '#4ECDC4',
    accent: '#4ECDC4',
    accentSoft: 'rgba(78, 205, 196, 0.15)',

    // Icons & Tab Bar
    icon: '#5E7389',
    tabIconDefault: '#5E7389',
    tabIconSelected: '#4ECDC4',

    // Sleep-specific
    sleepBlue: '#1A2E4A',
    napColor: '#FFB84D',
    napColorSoft: 'rgba(255, 184, 77, 0.15)',
    nightColor: '#5BA3E8',
    nightColorSoft: 'rgba(91, 163, 232, 0.15)',

    // Borders
    border: 'rgba(255, 255, 255, 0.08)',
    borderLight: 'rgba(255, 255, 255, 0.04)',

    // Semantic
    success: '#68D391',
    successSoft: 'rgba(104, 211, 145, 0.15)',
    warning: '#F6AD55',
    warningSoft: 'rgba(246, 173, 85, 0.15)',
    error: '#FC8181',
    errorSoft: 'rgba(252, 129, 129, 0.15)',

    // Chat
    chatUser: '#4ECDC4',
    chatUserText: '#FFFFFF',
    chatAssistant: 'rgba(255, 255, 255, 0.06)',
    chatAssistantText: '#E8EDF2',

    // Misc
    overlay: 'rgba(0, 0, 0, 0.6)',
    shimmer: 'rgba(255, 255, 255, 0.06)',

    // Moon / stars
    moonYellow: '#FFD93D',
    moonGlow: 'rgba(255, 217, 61, 0.25)',
    starWhite: '#FFFFFF',
  },
  dark: {
    // Core
    text: '#E8EDF2',
    textSecondary: '#9BAFC4',
    textTertiary: '#5E7389',
    background: '#0B1426',
    surface: 'rgba(255, 255, 255, 0.06)',
    surfaceElevated: 'rgba(255, 255, 255, 0.10)',
    surfaceSolid: '#132140',

    // Brand
    tint: '#4ECDC4',
    accent: '#4ECDC4',
    accentSoft: 'rgba(78, 205, 196, 0.15)',

    // Icons & Tab Bar
    icon: '#5E7389',
    tabIconDefault: '#5E7389',
    tabIconSelected: '#4ECDC4',

    // Sleep-specific
    sleepBlue: '#1A2E4A',
    napColor: '#FFB84D',
    napColorSoft: 'rgba(255, 184, 77, 0.15)',
    nightColor: '#5BA3E8',
    nightColorSoft: 'rgba(91, 163, 232, 0.15)',

    // Borders
    border: 'rgba(255, 255, 255, 0.08)',
    borderLight: 'rgba(255, 255, 255, 0.04)',

    // Semantic
    success: '#68D391',
    successSoft: 'rgba(104, 211, 145, 0.15)',
    warning: '#F6AD55',
    warningSoft: 'rgba(246, 173, 85, 0.15)',
    error: '#FC8181',
    errorSoft: 'rgba(252, 129, 129, 0.15)',

    // Chat
    chatUser: '#4ECDC4',
    chatUserText: '#FFFFFF',
    chatAssistant: 'rgba(255, 255, 255, 0.06)',
    chatAssistantText: '#E8EDF2',

    // Misc
    overlay: 'rgba(0, 0, 0, 0.6)',
    shimmer: 'rgba(255, 255, 255, 0.06)',

    // Moon / stars
    moonYellow: '#FFD93D',
    moonGlow: 'rgba(255, 217, 61, 0.25)',
    starWhite: '#FFFFFF',
  },
};

// ─── Gradients ───────────────────────────────────────────────────

export const Gradients = {
  light: {
    // Primary brand gradient
    accent: ['#4ECDC4', '#44A3AA'] as const,
    accentSoft: ['rgba(78, 205, 196, 0.2)', 'rgba(78, 205, 196, 0.05)'] as const,

    // Sleep type gradients
    nap: ['#FFB84D', '#FF9A3C'] as const,
    napSoft: ['rgba(255, 184, 77, 0.2)', 'rgba(255, 154, 60, 0.08)'] as const,
    night: ['#5BA3E8', '#818CF8'] as const,
    nightSoft: ['rgba(91, 163, 232, 0.2)', 'rgba(129, 140, 248, 0.08)'] as const,

    // Urgency / status
    urgent: ['#FC8181', '#F56565'] as const,
    success: ['#68D391', '#48BB78'] as const,

    // Surface / decorative
    hero: ['#0D2137', '#162B50'] as const,
    heroAccent: ['#1A3A5C', '#0D4B6E'] as const,
    warm: ['#F6D365', '#FDA085'] as const,
    cool: ['rgba(91, 163, 232, 0.15)', 'rgba(129, 140, 248, 0.08)'] as const,
    sunset: ['#FA709A', '#FEE140'] as const,
    moonGlow: ['rgba(255, 217, 61, 0.3)', 'rgba(255, 217, 61, 0)'] as const,

    // Card / glass overlays
    glassDark: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)'] as const,
    glassLight: ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.04)'] as const,

    // Background
    screenBackground: ['#0B1426', '#0D1B2A', '#101E30'] as const,
    cardBackground: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.03)'] as const,
  },
  dark: {
    accent: ['#4ECDC4', '#44A3AA'] as const,
    accentSoft: ['rgba(78, 205, 196, 0.2)', 'rgba(78, 205, 196, 0.05)'] as const,

    nap: ['#FFB84D', '#FF9A3C'] as const,
    napSoft: ['rgba(255, 184, 77, 0.2)', 'rgba(255, 154, 60, 0.08)'] as const,
    night: ['#5BA3E8', '#818CF8'] as const,
    nightSoft: ['rgba(91, 163, 232, 0.2)', 'rgba(129, 140, 248, 0.08)'] as const,

    urgent: ['#FC8181', '#F56565'] as const,
    success: ['#68D391', '#48BB78'] as const,

    hero: ['#0D2137', '#162B50'] as const,
    heroAccent: ['#1A3A5C', '#0D4B6E'] as const,
    warm: ['#F6D365', '#FDA085'] as const,
    cool: ['rgba(91, 163, 232, 0.15)', 'rgba(129, 140, 248, 0.08)'] as const,
    sunset: ['#FA709A', '#FEE140'] as const,
    moonGlow: ['rgba(255, 217, 61, 0.3)', 'rgba(255, 217, 61, 0)'] as const,

    glassDark: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.02)'] as const,
    glassLight: ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.04)'] as const,

    screenBackground: ['#0B1426', '#0D1B2A', '#101E30'] as const,
    cardBackground: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.03)'] as const,
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
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
  },
  /** Small axis (e.g. mini sparklines) */
  axisLabelSmall: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.15,
  },
  /** Tooltip title (e.g. day name) */
  tooltipTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  /** Tooltip value/secondary */
  tooltipValue: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  /** Legend label */
  legendLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.15,
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
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
