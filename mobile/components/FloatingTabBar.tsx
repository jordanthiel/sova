import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Shadows } from '@/constants/theme';
import { useCurrentBaby } from '@/contexts/CurrentBabyContext';

const VISIBLE_ROUTES = ['index', 'log', 'coach', 'insights'] as const;
const ROUTE_CONFIG: Record<string, { title: string; icon: 'house.fill' | 'calendar' | 'message.fill' | 'sparkles' }> = {
  index: { title: 'Today', icon: 'house.fill' },
  log: { title: 'Log', icon: 'calendar' },
  coach: { title: 'Coach', icon: 'message.fill' },
  insights: { title: 'Insights', icon: 'sparkles' },
};

const ACCENT = Colors.dark.accent;
const INACTIVE = Colors.dark.tabIconDefault;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 16;
  const { currentBabyId } = useCurrentBaby();

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomInset, paddingLeft: 10, paddingRight: 20 }]}>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          {state.routes
            .filter((r) => VISIBLE_ROUTES.includes(r.name as (typeof VISIBLE_ROUTES)[number]))
            .map((route, index) => {
              const config = ROUTE_CONFIG[route.name];
              if (!config) return null;
              const focused = state.routes[state.index]?.name === route.name;
              const color = focused ? ACCENT : INACTIVE;
              return (
                <TouchableOpacity
                  key={route.key}
                  style={styles.tabButton}
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!event.defaultPrevented) {
                      navigation.navigate(route.name, route.params);
                    }
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  accessibilityLabel={config.title}
                >
                  <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                    <IconSymbol size={22} name={config.icon} color={color} />
                  </View>
                  <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                    {config.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>

        <TouchableOpacity
          style={styles.plusButton}
          onPress={() => {
            if (Platform.OS === 'ios') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            router.push({
              pathname: '/log-sleep',
              params: currentBabyId ? { babyId: currentBabyId } : undefined,
            });
          }}
          activeOpacity={0.8}
          accessibilityLabel="Log sleep"
          accessibilityRole="button"
        >
          <IconSymbol name="plus" size={28} color={Colors.dark.background} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-start',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.dark.surfaceSolid,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    ...Shadows.md,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
    minWidth: 56,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: Colors.dark.accentSoft,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  plusButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    ...Shadows.md,
  },
});
