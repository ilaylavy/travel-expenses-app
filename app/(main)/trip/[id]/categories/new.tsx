import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryForm, type CategoryFormValues } from '@/components/expense/category/CategoryForm';
import { Icon } from '@/components/Icon';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';

export default function NewCategoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const user = useAuthStore((s) => s.user);
  const createCategory = useCategoryStore((s) => s.createCategory);

  const handleSubmit = async (values: CategoryFormValues) => {
    if (!tripId) throw new Error(t('trips.notFound'));
    await createCategory({
      name: values.name,
      emoji: values.emoji,
      color: values.color,
      tripId,
      createdBy: user?.id ?? null,
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
          <Icon name="chevron-left" size={18} color={theme.text} stroke={2} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('categories.newTitle')}</Text>
        <View style={styles.spacer} />
      </View>

      <KeyboardAwareWrapper>
        <CategoryForm
          submitLabel={t('categories.createSubmit')}
          submittingLabel={t('categories.creating')}
          onSubmit={handleSubmit}
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
  // (formerly backButtonText — replaced by SVG chevron-left.)
  title: { ...typography.screenTitle, flex: 1 },
  spacer: { width: sizing.headerButton },
});
