import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/constants/theme';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log in</Text>
      <Text style={styles.subtitle}>Login screen placeholder.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
    backgroundColor: colors.background,
  },
  title: { ...typography.screenTitle, color: colors.textPrimary },
  subtitle: { ...typography.secondary, color: colors.textSecondary, marginTop: spacing.sm },
});
