import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryForm, type CategoryFormValues } from '@/components/expense/category/CategoryForm';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { sizing, spacing, typography } from '@/constants/theme';
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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          hitSlop={8}
        >
          <Text style={[styles.backButtonText, { color: theme.text }]}>‹</Text>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: { fontSize: 24, fontWeight: '600', lineHeight: 24 },
  title: { ...typography.screenTitle, flex: 1 },
  spacer: { width: sizing.headerButton },
});
