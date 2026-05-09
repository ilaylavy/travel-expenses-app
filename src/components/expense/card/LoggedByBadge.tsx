import { StyleSheet, Text, View } from 'react-native';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { initials } from '@/utils/initials';

interface Props {
  name: string;
  displayName?: string;
}

// Small pill showing who logged an expense — rendered on list rows and expense
// detail in shared trips. `name` is the real profile name (used for initials);
// `displayName` is what's shown (caller passes "You" for the current user).
export function LoggedByBadge({ name, displayName }: Props) {
  const theme = useTheme();
  const label = displayName ?? name;
  return (
    <View style={[styles.pill, { backgroundColor: theme.accentSoft }]}>
      <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
        <Text style={styles.avatarText}>{initials(name)}</Text>
      </View>
      <Text style={[styles.label, { color: theme.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: sizing.radiusChip,
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  label: {
    ...typography.micro,
    fontWeight: '700',
  },
});
