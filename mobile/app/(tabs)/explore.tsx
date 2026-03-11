import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// This screen is a placeholder for the center moon tab button.
// The actual tab button navigates to /log-sleep instead.
export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <Text style={styles.text}>🌙</Text>
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
  text: {
    fontSize: 48,
  },
});
