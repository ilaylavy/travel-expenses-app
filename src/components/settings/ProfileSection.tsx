import { StyleSheet, Text, TextInput, View } from 'react-native';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { initials } from '@/utils/initials';

import { Card, SectionHeader } from './SettingsPrimitives';

export function ProfileSection({
  email,
  displayName,
  nameDraft,
  onChangeName,
  onSaveName,
  saving,
}: {
  email: string;
  displayName: string;
  nameDraft: string;
  onChangeName: (v: string) => void;
  onSaveName: () => void;
  saving: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader label={t('settings.profile.section')} />
      <Card>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.avatarText, { color: theme.accent }]}>
              {initials(displayName || email)}
            </Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={[styles.labelSmall, { color: theme.textSecondary }]}>
              {t('settings.profile.nameLabel')}
            </Text>
            <TextInput
              value={nameDraft}
              onChangeText={onChangeName}
              onBlur={onSaveName}
              onSubmitEditing={onSaveName}
              editable={!saving}
              returnKeyType="done"
              placeholder={t('settings.profile.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              style={[
                styles.nameInput,
                {
                  color: theme.text,
                  backgroundColor: theme.bg,
                  borderColor: theme.border,
                },
              ]}
            />
            <Text
              style={[
                styles.labelSmall,
                { color: theme.textSecondary, marginTop: spacing.sm },
              ]}
            >
              {t('settings.profile.emailLabel')}
            </Text>
            <Text style={[styles.emailValue, { color: theme.text }]} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.radiusPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  profileMeta: { flex: 1, minWidth: 0 },
  labelSmall: { ...typography.caption, marginBottom: spacing.xs },
  nameInput: {
    ...typography.body,
    borderWidth: borderWidth.hairline,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontWeight: '600',
  },
  emailValue: { ...typography.body, fontWeight: '500' },
});
