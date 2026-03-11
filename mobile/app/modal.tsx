import { StyleSheet, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '@/constants/theme';

export default function ModalScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0B1426', '#0D1B2A', '#101E30']} style={StyleSheet.absoluteFill} />
      <Text style={[Typography.body, { color: '#9BAFC4' }]}>Modal content</Text>
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
});
