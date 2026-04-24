import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useCategoryStore } from '@/stores/categoryStore';
import type { Category } from '@/types/category';
import { getCategoryColor, getCategorySoftColor } from '@/utils/categoryColor';

// App-wide default (global) categories manager. Accessed from Settings.
// Only shows categories with trip_id IS NULL. Archive toggle is local-only:
// default categories are server-managed (see reconcileDefaults), so the
// client doesn't create or edit them.
export default function DefaultCategoriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const categories = useCategoryStore((s) => s.categories);
  const updateCategory = useCategoryStore((s) => s.updateCategory);

  const globals = useMemo(
    () => categories.filter((c) => c.tripId === null),
    [categories],
  );

  const renderRow = (category: Category) => {
    const color = getCategoryColor(category.color, theme);
    const soft = getCategorySoftColor(category.color, theme);
    return (
      <View
        key={category.id}
        style={[styles.row, { borderBottomColor: theme.borderLight }]}
      >
        <View style={[styles.iconBox, { backgroundColor: soft, borderColor: color }]}>
          <Text style={styles.emoji}>{category.emoji}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text
            style={[
              styles.rowName,
              { color: theme.text, opacity: category.isArchived ? 0.5 : 1 },
            ]}
            numberOfLines={1}
          >
            {category.name}
          </Text>
          {category.isArchived ? (
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
              {t('categories.archivedBadge')}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() =>
            void updateCategory({ id: category.id, isArchived: !category.isArchived })
          }
          hitSlop={8}
          style={[
            styles.actionBtn,
            {
              backgroundColor: category.isArchived ? theme.accentSoft : theme.surface,
              borderColor: category.isArchived ? theme.accent : theme.border,
            },
          ]}
        >
          <Text
            style={[
              styles.actionText,
              { color: category.isArchived ? theme.accent : theme.textSecondary },
            ]}
          >
            {category.isArchived ? t('categories.unarchive') : t('categories.archive')}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.headerBtn,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.headerBtnText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {t('defaultCategories.title')}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('defaultCategories.subtitle')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {globals.map(renderRow)}
        </View>
      </ScrollView>
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
  headerBtn: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 22, fontWeight: '600', lineHeight: 24 },
  title: { ...typography.screenTitle, flex: 1 },
  list: { padding: spacing.base, paddingBottom: spacing.xxl, gap: spacing.md },
  subtitle: { ...typography.body, marginBottom: spacing.sm },
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: sizing.categoryIconSmall,
    height: sizing.categoryIconSmall,
    borderRadius: sizing.radiusIcon,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  rowBody: { flex: 1 },
  rowName: { ...typography.body, fontWeight: '600' },
  rowMeta: { ...typography.caption, marginTop: 2 },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: sizing.radiusButton,
    borderWidth: 1,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});
