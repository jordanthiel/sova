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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  const handleSignup = async () => {
    if (!email || !password || !fullName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;

      if (data.user) {
        await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.user.id);
        Alert.alert('Success', 'Account created!', [
          { text: 'OK', onPress: () => router.replace('/invites-choice') },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create account');
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
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(600)} style={styles.headerSection}>
            <View style={styles.heroBadge}>
              <LinearGradient
                colors={['#FFB84D', '#FF9A3C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroBadgeGradient}
              >
                <IconSymbol name="sparkles" size={48} color="#0B1426" />
              </LinearGradient>
            </View>
            <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>
              Create Account
            </Text>
            <Text
              style={[
                Typography.body,
                { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
              ]}
            >
              Start your baby's sleep journey
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.formSection}>
            <Input
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              icon={<IconSymbol name="person.fill" size={18} color={colors.textTertiary} />}
            />

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
              label="Password (min 6 characters)"
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
              title={loading ? 'Creating account...' : 'Sign Up'}
              onPress={handleSignup}
              loading={loading}
              disabled={loading}
              fullWidth
              style={{ marginTop: Spacing.sm }}
            />
          </Animated.View>

          {/* Footer */}
          <Animated.View entering={FadeInDown.duration(600).delay(400)} style={styles.footer}>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={styles.linkButton}>
              <Text style={[Typography.body, { color: colors.textSecondary }]}>
                Already have an account?{' '}
              </Text>
              <Text style={[Typography.bodySemiBold, { color: colors.accent }]}>Sign In</Text>
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
