import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import type { LanguagePref } from '@/i18n';

import { Card, Divider, Row, SectionHeader, Segment } from './SettingsPrimitives';

const LANGUAGE_OPTIONS: readonly LanguagePref[] = ['auto', 'en', 'he'];

export function PreferencesSection({
  isDark,
  onToggleTheme,
  language,
  onChangeLanguage,
  defaultCurrency,
  onOpenCurrencyPicker,
}: {
  isDark: boolean;
  onToggleTheme: () => void;
  language: LanguagePref;
  onChangeLanguage: (next: LanguagePref) => void;
  defaultCurrency: string;
  onOpenCurrencyPicker: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader label={t('settings.preferences.section')} />
      <Card>
        <Row
          label={t('settings.preferences.theme')}
          right={
            <Segment
              options={[
                { value: 'light', label: t('settings.preferences.themeLight') },
                { value: 'dark', label: t('settings.preferences.themeDark') },
              ]}
              value={isDark ? 'dark' : 'light'}
              onChange={(v) => {
                if ((v === 'dark') !== isDark) onToggleTheme();
              }}
            />
          }
        />
        <Divider />
        <Row
          label={t('settings.preferences.language')}
          right={
            <Segment
              options={LANGUAGE_OPTIONS.map((opt) => ({
                value: opt,
                label: t(
                  `language.${opt === 'auto' ? 'auto' : opt === 'en' ? 'english' : 'hebrew'}`,
                ),
              }))}
              value={language}
              onChange={(v) => onChangeLanguage(v as LanguagePref)}
            />
          }
        />
        <Divider />
        <Pressable
          onPress={onOpenCurrencyPicker}
          accessibilityRole="button"
          accessibilityLabel={t('settings.preferences.defaultCurrency')}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Row
            label={t('settings.preferences.defaultCurrency')}
            right={
              <View style={styles.valuePill}>
                <Text style={[styles.valuePillText, { color: theme.accent }]}>
                  {defaultCurrency}
                </Text>
                <Icon name="chevron-right" size={14} color={theme.textMuted} stroke={2} />
              </View>
            }
          />
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valuePillText: { ...typography.body, fontWeight: '700' },
});
