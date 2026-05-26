import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { SplitMode } from '@/hooks/useExpenseEntryForm';
import type { TripMember } from '@/types/trip';
import { formatAmount, roundAmount } from '@/utils/currency';

import { Section } from './Section';

export function SplitParticipantsList({
  splitMode,
  onModeChange,
  participants,
  onToggleParticipant,
  customAmounts,
  onCustomAmountChange,
  onTextFocus,
  equalShares,
  customAssigned,
  customMatchesTotal,
  amountValue,
  currency,
  members,
  memberNames,
  currentUserId,
  onSplitRest,
}: {
  splitMode: SplitMode;
  onModeChange: (mode: SplitMode) => void;
  participants: Set<string>;
  onToggleParticipant: (userId: string) => void;
  customAmounts: Record<string, string>;
  onCustomAmountChange: (userId: string, value: string) => void;
  onTextFocus: () => void;
  equalShares: Record<string, number>;
  customAssigned: number;
  customMatchesTotal: boolean;
  amountValue: number;
  currency: string;
  members: TripMember[];
  memberNames: Record<string, string>;
  currentUserId: string | null;
  onSplitRest: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const splitRestDisabled =
    customMatchesTotal || amountValue <= 0 || customAssigned >= amountValue;

  return (
    <Section title={t('split.toggle')}>
      <View style={styles.modeRow}>
        {(['equal', 'custom'] as const).map((mode) => {
          const active = splitMode === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => onModeChange(mode)}
              style={[
                styles.modeChip,
                {
                  backgroundColor: active ? theme.accentSoft : theme.surface,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  { color: active ? theme.accent : theme.textSecondary },
                ]}
              >
                {t(`split.${mode}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {splitMode === 'equal' ? (
        <View style={{ gap: spacing.xs }}>
          {members.map((m) => {
            const checked = participants.has(m.userId);
            const isPayer = currentUserId === m.userId;
            const share = checked ? equalShares[m.userId] ?? 0 : 0;
            return (
              <Pressable
                key={m.userId}
                onPress={() => onToggleParticipant(m.userId)}
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: theme.surface,
                    borderColor: checked ? theme.accent : theme.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: checked ? theme.accent : 'transparent',
                      borderColor: checked ? theme.accent : theme.border,
                    },
                  ]}
                >
                  {checked ? <Icon name="check" size={12} color="#FFFFFF" stroke={3} /> : null}
                </View>
                <Text
                  style={{ color: theme.text, flex: 1, fontWeight: '600' }}
                  numberOfLines={1}
                >
                  {memberNames[m.userId] || m.userId.slice(0, 6)}
                </Text>
                {isPayer ? (
                  <View style={[styles.paidBadge, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.paidBadgeText, { color: theme.accent }]}>
                      {t('split.paid')}
                    </Text>
                  </View>
                ) : null}
                <Text style={{ color: theme.text, fontWeight: '700' }}>
                  {checked && currency ? formatAmount(share, currency) : '—'}
                </Text>
              </Pressable>
            );
          })}
          {participants.size < 2 ? (
            <Text style={[styles.error, { color: theme.red }]}>
              {t('split.minMembers')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          {members.map((m) => {
            const isPayer = currentUserId === m.userId;
            const value = customAmounts[m.userId] ?? '';
            return (
              <View key={m.userId} style={styles.customRow}>
                <Text
                  style={{ color: theme.text, flex: 1, fontWeight: '600' }}
                  numberOfLines={1}
                >
                  {memberNames[m.userId] || m.userId.slice(0, 6)}
                </Text>
                {isPayer ? (
                  <View style={[styles.paidBadge, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.paidBadgeText, { color: theme.accent }]}>
                      {t('split.paid')}
                    </Text>
                  </View>
                ) : null}
                <TextInput
                  value={value}
                  onChangeText={(text) => onCustomAmountChange(m.userId, text)}
                  onFocus={onTextFocus}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.customInput,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
              </View>
            );
          })}
          <View style={styles.summaryRow}>
            <Text
              style={{
                color: customMatchesTotal ? theme.green : theme.red,
                fontWeight: '700',
                flex: 1,
              }}
            >
              {currency
                ? t('split.assigned', {
                    assigned: formatAmount(customAssigned, currency),
                    total: formatAmount(amountValue, currency),
                  })
                : ''}
            </Text>
            {!customMatchesTotal && currency ? (
              <Text style={{ color: theme.red }}>
                {t('split.unassigned', {
                  amount: formatAmount(
                    roundAmount(amountValue - customAssigned),
                    currency,
                  ),
                })}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onSplitRest}
            disabled={splitRestDisabled}
            style={[
              styles.modeChip,
              {
                alignSelf: 'flex-start',
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: splitRestDisabled ? 0.5 : 1,
              },
            ]}
          >
            <Text style={[styles.modeChipText, { color: theme.accent }]}>
              {t('split.splitRest')}
            </Text>
          </Pressable>
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: sizing.radiusChip,
    borderWidth: 1.5,
  },
  modeChipText: { fontSize: 13, fontWeight: '700' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (formerly checkmark — replaced by SVG check icon.)
  paidBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: sizing.radiusChip,
  },
  paidBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customInput: {
    minWidth: 100,
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  error: { ...typography.caption, textAlign: 'center' },
});
