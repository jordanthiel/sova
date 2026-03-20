import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Image } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors, Gradients, Typography, Spacing } from '@/constants/theme';
import { CurrentBabyProvider } from '@/contexts/CurrentBabyContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { supabase } from '@/lib/supabase';
import { addLiveActivityRefreshListener, registerForPushNotifications } from '@/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Custom dark theme that matches our design system
const SovaDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.accent,
    background: Colors.dark.background,
    card: Colors.dark.surfaceSolid,
    text: Colors.dark.text,
    border: Colors.dark.border,
    notification: Colors.dark.accent,
  },
};

export default function RootLayout() {
  const [isInitializing, setIsInitializing] = useState(true);
  const colors = Colors.dark; // Always use dark theme

  const [iconFontLoaded] = useFonts(MaterialIcons.font);

  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('[RootLayout] Supabase session error:', error.message);
        }
        if (data?.session?.user?.id) {
          const userId = data.session.user.id;
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          supabase.from('profiles').update({ timezone: tz }).eq('id', userId).then(() => {});
          registerForPushNotifications(userId).catch(() => {});
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

  useEffect(() => {
    const remove = addLiveActivityRefreshListener();
    return remove;
  }, []);

  if (!iconFontLoaded || isInitializing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Image
          source={require('@/assets/images/sova_icon.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
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
          <SubscriptionProvider>
            <Stack
              screenOptions={{
            headerStyle: { backgroundColor: Colors.dark.surfaceSolid },
            headerTintColor: Colors.dark.text,
                headerShadowVisible: false,
            contentStyle: { backgroundColor: Gradients.dark.screenBackground[0] },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="baby-setup" options={{ headerShown: false }} />
              <Stack.Screen name="invites-choice" options={{ headerShown: false }} />
              <Stack.Screen name="baby-share" options={{ headerShown: true, title: 'Share Baby' }} />
              <Stack.Screen name="day-overview" options={{ headerShown: false }} />
              <Stack.Screen name="log-sleep" options={{ headerShown: false, presentation: 'modal' }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen
                name="paywall"
                options={{
                  headerShown: false,
                  presentation: 'formSheet',
                  sheetAllowedDetents: [0.95],
                }}
              />
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
          </SubscriptionProvider>
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
  splashLogo: {
    width: 120,
    height: 120,
    marginBottom: Spacing.lg,
  },
});
