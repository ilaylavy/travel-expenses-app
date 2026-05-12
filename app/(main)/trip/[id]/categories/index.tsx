import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { selectCategoriesForTrip, useCategoryStore } from '@/stores/categoryStore';
import { useTripStore } from '@/stores/tripStore';
import type { Category } from '@/types/category';
import {
  getCategoryColor,
  getCategoryDisplayName,
  getCategorySoftColor,
} from '@/utils/category';
import { showConfirmDialog } from '@/utils/confirmDialog';
import { href } from '@/utils/nav';

export default function CategoriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));
  const categories = useCategoryStore((s) => s.categories);
  const updateCategory = useCategoryStore((s) => s.updateCategory);
  const deleteCategoryIfEmpty = useCategoryStore((s) => s.deleteCategoryIfEmpty);
  const reorderCategories = useCategoryStore((s) => s.reorderCategories);

  const { globals, trips: tripCats } = useMemo(() => {
    const effective = selectCategoriesForTrip(categories, tripId ?? null, { includeArchived: true });
    return {
      globals: effective.filter((c) => c.tripId === null),
      trips: effective.filter((c) => c.tripId === tripId),
    };
  }, [categories, tripId]);

  if (!tripId || !trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={styles.missing}>
          <Text style={[styles.missingText, { color: theme.textSecondary }]}>
            {t('trips.notFound')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleMove = (scope: Category[], index: number, direction: -1 | 1) => {
    const next = [...scope];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    void reorderCategories(next.map((c) => c.id));
  };

  const handleDelete = (category: Category) => {
    showConfirmDialog({
      title: t('categories.deleteConfirmTitle'),
      body: t('categories.deleteConfirmBody', { name: getCategoryDisplayName(category, t) }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        const ok = await deleteCategoryIfEmpty(category.id);
        if (!ok) {
          Alert.alert(
            t('categories.cannotDeleteTitle'),
            t('categories.cannotDeleteBody'),
          );
        }
      },
    });
  };

  const renderRow = (category: Category, index: number, scope: Category[]) => {
    const color = getCategoryColor(category.color, theme);
    const soft = getCategorySoftColor(category.color, theme);
    const isTripSpecific = category.tripId !== null;
    return (
      <View
        key={category.id}
        style={[styles.row, { borderBottomColor: theme.borderLight }]}
      >
        <View style={[styles.iconBox, { backgroundColor: soft, borderColor: color }]}>
          <Text style={styles.emoji}>{category.emoji}</Text>
        </View>
        <Pressable
          style={styles.rowBody}
          onPress={() => router.push(href(`/trip/${tripId}/categories/${category.id}`))}
        >
          <Text
            style={[
              styles.rowName,
              { color: theme.text, opacity: category.isArchived ? 0.5 : 1 },
            ]}
            numberOfLines={1}
          >
            {getCategoryDisplayName(category, t)}
          </Text>
          {category.isArchived && (
            <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
              {t('categories.archivedBadge')}
            </Text>
          )}
        </Pressable>
        <View style={styles.actions}>
          <ActionButton theme={theme} onPress={() => handleMove(scope, index, -1)} label="↑" />
          <ActionButton theme={theme} onPress={() => handleMove(scope, index, 1)} label="↓" />
          <ActionButton
            theme={theme}
            onPress={() =>
              void updateCategory({ id: category.id, isArchived: !category.isArchived })
            }
            label={category.isArchived ? '◉' : '◎'}
          />
          {isTripSpecific && (
            <ActionButton
              theme={theme}
              onPress={() => handleDelete(category)}
              label="✕"
              tint={theme.red}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.headerBtnText, { color: theme.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t('categories.title')}</Text>
        <Pressable
          onPress={() => router.push(href(`/trip/${tripId}/categories/new`))}
          style={({ pressed }) => [
            styles.headerBtn,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.accent,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
          hitSlop={8}
        >
          <Text style={[styles.headerBtnText, { color: theme.accent }]}>＋</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
          {t('categories.sectionDefaults')}
        </Text>
        {globals.map((c, i) => renderRow(c, i, globals))}

        <Text style={[styles.sectionTitle, { color: theme.textMuted, marginTop: spacing.xl }]}>
          {t('categories.sectionTrip')}
        </Text>
        {tripCats.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            {t('categories.noTripCategories')}
          </Text>
        ) : (
          tripCats.map((c, i) => renderRow(c, i, tripCats))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  theme,
  onPress,
  label,
  tint,
}: {
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
  label: string;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          transform: [{ scale: pressed ? 0.92 : 1 }],
        },
      ]}
    >
      <Text style={[styles.actionText, { color: tint ?? theme.textSecondary }]}>{label}</Text>
    </Pressable>
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
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 22, fontWeight: '600', lineHeight: 24 },
  title: { ...typography.screenTitle, flex: 1 },
  list: { padding: spacing.base, paddingBottom: spacing.xxl },
  sectionTitle: {
    ...typography.micro,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  empty: { ...typography.secondary, paddingVertical: spacing.md, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidth.hairline,
  },
  iconBox: {
    width: sizing.categoryIconSmall,
    height: sizing.categoryIconSmall,
    borderRadius: sizing.radiusIcon,
    borderWidth: borderWidth.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  rowBody: { flex: 1 },
  rowName: { ...typography.body, fontWeight: '600' },
  rowMeta: { ...typography.caption },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: sizing.radiusSmall,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 14, fontWeight: '700' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: typography.body,
});
