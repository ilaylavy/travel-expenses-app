import { StyleSheet, Text } from 'react-native';

import { typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { Card, Divider, Row, SectionHeader } from './SettingsPrimitives';

export function AboutSection({ version }: { version: string }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader label={t('settings.about.section')} />
      <Card>
        <Row
          label={t('settings.about.appName')}
          right={
            <Text style={[styles.valueText, { color: theme.text }]}>
              {t('common.appName')}
            </Text>
          }
        />
        <Divider />
        <Row
          label={t('settings.about.version')}
          right={
            <Text style={[styles.valueText, { color: theme.textSecondary }]}>
              {version}
            </Text>
          }
        />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  valueText: { ...typography.body, fontWeight: '500' },
});
