/**
 * Sova Design System
 * A dark, night-sky inspired theme with glassmorphism and rich gradients.
 */

import { Platform } from 'react-native';

// ─── Color Palette ───────────────────────────────────────────────

export const Colors = {
  light: {
    // Core — we default to dark-mode-first for this design
    text: '#F5F1FF',
    textSecondary: '#C0B4DE',
    textTertiary: '#7D719C',
    background: '#0D0918',
    surface: 'rgba(255, 255, 255, 0.06)',
    surfaceElevated: 'rgba(255, 255, 255, 0.10)',
    surfaceSolid: '#171129',

    // Brand
    tint: '#C7AEFF',
    accent: '#C7AEFF',
    accentSoft: 'rgba(199, 174, 255, 0.16)',

    // Icons & Tab Bar
    icon: '#7D719C',
    tabIconDefault: '#7D719C',
    tabIconSelected: '#C7AEFF',

    // Sleep-specific
    sleepBlue: '#231A45',
    napColor: '#F4BC73',
    napColorSoft: 'rgba(244, 188, 115, 0.16)',
    nightColor: '#9D8BFF',
    nightColorSoft: 'rgba(157, 139, 255, 0.18)',

    // Borders
    border: 'rgba(199, 174, 255, 0.16)',
    borderLight: 'rgba(199, 174, 255, 0.08)',

    // Semantic
    success: '#68D391',
    successSoft: 'rgba(104, 211, 145, 0.15)',
    warning: '#F6AD55',
    warningSoft: 'rgba(246, 173, 85, 0.15)',
    error: '#FC8181',
    errorSoft: 'rgba(252, 129, 129, 0.15)',

    // Chat
    chatUser: '#B996FF',
    chatUserText: '#FFFFFF',
    chatAssistant: 'rgba(255, 255, 255, 0.06)',
    chatAssistantText: '#F5F1FF',

    // Misc
    overlay: 'rgba(0, 0, 0, 0.6)',
    shimmer: 'rgba(199, 174, 255, 0.08)',

    // Moon / stars
    moonYellow: '#F5C36A',
    moonGlow: 'rgba(245, 195, 106, 0.22)',
    starWhite: '#FFFFFF',
  },
  dark: {
    // Core
    text: '#F5F1FF',
    textSecondary: '#C0B4DE',
    textTertiary: '#7D719C',
    background: '#0D0918',
    surface: 'rgba(255, 255, 255, 0.06)',
    surfaceElevated: 'rgba(255, 255, 255, 0.10)',
    surfaceSolid: '#171129',

    // Brand
    tint: '#C7AEFF',
    accent: '#C7AEFF',
    accentSoft: 'rgba(199, 174, 255, 0.16)',

    // Icons & Tab Bar
    icon: '#7D719C',
    tabIconDefault: '#7D719C',
    tabIconSelected: '#C7AEFF',

    // Sleep-specific
    sleepBlue: '#231A45',
    napColor: '#F4BC73',
    napColorSoft: 'rgba(244, 188, 115, 0.16)',
    nightColor: '#9D8BFF',
    nightColorSoft: 'rgba(157, 139, 255, 0.18)',

    // Borders
    border: 'rgba(199, 174, 255, 0.16)',
    borderLight: 'rgba(199, 174, 255, 0.08)',

    // Semantic
    success: '#68D391',
    successSoft: 'rgba(104, 211, 145, 0.15)',
    warning: '#F6AD55',
    warningSoft: 'rgba(246, 173, 85, 0.15)',
    error: '#FC8181',
    errorSoft: 'rgba(252, 129, 129, 0.15)',

    // Chat
    chatUser: '#B996FF',
    chatUserText: '#FFFFFF',
    chatAssistant: 'rgba(255, 255, 255, 0.06)',
    chatAssistantText: '#F5F1FF',

    // Misc
    overlay: 'rgba(0, 0, 0, 0.6)',
    shimmer: 'rgba(199, 174, 255, 0.08)',

    // Moon / stars
    moonYellow: '#F5C36A',
    moonGlow: 'rgba(245, 195, 106, 0.22)',
    starWhite: '#FFFFFF',
  },
};

// ─── Gradients ───────────────────────────────────────────────────

export const Gradients = {
  light: {
    // Primary brand gradient
    accent: ['#E4D7FF', '#9B6BFF'] as const,
    accentSoft: ['rgba(199, 174, 255, 0.24)', 'rgba(155, 107, 255, 0.08)'] as const,

    // Sleep type gradients
    nap: ['#F4C17D', '#E39A63'] as const,
    napSoft: ['rgba(244, 193, 125, 0.22)', 'rgba(227, 154, 99, 0.08)'] as const,
    night: ['#C9B3FF', '#7E5BFF'] as const,
    nightSoft: ['rgba(201, 179, 255, 0.24)', 'rgba(126, 91, 255, 0.08)'] as const,

    // Urgency / status
    urgent: ['#FC8181', '#F56565'] as const,
    success: ['#68D391', '#48BB78'] as const,

    // Surface / decorative
    hero: ['#151028', '#1D1537'] as const,
    heroAccent: ['#241A44', '#6F46F7'] as const,
    warm: ['#F4C17D', '#E88C7D'] as const,
    cool: ['rgba(185, 150, 255, 0.18)', 'rgba(111, 70, 247, 0.08)'] as const,
    sunset: ['#E99BFF', '#8B5CF6'] as const,
    moonGlow: ['rgba(199, 174, 255, 0.28)', 'rgba(199, 174, 255, 0)'] as const,

    // Card / glass overlays
    glassDark: ['rgba(72, 44, 132, 0.22)', 'rgba(19, 14, 36, 0.92)'] as const,
    glassLight: ['rgba(81, 52, 150, 0.22)', 'rgba(25, 18, 48, 0.94)'] as const,

    // Background
    screenBackground: ['#0D0918', '#151028', '#1B1434'] as const,
    cardBackground: ['rgba(90, 63, 158, 0.22)', 'rgba(24, 18, 44, 0.92)'] as const,
  },
  dark: {
    accent: ['#E4D7FF', '#9B6BFF'] as const,
    accentSoft: ['rgba(199, 174, 255, 0.24)', 'rgba(155, 107, 255, 0.08)'] as const,

    nap: ['#F4C17D', '#E39A63'] as const,
    napSoft: ['rgba(244, 193, 125, 0.22)', 'rgba(227, 154, 99, 0.08)'] as const,
    night: ['#C9B3FF', '#7E5BFF'] as const,
    nightSoft: ['rgba(201, 179, 255, 0.24)', 'rgba(126, 91, 255, 0.08)'] as const,

    urgent: ['#FC8181', '#F56565'] as const,
    success: ['#68D391', '#48BB78'] as const,

    hero: ['#151028', '#1D1537'] as const,
    heroAccent: ['#241A44', '#6F46F7'] as const,
    warm: ['#F4C17D', '#E88C7D'] as const,
    cool: ['rgba(185, 150, 255, 0.18)', 'rgba(111, 70, 247, 0.08)'] as const,
    sunset: ['#E99BFF', '#8B5CF6'] as const,
    moonGlow: ['rgba(199, 174, 255, 0.28)', 'rgba(199, 174, 255, 0)'] as const,

    glassDark: ['rgba(72, 44, 132, 0.22)', 'rgba(19, 14, 36, 0.92)'] as const,
    glassLight: ['rgba(81, 52, 150, 0.22)', 'rgba(25, 18, 48, 0.94)'] as const,

    screenBackground: ['#0D0918', '#151028', '#1B1434'] as const,
    cardBackground: ['rgba(90, 63, 158, 0.22)', 'rgba(24, 18, 44, 0.92)'] as const,
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
