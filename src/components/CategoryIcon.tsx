import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { borderWidth, sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Category } from '@/types/category';
import {
  getCategoryColor,
  getCategoryIconName,
  getCategorySoftColor,
} from '@/utils/category';

import { Icon } from './Icon';

interface CategoryIconProps {
  category: Pick<Category, 'name' | 'emoji' | 'color' | 'tripId'>;
  // Outer container size in dp. Icon glyph scales to ~50% of this.
  size?: number;
  // When true, the container fills with the category soft tint and gets a
  // 1px accent-colored border. When false, it's a bare colored glyph with
  // no container.
  withContainer?: boolean;
  // Override container border-radius. Defaults to radiusIcon.
  radius?: number;
  // Force-disable emoji fallback for user-custom categories. Renders a
  // generic "other" SVG icon instead. Useful for screens where we never
  // want emoji to leak (chrome surfaces).
  forceSvg?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Unified renderer for category visuals. Default categories (food, transport,
// hotel, etc.) use the SVG registry. User-custom categories keep their emoji
// — user-supplied content is the one place emoji is allowed per the design
// system. When `forceSvg` is true, custom categories fall back to the
// "other" icon so chrome surfaces never show emoji.
export function CategoryIcon({
  category,
  size = sizing.categoryIconMedium,
  withContainer = true,
  radius,
  forceSvg = false,
  style,
}: CategoryIconProps) {
  const theme = useTheme();
  const color = getCategoryColor(category.color, theme);
  const soft = getCategorySoftColor(category.color, theme);
  const iconName = getCategoryIconName(category) ?? (forceSvg ? 'other' : null);
  const glyphSize = Math.round(size * 0.5);

  const content = iconName ? (
    <Icon name={iconName} size={glyphSize} color={color} stroke={1.8} />
  ) : (
    <Text style={[styles.emoji, { fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.6) }]}>
      {category.emoji}
    </Text>
  );

  if (!withContainer) {
    return <View style={[styles.bare, style]}>{content}</View>;
  }

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius ?? sizing.radiusIcon,
          backgroundColor: soft,
          borderColor: color,
        },
        style,
      ]}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hairline,
  },
  bare: { alignItems: 'center', justifyContent: 'center' },
  emoji: { textAlign: 'center' },
});
