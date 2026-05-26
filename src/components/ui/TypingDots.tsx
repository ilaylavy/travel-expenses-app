import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface TypingDotsProps {
  color?: string;
  size?: number;
}

// Three dots that bob with a staggered pulse, used in the AI Ask loading
// bubble. Animation matches the design-system `te-pulse` keyframe
// (1.2s loop, 0.16s stagger).
export function TypingDots({ color, size = 6 }: TypingDotsProps) {
  const theme = useTheme();
  const dotColor = color ?? theme.textSecondary;

  const a = useRef(new Animated.Value(0.3)).current;
  const b = useRef(new Animated.Value(0.3)).current;
  const c = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const buildLoop = (target: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(target, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(target, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.delay(320 - delay),
        ]),
      );
    const loopA = buildLoop(a, 0);
    const loopB = buildLoop(b, 160);
    const loopC = buildLoop(c, 320);
    loopA.start();
    loopB.start();
    loopC.start();
    return () => {
      loopA.stop();
      loopB.stop();
      loopC.stop();
    };
  }, [a, b, c]);

  const dotStyle = (v: Animated.Value) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: dotColor,
    opacity: v,
    transform: [
      {
        translateY: v.interpolate({ inputRange: [0.3, 1], outputRange: [0, -3] }),
      },
    ],
  });

  return (
    <View style={styles.row}>
      <Animated.View style={dotStyle(a)} />
      <Animated.View style={dotStyle(b)} />
      <Animated.View style={dotStyle(c)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
