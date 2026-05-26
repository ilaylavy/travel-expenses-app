import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { useIsDark, useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import { getCategoryColor, getCategoryIconName } from '@/utils/category';

interface CategoryPinProps {
  category: Category | null;
  selected?: boolean;
  amountLabel?: string | null;
}

export function CategoryPin({ category, selected, amountLabel }: CategoryPinProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const color = category ? getCategoryColor(category.color, theme) : theme.accent;
  const iconName = category ? getCategoryIconName(category) : null;

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
            styles.circle,
            {
              backgroundColor: color,
              shadowColor: color,
              shadowOpacity: selected ? 0.5 : 0.35,
              shadowRadius: selected ? 12 : 8,
            },
          ]}
        >
          {iconName ? (
            <Icon name={iconName} size={20} color="#FFFFFF" stroke={2} />
          ) : (
            <Text style={styles.emoji}>{category?.emoji ?? '•'}</Text>
          )}
        </View>
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

// Cluster pin sizes track the count to give a visual weight cue. Geometry
// stays as a true circle to match the design-system spec for single-pin
// markers — the cluster reads as "more of the same".
export function ClusterPin({ count }: ClusterPinProps) {
  const theme = useTheme();
  const size = count > 99 ? 48 : count > 9 ? 44 : 42;
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  scaleWrap: { alignItems: 'center' },
  scaleSelected: { transform: [{ scale: 1.15 }] },
  circle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  emoji: { fontSize: 20, lineHeight: 22 },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  count: { color: '#FFFFFF', fontWeight: '800', fontSize: 15, letterSpacing: -0.2 },
  amountPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    maxWidth: 90,
  },
  amountText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
