import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/Icon';
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
          accessibilityRole="button"
          accessibilityLabel={t('settings.categories.manageDefaults')}
          style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.7 }]}
        >
          <Row
            label={t('settings.categories.manageDefaults')}
            subtitle={t('settings.categories.count', { count: defaultCategoryCount })}
            right={<Icon name="chevron-right" size={14} color={theme.textMuted} stroke={2} />}
          />
        </Pressable>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {},
});
