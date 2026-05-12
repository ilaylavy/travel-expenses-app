import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryForm, type CategoryFormValues } from '@/components/expense/category/CategoryForm';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useCategoryStore } from '@/stores/categoryStore';
import type { CategoryColorToken } from '@/utils/category';

export default function EditCategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; categoryId: string }>();
  const categoryId = Array.isArray(params.categoryId) ? params.categoryId[0] : params.categoryId;
  const category = useCategoryStore((s) => s.categories.find((c) => c.id === categoryId));
  const updateCategory = useCategoryStore((s) => s.updateCategory);

  const initial = useMemo<Partial<CategoryFormValues> | undefined>(
    () =>
      category
        ? {
            name: category.name,
            emoji: category.emoji,
            color: category.color as CategoryColorToken,
          }
        : undefined,
    [category],
  );

  if (!category) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={styles.missing}>
          <Text style={[styles.missingText, { color: theme.textSecondary }]}>
            {t('categories.notFound')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSubmit = async (values: CategoryFormValues) => {
    await updateCategory({
      id: category.id,
      name: values.name,
      emoji: values.emoji,
      color: values.color,
    });
    router.back();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.backButtonText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('categories.editTitle')}</Text>
        <View style={styles.spacer} />
      </View>

      <KeyboardAwareWrapper>
      <CategoryForm
        initial={initial}
        submitLabel={t('categories.editSubmit')}
        submittingLabel={t('common.saving')}
        onSubmit={handleSubmit}
        footer={
          <Pressable
            onPress={() =>
              void updateCategory({ id: category.id, isArchived: !category.isArchived })
            }
            style={({ pressed }) => [
              styles.archiveButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Text style={[styles.archiveText, { color: theme.textSecondary }]}>
              {category.isArchived ? t('categories.unarchive') : t('categories.archive')}
            </Text>
          </Pressable>
        }
      />
      </KeyboardAwareWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 24, fontWeight: '600', lineHeight: 24 },
  title: { ...typography.screenTitle, flex: 1 },
  spacer: { width: sizing.headerButton },
  archiveButton: {
    marginTop: spacing.sm,
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.base,
    paddingVertical: 14, // button tall geometry
    alignItems: 'center',
  },
  archiveText: { fontSize: 14, fontWeight: '700' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: typography.body,
});
