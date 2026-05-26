import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import {
  useToastStore,
  type ToastItem,
  type ToastTone,
} from '@/stores/toastStore';

// Anchored at the top of the screen via SafeAreaView so it sits below the
// status bar / dynamic island. Renders the current toast stack from the
// global store. Mount once near the root.
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <SafeAreaView pointerEvents="box-none" style={styles.safe} edges={['top']}>
      <View style={styles.stack} pointerEvents="box-none">
        {toasts.map((t) => (
          <ToastRow key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </SafeAreaView>
  );
}

interface ToastRowProps {
  item: ToastItem;
  onDismiss: () => void;
}

function ToastRow({ item, onDismiss }: ToastRowProps) {
  const theme = useTheme();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const palette = tonePalette(item.tone, theme);
  const iconName = iconForTone(item.tone);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] });
  const opacity = slide;

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.accent,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        style={styles.toastInner}
      >
        <View style={[styles.iconBubble, { backgroundColor: palette.soft }]}>
          <Icon name={iconName} size={14} color={palette.fg} stroke={2.2} />
        </View>
        <Text style={[styles.message, { color: theme.text }]} numberOfLines={2}>
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function tonePalette(tone: ToastTone, theme: ReturnType<typeof useTheme>) {
  switch (tone) {
    case 'error':
      return { soft: theme.redSoft, fg: theme.red };
    case 'info':
      return { soft: theme.accentSoft, fg: theme.accent };
    case 'success':
    default:
      return { soft: theme.greenSoft, fg: theme.green };
  }
}

function iconForTone(tone: ToastTone): IconName {
  switch (tone) {
    case 'error':
      return 'exclude';
    case 'info':
      return 'info';
    case 'success':
    default:
      return 'check';
  }
}

const styles = StyleSheet.create({
  safe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  stack: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  toast: {
    borderRadius: sizing.radiusCardInner,
    borderWidth: borderWidth.hairline,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  iconBubble: {
    width: 28,
    height: 28,
    borderRadius: sizing.radiusSmall,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { flex: 1, fontSize: 13, fontWeight: '600' },
});
