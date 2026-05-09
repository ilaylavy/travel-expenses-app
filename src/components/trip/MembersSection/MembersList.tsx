import { StyleSheet, View } from 'react-native';

import { sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { MemberRow, type MemberWithName } from './MemberRow';

export function MembersList({
  members,
  currentUserId,
  isOwner,
  onRemove,
}: {
  members: MemberWithName[];
  currentUserId: string | null;
  isOwner: boolean;
  onRemove: (m: MemberWithName) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {members.map((m) => {
        const isSelf = m.userId === currentUserId;
        return (
          <MemberRow
            key={m.id}
            member={m}
            isSelf={isSelf}
            showRemove={isOwner && !isSelf}
            onRemove={() => onRemove(m)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
