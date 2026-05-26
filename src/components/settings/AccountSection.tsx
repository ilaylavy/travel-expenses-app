import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/Icon';
import { typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { Card, Divider, Row, SectionHeader } from './SettingsPrimitives';

export function AccountSection({
  onSignOut,
  onDeleteAccount,
}: {
  onSignOut: () => void;
  onDeleteAccount: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader label={t('settings.account.section')} />
      <Card>
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('settings.account.signOut')}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Row
            label={t('settings.account.signOut')}
            right={<Icon name="chevron-right" size={14} color={theme.textMuted} stroke={2} />}
          />
        </Pressable>
        <Divider />
        <Pressable
          onPress={onDeleteAccount}
          accessibilityRole="button"
          accessibilityLabel={t('settings.account.deleteAccount')}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Row
            label={
              <Text style={[styles.labelText, { color: theme.red }]}>
                {t('settings.account.deleteAccount')}
              </Text>
            }
            right={<Icon name="chevron-right" size={14} color={theme.red} stroke={2} />}
          />
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  labelText: { ...typography.body, fontWeight: '600' },
});
