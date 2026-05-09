import { StyleSheet, Text, View } from 'react-native';

import { useIsDark, useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import { getCategoryColor } from '@/utils/category';

interface CategoryPinProps {
  category: Category | null;
  selected?: boolean;
  amountLabel?: string | null;
}

export function CategoryPin({ category, selected, amountLabel }: CategoryPinProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const color = category ? getCategoryColor(category.color, theme) : theme.accent;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.scaleWrap,
          selected ? styles.scaleSelected : null,
        ]}
      >
        <View
          style={[
            styles.rect,
            {
              backgroundColor: color,
              shadowColor: color,
              shadowOpacity: selected ? 0.5 : 0.35,
              shadowRadius: selected ? 10 : 6,
            },
          ]}
        >
          <Text style={styles.emoji}>{category?.emoji ?? '•'}</Text>
        </View>
        <View style={[styles.tail, { borderTopColor: color }]} />
      </View>
      {amountLabel ? (
        <View
          style={[
            styles.amountPill,
            {
              backgroundColor: isDark
                ? 'rgba(0,0,0,0.75)'
                : 'rgba(255,255,255,0.9)',
            },
          ]}
        >
          <Text
            style={[
              styles.amountText,
              { color: isDark ? '#FFFFFF' : theme.text },
            ]}
            numberOfLines={1}
          >
            {amountLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface ClusterPinProps {
  count: number;
}

export function ClusterPin({ count }: ClusterPinProps) {
  const theme = useTheme();
  const size = count > 99 ? 40 : count > 9 ? 36 : 32;
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.cluster,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.accent,
            shadowColor: theme.accent,
          },
        ]}
      >
        <Text style={styles.count}>{count}</Text>
      </View>
      <View style={[styles.tail, { borderTopColor: theme.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  scaleWrap: { alignItems: 'center' },
  scaleSelected: { transform: [{ scale: 1.2 }] },
  rect: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  emoji: { fontSize: 16, lineHeight: 18 },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  count: { color: '#FFFFFF', fontWeight: '800', fontSize: 14, letterSpacing: -0.2 },
  amountPill: {
    marginTop: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    maxWidth: 80,
  },
  amountText: { fontSize: 10, fontWeight: '700' },
});
