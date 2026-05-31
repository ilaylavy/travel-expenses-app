import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { borderWidth, sizing, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { Section } from './Section';

interface ChipDef {
  key: 'refund' | 'exclude' | 'private' | 'split' | 'settled';
  icon: IconName;
  labelKey: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export function AdvancedTogglesSection({
  isRefund,
  setIsRefund,
  isExcluded,
  setIsExcluded,
  isPrivate,
  setIsPrivate,
  isSharedTrip,
  splitEnabled,
  setSplitEnabled,
  isSettled,
  setIsSettled,
}: {
  isRefund: boolean;
  setIsRefund: (v: boolean) => void;
  isExcluded: boolean;
  setIsExcluded: (v: boolean) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  isSharedTrip: boolean;
  splitEnabled: boolean;
  setSplitEnabled: (v: boolean) => void;
  isSettled: boolean;
  setIsSettled: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  const chips: ChipDef[] = [
    {
      key: 'refund',
      icon: 'refund',
      labelKey: 'expense.refundToggle',
      value: isRefund,
      onChange: setIsRefund,
    },
    {
      key: 'exclude',
      icon: 'exclude',
      labelKey: 'expense.excludeToggle',
      value: isExcluded,
      onChange: setIsExcluded,
    },
  ];
  if (isSharedTrip) {
    chips.push({
      key: 'private',
      icon: 'lock',
      labelKey: 'expense.privateToggle',
      value: isPrivate,
      onChange: setIsPrivate,
    });
    chips.push({
      key: 'split',
      icon: 'users',
      labelKey: 'split.toggle',
      value: splitEnabled,
      onChange: setSplitEnabled,
    });
    if (splitEnabled) {
      chips.push({
        key: 'settled',
        icon: 'check',
        labelKey: 'expense.settledToggle',
        value: isSettled,
        onChange: setIsSettled,
      });
    }
  }

  return (
    <Section title={t('expense.advancedSection')}>
      <View style={styles.row}>
        {chips.map((chip) => {
          const fg = chip.value ? theme.accent : theme.textSecondary;
          return (
            <Pressable
              key={chip.key}
              onPress={() => chip.onChange(!chip.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: chip.value }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: chip.value ? theme.accentSoft : theme.surface,
                  borderColor: chip.value ? theme.accent : theme.border,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Icon name={chip.icon} size={14} color={fg} stroke={1.8} />
              <Text style={[styles.label, { color: fg }]}>{t(chip.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
  },
  label: { fontSize: 13, fontWeight: '700' },
});
