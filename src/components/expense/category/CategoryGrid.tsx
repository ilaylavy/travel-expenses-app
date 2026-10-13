import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { CategoryIcon } from "@/components/CategoryIcon";
import { Icon } from "@/components/Icon";
import { borderWidth, sizing, spacing, typography } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useTranslation } from "@/hooks/useTranslation";
import type { Category } from "@/types/category";
import {
  getCategoryColor,
  getCategoryDisplayName,
  getCategorySoftColor,
} from "@/utils/category";

interface CategoryGridProps {
  categories: Category[];
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  onAddPress?: () => void;
  addLabel?: string;
  columns?: number;
}

interface AddCategoryCellProps {
  onAddPress?: () => void;
  addLabel?: string;
  cellStyle: StyleProp<ViewStyle>;
}

function AddCategoryCell({
  onAddPress,
  addLabel,
  cellStyle,
}: AddCategoryCellProps) {
  const theme = useTheme();

  return (
    <View style={cellStyle}>
      <Pressable
        onPress={onAddPress}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        style={({ pressed }) => [
          styles.inner,
          styles.add,
          {
            backgroundColor: theme.surface,
            borderColor: theme.accent,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <Icon name="plus" size={22} color={theme.accent} stroke={2.2} />
        {addLabel && (
          <Text
            style={[styles.addLabel, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {addLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

interface CategoryCellProps {
  category: Category;
  selectedId: string | null;
  onSelect: (categoryId: string) => void;
  cellStyle: StyleProp<ViewStyle>;
}

function CategoryCell({
  category,
  selectedId,
  onSelect,
  cellStyle,
}: CategoryCellProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const selected = category.id === selectedId;
  const color = getCategoryColor(category.color, theme);
  const soft = getCategorySoftColor(category.color, theme);

  return (
    <View style={cellStyle}>
      <Pressable
        onPress={() => onSelect(category.id)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={getCategoryDisplayName(category, t)}
        style={({ pressed }) => [
          styles.inner,
          {
            backgroundColor: selected ? soft : theme.surface,
            borderColor: selected ? color : theme.border,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
      >
        <CategoryIcon category={category} size={30} withContainer={false} />
        <Text
          style={[styles.name, { color: selected ? color : theme.text }]}
          numberOfLines={1}
        >
          {getCategoryDisplayName(category, t)}
        </Text>
      </Pressable>
    </View>
  );
}

export function CategoryGrid({
  categories,
  selectedId,
  onSelect,
  onAddPress,
  addLabel,
  columns = 4,
}: CategoryGridProps) {
  const cellStyle = [styles.cell, { flexBasis: `${100 / columns}%` as const }];

  return (
    <View style={styles.grid}>
      {categories.map((category) => (
        <CategoryCell
          key={category.id}
          category={category}
          selectedId={selectedId}
          onSelect={onSelect}
          cellStyle={cellStyle}
        />
      ))}
      {onAddPress && (
        <AddCategoryCell
          key="add"
          onAddPress={onAddPress}
          addLabel={addLabel}
          cellStyle={cellStyle}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.xs / 2,
  },
  cell: { padding: spacing.xs / 2 },
  inner: {
    borderRadius: sizing.radiusButton,
    borderWidth: borderWidth.hairline,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    minHeight: 70, // grid cell geometry; tuned for 4-column layout
  },
  name: { ...typography.micro, letterSpacing: 0.2 },
  add: { borderStyle: "dashed" },
  addLabel: { ...typography.micro, letterSpacing: 0.2 },
});
