import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

import { Card, Row, SectionHeader } from './SettingsPrimitives';

export function CategoriesSection({
  defaultCategoryCount,
  onPress,
}: {
  defaultCategoryCount: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <>
      <SectionHeader label={t('settings.categories.section')} />
      <Card>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
        >
          <Row
            label={t('settings.categories.manageDefaults')}
            subtitle={t('settings.categories.count', { count: defaultCategoryCount })}
            right={<Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>}
          />
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  chevron: { fontSize: 20, fontWeight: '600' },
});
