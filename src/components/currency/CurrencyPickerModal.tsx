import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { CURRENCIES, type Currency } from '@/constants/currencies';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  visible: boolean;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  onClose: () => void;
  favoriteCodes: ReadonlySet<string>;
  onToggleFavorite: (code: string) => void;
  // Home currency is always a favorite — its star renders locked.
  homeCurrency: string;
}

function filterCurrencies(query: string): readonly Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return CURRENCIES;
  return CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q),
  );
}

export function CurrencyPickerModal({
  visible,
  selectedCode,
  onSelect,
  onClose,
  favoriteCodes,
  onToggleFavorite,
  homeCurrency,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const data = useMemo(() => filterCurrencies(query), [query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            {t('currency.picker.title')}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
          >
            <Icon name="x" size={16} color={theme.text} stroke={2.2} />
          </Pressable>
        </View>

        <View style={styles.searchWrapper}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('currency.picker.searchPlaceholder')}
            placeholderTextColor={theme.textMuted}
            style={[
              styles.search,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
            autoCorrect={false}
            autoCapitalize="characters"
          />
        </View>

        <FlatList
          data={data}
          keyExtractor={(c) => c.code}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const active = item.code === selectedCode;
            const isFavorite = favoriteCodes.has(item.code);
            const isHome = item.code === homeCurrency;
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: active ? theme.accentSoft : 'transparent',
                    borderColor: theme.borderLight,
                  },
                ]}
              >
                <Pressable
                  onPress={() => {
                    onSelect(item.code);
                    onClose();
                    setQuery('');
                  }}
                  style={({ pressed }) => [
                    styles.rowBody,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View
                    style={[
                      styles.symbolWrap,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.symbol, { color: theme.text }]}>{item.symbol}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowCode, { color: active ? theme.accent : theme.text }]}>
                      {item.code}
                    </Text>
                    <Text style={[styles.rowName, { color: theme.textSecondary }]}>
                      {item.name}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (isHome) return;
                    onToggleFavorite(item.code);
                  }}
                  disabled={isHome}
                  hitSlop={10}
                  accessibilityLabel={
                    isHome
                      ? t('currency.picker.homeCurrencyLocked')
                      : t('currency.picker.favoriteToggle')
                  }
                  style={[
                    styles.starButton,
                    isHome ? { opacity: 0.5 } : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.starIcon,
                      { color: isFavorite ? theme.accent : theme.textMuted },
                    ]}
                  >
                    {isFavorite ? '★' : '☆'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: typography.screenTitle,
  headerButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // (formerly headerButtonText — replaced by SVG icons.)
  searchWrapper: { paddingHorizontal: spacing.base, paddingBottom: spacing.md },
  search: {
    ...typography.body,
    borderWidth: borderWidth.hairline,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: sizing.radiusButton,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  symbolWrap: {
    width: sizing.categoryIconSmall,
    height: sizing.categoryIconSmall,
    borderRadius: sizing.radiusSmall,
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { ...typography.itemTitle },
  rowText: { flex: 1 },
  rowCode: { ...typography.itemTitle, marginBottom: 2 },
  rowName: typography.secondary,
  starButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starIcon: { fontSize: 22, fontWeight: '700' },
});
