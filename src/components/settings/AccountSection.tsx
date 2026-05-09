import { Pressable, StyleSheet, Text } from 'react-native';

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
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Row
            label={t('settings.account.signOut')}
            right={<Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>}
          />
        </Pressable>
        <Divider />
        <Pressable
          onPress={onDeleteAccount}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Row
            label={
              <Text style={[styles.labelText, { color: theme.red }]}>
                {t('settings.account.deleteAccount')}
              </Text>
            }
            right={<Text style={[styles.chevron, { color: theme.red }]}>›</Text>}
          />
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  chevron: { fontSize: 20, fontWeight: '600' },
  labelText: { ...typography.body, fontWeight: '600' },
});
