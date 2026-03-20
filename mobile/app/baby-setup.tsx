import { useState, useEffect } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { Spacing, Typography, Radius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors, useThemeGradients } from '@/hooks/use-theme-color';
import { format } from 'date-fns';

export default function BabySetupScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromInvites = from === 'invites';
  const [babyName, setBabyName] = useState('');
  const [birthDate, setBirthDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === 'ios');
  const [dateSelected, setDateSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [success, setSuccess] = useState(false);
  const colors = useThemeColors();
  const gradients = useThemeGradients();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
    setUser(user);
  };

  const handleCreateBaby = async () => {
    if (!babyName) {
      Alert.alert('Missing Info', 'Please enter your baby\'s name');
      return;
    }
    if (!dateSelected && Platform.OS !== 'ios') {
      Alert.alert('Missing Info', 'Please select your baby\'s birth date');
      return;
    }
    if (!user) {
      Alert.alert('Error', 'Please sign in first');
      return;
    }

    setLoading(true);
    try {
      const { data: family, error: familyError } = await supabase.rpc('ensure_user_family', {
        p_user_id: user.id,
        p_family_name: null,
      });
      if (familyError) throw familyError;

      const { error } = await supabase
        .from('babies')
        .insert({
          name: babyName,
          birth_date: format(birthDate, 'yyyy-MM-dd'),
          family_id: family.id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 1500);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create baby profile');
    } finally {
      setLoading(false);
    }
  };

  const onDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setBirthDate(selectedDate);
      setDateSelected(true);
    }
  };

  // --- Success screen ---
  if (success) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
        <Animated.View entering={FadeInUp.duration(600)} style={styles.successContainer}>
          <IconSymbol name="party.popper" size={80} color={colors.text} style={styles.celebrationIcon} />
          <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>
            Welcome, {babyName}!
          </Text>
          <Text
            style={[
              Typography.body,
              { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            Let&apos;s start tracking those sweet dreams
          </Text>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient colors={[...gradients.screenBackground]} style={StyleSheet.absoluteFill} />
      {fromInvites && (
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
          <Text style={[Typography.bodySemiBold, { color: colors.text }]}>Back</Text>
        </TouchableOpacity>
      )}
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
            <IconSymbol name="figure.child" size={64} color={colors.text} style={styles.babyIcon} />
            <Text style={[Typography.h1, { color: colors.text, textAlign: 'center' }]}>
              Add Your Baby
            </Text>
            <Text
              style={[
                Typography.body,
                { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
              ]}
            >
              Let&apos;s get to know your little one
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.formSection}>
            <Input
              label="Baby's Name"
              value={babyName}
              onChangeText={setBabyName}
              autoCapitalize="words"
              icon={<IconSymbol name="figure.child" size={18} color={colors.textTertiary} />}
            />

            {/* Date picker */}
            <View style={styles.dateSection}>
              <Text style={[Typography.bodySemiBold, { color: colors.text, marginBottom: Spacing.sm }]}>
                Birth Date
              </Text>

              {Platform.OS === 'android' && (
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="calendar" size={18} color={dateSelected ? colors.text : colors.textTertiary} />
                  <Text style={[Typography.body, { color: dateSelected ? colors.text : colors.textTertiary }]}>
                    {dateSelected ? format(birthDate, 'MMMM d, yyyy') : 'Select birth date'}
                  </Text>
                </TouchableOpacity>
              )}

              {showDatePicker && (
                <Card variant="outlined" padding="sm" style={{ alignItems: 'center' }}>
                  <DateTimePicker
                    value={birthDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange}
                    maximumDate={new Date()}
                    minimumDate={new Date(2020, 0, 1)}
                    themeVariant="dark"
                  />
                </Card>
              )}

              {(dateSelected || Platform.OS === 'ios') && (
                <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
                  {format(birthDate, 'MMMM d, yyyy')}
                </Text>
              )}
            </View>

            <Button
              title={loading ? 'Creating...' : 'Create Profile'}
              onPress={handleCreateBaby}
              loading={loading}
              disabled={loading}
              fullWidth
              style={{ marginTop: Spacing.lg }}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0918',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
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
  babyIcon: { marginBottom: Spacing.md },
  formSection: {
    marginBottom: Spacing.lg,
  },
  dateSection: {
    marginBottom: Spacing.md,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: 56,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  celebrationIcon: { marginBottom: Spacing.lg },
});
