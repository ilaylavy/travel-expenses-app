import {
  StyleSheet,
  Text,
  View,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { borderWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface AvatarProps extends AccessibilityProps {
  // The label to render — typically initials. The component does NOT
  // compute initials from a name; callers pass exactly what to render.
  label?: string;
  // Tint hex (category color or member tint). Drives both the soft fill
  // and the 1.5px border.
  tint: string;
  size?: number;
  // Pass an emoji or another node to render in place of initials. Used for
  // trip avatars where the user picks an emoji.
  glyph?: React.ReactNode;
  // Outer border radius. Defaults to ~36% of size (matches design-system
  // monogram tile geometry).
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// Monogram avatar in a tinted tile. Used for trip avatars, member tokens,
// and history settlement diptychs. Borders are 1.5px in the brand tint.
export function Avatar({ label, tint, size = 50, glyph, radius, style, ...a11y }: AvatarProps) {
  const theme = useTheme();
  // ~24 alpha on the tint mirrors the design system `tint + '24'` pattern
  // (rgba with ~14% alpha). We approximate by computing a soft surface.
  const soft = hexAlpha(tint, 0.14) ?? theme.accentSoft;
  return (
    <View
      {...a11y}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius ?? Math.round(size * 0.36),
          backgroundColor: soft,
          borderColor: tint,
        },
        style,
      ]}
    >
      {glyph ? (
        <Text style={[styles.glyph, { fontSize: Math.round(size * 0.5) }]}>{glyph}</Text>
      ) : (
        <Text
          style={[
            styles.label,
            {
              color: tint,
              fontSize: Math.round(size * 0.36),
              lineHeight: Math.round(size * 0.4),
            },
          ]}
        >
          {label?.toUpperCase()}
        </Text>
      )}
    </View>
  );
}

// Tiny helper: re-pack a hex color with a custom alpha as `rgba(...)`.
// Returns null if the input isn't a 3 / 6-char hex.
function hexAlpha(hex: string, alpha: number): string | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return null;
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hairline,
  },
  label: { fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  glyph: { textAlign: 'center' },
});
