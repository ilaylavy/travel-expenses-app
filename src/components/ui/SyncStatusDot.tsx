import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useSyncStore } from '@/stores/syncStore';

const DOT_SIZE = 10;

export function SyncStatusDot(): React.JSX.Element {
  const theme = useTheme();
  const status = useSyncStore((s) => s.status);

  const color =
    status === 'error'
      ? theme.red
      : status === 'pending' || status === 'syncing'
        ? theme.orange
        : theme.green;

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel={`sync ${status}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
