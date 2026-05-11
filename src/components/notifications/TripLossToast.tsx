import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useNotificationStore, type TripLossEvent } from '@/stores/notificationStore';

const AUTO_DISMISS_MS = 6000;

export function TripLossToast(): React.JSX.Element | null {
  const events = useNotificationStore((s) => s.tripLossEvents);
  // Show only the oldest event at a time so we never stack a tower of toasts.
  // Once it's dismissed, the next one in the queue takes its place.
  const event = events[0] ?? null;

  if (!event) return null;
  return <TripLossToastItem event={event} />;
}

function TripLossToastItem({ event }: { event: TripLossEvent }): React.JSX.Element {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dismiss = useNotificationStore((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(event.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [event.id, dismiss]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { top: insets.top + spacing.md }]}
    >
      <Pressable
        onPress={() => dismiss(event.id)}
        accessibilityRole="button"
        accessibilityLabel={t('notifications.removedFromTrip.a11yDismiss')}
        style={[
          styles.toast,
          {
            backgroundColor: theme.surface,
            borderColor: theme.red,
          },
        ]}
      >
        <Text style={[styles.title, { color: theme.text }]}>
          {t('notifications.removedFromTrip.title')}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {t('notifications.removedFromTrip.body', { tripName: event.tripName })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    zIndex: 1000,
  },
  toast: {
    borderRadius: sizing.radiusCardInner,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: {
    ...typography.itemTitle,
    marginBottom: spacing.xs,
  },
  body: {
    ...typography.body,
  },
});
