import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors, Typography, Spacing } from '@/constants/theme';
import { CurrentBabyProvider } from '@/contexts/CurrentBabyContext';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Custom dark theme that matches our design system
const SovaDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#4ECDC4',
    background: '#0B1426',
    card: '#0D1B2A',
    text: '#E8EDF2',
    border: 'rgba(255, 255, 255, 0.08)',
    notification: '#4ECDC4',
  },
};

export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const colors = Colors.dark; // Always use dark theme

  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('[RootLayout] Supabase session error:', error.message);
        }
        if (data?.session?.user?.id) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          supabase.from('profiles').update({ timezone: tz }).eq('id', data.session.user.id).then(() => {});
        }
      } catch (error: any) {
        console.warn('[RootLayout] Supabase initialization warning:', error?.message);
      }
      setTimeout(() => {
        setIsInitializing(false);
      }, 300);
    };
    init();
  }, []);

  if (isInitializing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={styles.splashEmoji}>🌙</Text>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.md }]}>
          Loading Sova...
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={SovaDarkTheme}>
        <CurrentBabyProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0D1B2A' },
            headerTintColor: '#E8EDF2',
            headerShadowVisible: false,
            contentStyle: { backgroundColor: '#0B1426' },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="baby-setup" options={{ headerShown: false }} />
          <Stack.Screen name="invites-choice" options={{ headerShown: false }} />
          <Stack.Screen name="baby-share" options={{ headerShown: true, title: 'Share Baby' }} />
          <Stack.Screen name="log-sleep" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen
            name="select-baby"
            options={{
              headerShown: false,
              presentation: 'formSheet',
              sheetAllowedDetents: [0.5],
            }}
          />
        </Stack>
        </CurrentBabyProvider>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashEmoji: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
});
