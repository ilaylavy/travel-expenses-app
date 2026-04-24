import { StyleSheet, Text, View } from 'react-native';

import { sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';

interface CategoryPinProps {
  category: Category | null;
}

export function CategoryPin({ category }: CategoryPinProps) {
  const theme = useTheme();
  const color = category ? getCategoryColor(category.color, theme) : theme.accent;
  const soft = category ? getCategorySoftColor(category.color, theme) : theme.accentSoft;
  return (
    <View style={styles.pinWrap}>
      <View
        style={[
          styles.pin,
          {
            backgroundColor: theme.surface,
            borderColor: color,
            shadowColor: color,
          },
        ]}
      >
        <View style={[styles.emojiBg, { backgroundColor: soft }]}>
          <Text style={styles.emoji}>{category?.emoji ?? '•'}</Text>
        </View>
      </View>
      <View style={[styles.tail, { borderTopColor: color }]} />
    </View>
  );
}

interface ClusterPinProps {
  count: number;
}

export function ClusterPin({ count }: ClusterPinProps) {
  const theme = useTheme();
  const size = count > 99 ? 54 : count > 9 ? 48 : 42;
  return (
    <View
      style={[
        styles.cluster,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.accent,
          shadowColor: theme.accentGlow,
        },
      ]}
    >
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: 'center' },
  pin: {
    width: sizing.mapPin,
    height: sizing.mapPin,
    borderRadius: sizing.mapPin / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  emojiBg: {
    width: sizing.mapPin - 12,
    height: sizing.mapPin - 12,
    borderRadius: (sizing.mapPin - 12) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  // Downward-pointing triangle anchors the pin on the coordinate.
  tail: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  count: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: -0.2 },
});
