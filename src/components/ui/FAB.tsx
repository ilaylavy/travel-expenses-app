import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { sizing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export interface FABProps extends AccessibilityProps {
  onPress?: PressableProps['onPress'];
  icon?: IconName;
  // Outer container size. Defaults to `sizing.fabSize` (56).
  size?: number;
  testID?: string;
  // Absolute position offsets. The FAB doesn't pick a position by
  // default — callers wrap it in an absolutely-positioned View so the
  // primitive stays placement-agnostic.
  style?: StyleProp<ViewStyle>;
}

// The brand FAB. Indigo-monochrome gradient, 18px radius (the brand
// `fabRadius`), glow shadow. Always icon-only; emoji is forbidden in
// chrome by the design system.
export function FAB({ onPress, icon = 'plus', size, testID, style, ...a11y }: FABProps) {
  const theme = useTheme();
  const dim = size ?? sizing.fabSize;
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      {...a11y}
      style={({ pressed }) => [
        styles.shadow,
        {
          width: dim,
          height: dim,
          borderRadius: sizing.fabRadius,
          shadowColor: theme.accent,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      <LinearGradient
        colors={theme.fabGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.fill,
          { width: dim, height: dim, borderRadius: sizing.fabRadius },
        ]}
      >
        <View style={styles.glyph}>
          <Icon name={icon} size={Math.round(dim * 0.5)} color="#FFFFFF" stroke={2.2} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fill: { alignItems: 'center', justifyContent: 'center' },
  glyph: { alignItems: 'center', justifyContent: 'center' },
});
