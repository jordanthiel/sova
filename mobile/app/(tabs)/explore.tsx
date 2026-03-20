import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients } from '@/constants/theme';

// This screen is a placeholder for the center moon tab button.
// The actual tab button navigates to /log-sleep instead.
export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient colors={[...Gradients.dark.screenBackground]} style={StyleSheet.absoluteFill} />
      <IconSymbol name="moon.fill" size={48} color={Colors.dark.text} />
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
});
