import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Typography } from '@/constants/theme';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient colors={[...Gradients.dark.screenBackground]} style={StyleSheet.absoluteFill} />
      <Text style={[Typography.body, { color: Colors.dark.textSecondary }]}>Modal content</Text>
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
