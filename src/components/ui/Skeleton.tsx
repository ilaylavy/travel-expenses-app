import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

// Single shimmer primitive. A muted base block with a brighter band that
// sweeps horizontally — keeps the user oriented while the data loads.
// Reads dimensions on layout so the band's translation range matches the
// host element exactly (and runs on the native driver since it's pixel-
// based after measuring).
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: SkeletonProps) {
  const theme = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  const [hostWidth, setHostWidth] = useState(0);

  useEffect(() => {
    if (hostWidth === 0) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer, hostWidth]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-hostWidth, hostWidth],
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== hostWidth) setHostWidth(next);
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.bgSoft,
        },
        style,
      ]}
    >
      {hostWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.bandWrap, { transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={['transparent', theme.surfaceRaised, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.band}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  bandWrap: { ...StyleSheet.absoluteFillObject },
  band: { flex: 1, opacity: 0.6 },
});
