import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text, Image, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { shouldShowOnboarding } from '@/app/onboarding';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function Index() {
  const router = useRouter();
  const colors = Colors.dark;

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error && error.name !== 'AuthSessionMissingError') {
          console.warn('[Index] Session error:', error.message);
        }

        if (session?.user) {
          try {
            const { data: babies } = await supabase
              .from('baby_parents')
              .select('baby_id')
              .eq('parent_id', session.user.id)
              .eq('status', 'accepted')
              .limit(1);

            const { data: createdBabies } = await supabase
              .from('babies')
              .select('id')
              .eq('created_by', session.user.id)
              .limit(1);

            const hasAcceptedOrOwn = (babies?.length ?? 0) > 0 || (createdBabies?.length ?? 0) > 0;

            if (!hasAcceptedOrOwn) {
              const { data: pending } = await supabase
                .from('baby_parents')
                .select('id')
                .eq('parent_id', session.user.id)
                .eq('status', 'pending')
                .limit(1);
              if (pending && pending.length > 0) {
                router.replace('/invites-choice');
                return;
              }
              router.replace('/baby-setup');
            } else {
              const showOnboarding = await shouldShowOnboarding();
              if (showOnboarding) {
                router.replace('/onboarding');
              } else {
                let tabsPath = '/(tabs)';
                try {
                  const initialUrl = await Linking.getInitialURL();
                  if (initialUrl) {
                    const parsed = new URL(initialUrl);
                    const action = parsed.searchParams.get('action');
                    if (action === 'startNap' || action === 'endSession') {
                      const run = parsed.searchParams.get('run') === '1';
                      tabsPath = `/(tabs)?action=${encodeURIComponent(action)}&run=${run ? '1' : '0'}`;
                    }
                  }
                } catch {
                  // ignore
                }
                router.replace(tabsPath as any);
              }
            }
          } catch (dbError) {
            console.error('[Index] Database error:', dbError);
            router.replace('/baby-setup');
          }
        } else {
          router.replace('/(auth)/login');
        }
      } catch (error) {
        console.error('[Index] Auth check error:', error);
        router.replace('/(auth)/login');
      }
    };

    setTimeout(checkAuthAndRedirect, 100);
  }, [router]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <Image
        source={require('@/assets/images/sova_icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B1426',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: Spacing.lg,
  },
});
