import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

export interface FilterOption {
  id: string;
  label: string;
  emoji?: string;
  count: number;
}

interface FilterModalProps {
  visible: boolean;
  title: string;
  options: FilterOption[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
}

export function FilterModal({
  visible,
  title,
  options,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  onDone,
}: FilterModalProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const allSelected = options.length > 0 && selectedIds.size === options.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDone}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onDone} />
        <SafeAreaView edges={['bottom']} style={styles.safe}>
          <View style={[styles.sheetWrap, { borderColor: theme.border }]}>
            <LinearGradient
              colors={theme.cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheet}
            >
              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                <Pressable
                  onPress={allSelected ? onClear : onSelectAll}
                  style={({ pressed }) => [
                    styles.allChip,
                    {
                      backgroundColor: allSelected ? theme.accentSoft : theme.surface,
                      borderColor: allSelected ? theme.accent : theme.border,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}
                  hitSlop={6}
                >
                  <Text
                    style={[
                      styles.allChipText,
                      { color: allSelected ? theme.accent : theme.textSecondary },
                    ]}
                  >
                    {t('expenses.filterAll')}
                  </Text>
                </Pressable>
              </View>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {options.map((opt) => {
                  const checked = selectedIds.has(opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => onToggle(opt.id)}
                      style={({ pressed }) => [
                        styles.row,
                        {
                          borderBottomColor: theme.borderLight,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      {opt.emoji ? <Text style={styles.rowEmoji}>{opt.emoji}</Text> : null}
                      <Text
                        style={[styles.rowLabel, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                      <Text style={[styles.rowCount, { color: theme.textMuted }]}>
                        {opt.count}
                      </Text>
                      <View
                        style={[
                          styles.check,
                          {
                            backgroundColor: checked ? theme.accent : 'transparent',
                            borderColor: checked ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                onPress={onDone}
                style={({ pressed }) => [
                  styles.doneButton,
                  {
                    backgroundColor: theme.accent,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text style={styles.doneButtonText}>{t('expenses.filterDone')}</Text>
              </Pressable>
            </LinearGradient>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  safe: { backgroundColor: 'transparent' },
  sheetWrap: {
    borderTopLeftRadius: sizing.radiusCard,
    borderTopRightRadius: sizing.radiusCard,
    borderWidth: borderWidth.base,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  sheet: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    maxHeight: 560,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { ...typography.itemTitle },
  allChip: {
    paddingHorizontal: spacing.md + 2, // 12 — chip compact geometry
    paddingVertical: spacing.sm,
    borderRadius: sizing.radiusChip,
    borderWidth: borderWidth.hairline,
  },
  allChipText: { fontSize: 12, fontWeight: '600' },
  list: { maxHeight: 380 },
  listContent: { paddingBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md + 2, // 12 — row tall geometry
    gap: spacing.md,
    borderBottomWidth: borderWidth.hairline,
  },
  rowEmoji: { fontSize: 18 },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  rowCount: { fontSize: 12, fontWeight: '500' },
  check: {
    width: 22,
    height: 22,
    borderRadius: sizing.radiusSmall - 4, // 6 — checkbox-style square radius
    borderWidth: borderWidth.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  doneButton: {
    marginTop: spacing.md,
    borderRadius: sizing.radiusButton,
    paddingVertical: 14, // button tall geometry
    alignItems: 'center',
  },
  doneButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
