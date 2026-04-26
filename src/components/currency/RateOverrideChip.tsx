import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { NumericPadField } from '@/components/expense/NumericPadField';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  isOverridden: boolean;
  onOverride: (rate: number) => void;
  onResetToAuto: () => void;
}

export function RateOverrideChip({
  baseCurrency,
  targetCurrency,
  rate,
  isOverridden,
  onOverride,
  onResetToAuto,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (editing) setDraft(String(rate));
  }, [editing, rate]);

  const handleSave = () => {
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      onOverride(parsed);
      setEditing(false);
    }
  };

  const displayRate = rate.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

  return (
    <>
      <Pressable
        onPress={() => setEditing(true)}
        style={[
          styles.chip,
          {
            backgroundColor: isOverridden ? theme.accentSoft : theme.surface,
            borderColor: isOverridden ? theme.accent : theme.border,
          },
        ]}
      >
        <Text
          style={[
            styles.chipText,
            { color: isOverridden ? theme.accent : theme.textSecondary },
          ]}
        >
          {t('currency.override.chip', {
            base: baseCurrency,
            target: targetCurrency,
            rate: displayRate,
          })}
        </Text>
      </Pressable>

      <Modal
        visible={editing}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(false)}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(false)} />
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surfaceRaised,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {t('currency.override.title')}
            </Text>
            <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
              {t('currency.override.subtitle', {
                base: baseCurrency,
                target: targetCurrency,
              })}
            </Text>
            <NumericPadField
              value={draft}
              onChange={setDraft}
              placeholder={t('currency.override.placeholder')}
            />
            <View style={styles.actions}>
              {isOverridden ? (
                <Pressable
                  onPress={() => {
                    onResetToAuto();
                    setEditing(false);
                  }}
                  style={[
                    styles.btn,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.btnText, { color: theme.text }]}>
                    {t('currency.override.auto')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSave}
                style={[
                  styles.btn,
                  styles.btnPrimary,
                  { backgroundColor: theme.accent },
                ]}
              >
                <Text style={[styles.btnText, { color: '#FFFFFF' }]}>
                  {t('currency.override.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusChip,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  chipText: { ...typography.caption },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardTitle: typography.itemTitle,
  cardSubtitle: typography.secondary,
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: 1,
  },
  btnPrimary: { borderColor: 'transparent' },
  btnText: typography.sectionTitle,
});
