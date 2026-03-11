import { useState } from 'react';
import {
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        const { data: babies, error: babiesError } = await supabase
          .from('baby_parents')
          .select('baby_id')
          .eq('parent_id', data.user.id)
          .eq('status', 'accepted')
          .limit(1);
        if (babiesError) throw babiesError;

        const { data: createdBabies } = await supabase
          .from('babies')
          .select('id')
          .eq('created_by', data.user.id)
          .limit(1);

        if (babies?.length === 0 && createdBabies?.length === 0) {
          router.replace('/baby-setup');
        } else {
          router.replace('/(tabs)');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header with moon */}
          <Animated.View entering={FadeInDown.duration(600)} style={styles.headerSection}>
            <View style={styles.heroBadge}>
              <LinearGradient
                colors={['#4ECDC4', '#3BA8A0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroBadgeGradient}
              >
                <Text style={styles.moonEmoji}>🌙</Text>
              </LinearGradient>
            </View>
            <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>
              Sova
            </Text>
            <Text
              style={[
                Typography.body,
                { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
              ]}
            >
              Better sleep for your little one
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.formSection}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              icon={<IconSymbol name="envelope.fill" size={18} color={colors.textTertiary} />}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              icon={<IconSymbol name="lock.fill" size={18} color={colors.textTertiary} />}
              rightIcon={
                <IconSymbol
                  name={showPassword ? 'eye.slash.fill' : 'eye.fill'}
                  size={18}
                  color={colors.textTertiary}
                />
              }
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            <Button
              title={loading ? 'Signing in...' : 'Sign In'}
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              fullWidth
              style={{ marginTop: Spacing.sm }}
            />
          </Animated.View>

          {/* Footer */}
          <Animated.View entering={FadeInDown.duration(600).delay(400)} style={styles.footer}>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')} style={styles.linkButton}>
              <Text style={[Typography.body, { color: colors.textSecondary }]}>
                Don't have an account?{' '}
              </Text>
              <Text style={[Typography.bodySemiBold, { color: colors.accent }]}>Sign Up</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1426',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  heroBadge: {
    marginBottom: Spacing.md,
  },
  heroBadgeGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moonEmoji: {
    fontSize: 48,
  },
  formSection: {
    marginBottom: Spacing.lg,
  },
  footer: {
    alignItems: 'center',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
  },
});
