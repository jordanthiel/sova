import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Image, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { shouldShowOnboarding } from '@/app/onboarding';
import { Colors, Gradients, Spacing } from '@/constants/theme';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function Index() {
  const router = useRouter();
  const colors = Colors.dark;
  const { isReady: subscriptionReady } = useSubscription();

  useEffect(() => {
    if (!subscriptionReady) return;

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
            const { data: memberships } = await supabase
              .from('family_members')
              .select('family_id, status')
              .eq('user_id', session.user.id)
              .in('status', ['accepted', 'pending']);

            const acceptedFamilyIds = [...new Set((memberships || []).filter((m) => m.status === 'accepted').map((m) => m.family_id))];

            let familyBabies: { id: string }[] | null = null;
            if (acceptedFamilyIds.length > 0) {
              const { data } = await supabase
                .from('babies')
                .select('id')
                .in('family_id', acceptedFamilyIds)
                .limit(1);
              familyBabies = data;
            }

            if ((familyBabies?.length ?? 0) === 0) {
              const pending = (memberships || []).filter((m) => m.status === 'pending');
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
  }, [router, subscriptionReady]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={[...Gradients.dark.screenBackground]} style={StyleSheet.absoluteFill} />
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
    backgroundColor: Colors.dark.background,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: Spacing.lg,
  },
});
