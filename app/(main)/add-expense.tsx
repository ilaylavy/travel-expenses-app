import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdvancedTogglesSection } from '@/components/expense/entry/AdvancedTogglesSection';
import { AmountSection } from '@/components/expense/entry/AmountSection';
import { CategorySection } from '@/components/expense/entry/CategorySection';
import { DateTimeSection } from '@/components/expense/entry/DateTimeSection';
import { LocationSection } from '@/components/expense/entry/LocationSection';
import { NoteSuggestionsRow } from '@/components/expense/entry/NoteSuggestionsRow';
import { PaymentMethodRow } from '@/components/expense/entry/PaymentMethodRow';
import { PhotoSection } from '@/components/expense/entry/PhotoSection';
import { Section } from '@/components/expense/entry/Section';
import { SplitParticipantsList } from '@/components/expense/entry/SplitParticipantsList';
import { NumPad, appendNumPadKey, type NumPadKey } from '@/components/expense/numpad/NumPad';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { sizing, spacing, typography } from '@/constants/theme';
import { useExpenseEntryForm } from '@/hooks/useExpenseEntryForm';
import { useIsRTL } from '@/hooks/useIsRTL';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';

// Approx height of the numpad bar: 4 rows × 50px keys + 3 × spacing.sm gaps
// + numpadBar paddings (top spacing.sm + bottom spacing.base).
const NUMPAD_BAR_HEIGHT = 4 * 50 + 3 * spacing.sm + spacing.sm + spacing.base;

export default function AddExpenseScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const isRTL = useIsRTL();
  const params = useLocalSearchParams<{
    tripId?: string | string[];
    expenseId?: string | string[];
  }>();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const expenseId = Array.isArray(params.expenseId) ? params.expenseId[0] : params.expenseId;

  const form = useExpenseEntryForm({
    tripId,
    expenseId,
    onComplete: () => router.back(),
  });
  const photos = usePhotoCapture();

  const handleKey = useCallback(
    (key: NumPadKey) => {
      form.setAmountText(appendNumPadKey(form.amountText, key));
    },
    [form],
  );
  const handleLongBackspace = useCallback(() => {
    form.setAmountText('');
  }, [form]);

  const handleSave = useCallback(async () => {
    const persistedPhotos = form.isEditing ? undefined : await photos.persistAll();
    await form.save({ persistedPhotos });
  }, [form, photos]);

  // Floating Save FAB rides above whatever is at the bottom: numpad bar,
  // system keyboard, or just the safe-area edge. The bottom system-nav
  // inset is handled by SafeAreaView (edges include 'bottom'), so this
  // offset is measured from above the nav bar.
  const fabBottomOffset = useMemo(() => {
    if (form.activeInput === 'numpad') {
      return NUMPAD_BAR_HEIGHT + spacing.lg;
    }
    if (form.activeInput === 'text' && form.keyboardHeight > 0) {
      return form.keyboardHeight + spacing.lg;
    }
    return spacing.md + spacing.lg;
  }, [form.activeInput, form.keyboardHeight]);

  if (!tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={[styles.headerButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.headerButtonText, { color: theme.text }]}>✕</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>
          {form.isEditing ? t('expense.editTitle') : t('expense.title')}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAwareWrapper hasFixedBottom>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <AmountSection
            amountText={form.amountText}
            currency={form.currency}
            homeCurrency={form.trip?.homeCurrency}
            exchangeRate={form.exchangeRate}
            manualRate={form.manualRate}
            rateStatus={form.rateStatus}
            convertedAmount={form.convertedAmount}
            showConverted={form.showConvertedPreview}
            stripCurrencies={form.stripCurrencies}
            favoriteCodes={form.favoriteCodesSet}
            onPickCurrency={form.pickCurrency}
            onToggleFavorite={form.toggleFavoriteCurrency}
            onAmountPress={form.handleAmountPress}
            onSetManualRate={form.setManualRate}
          />

          {/* Note + recent suggestions — placed above category so picking a
              suggestion can auto-select the category visible in the grid below. */}
          <Section title={t('expense.noteSection')}>
            <TextInput
              value={form.note}
              onChangeText={form.setNote}
              onFocus={form.handleTextFocus}
              placeholder={t('expense.notePlaceholder')}
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
              ]}
            />
            <NoteSuggestionsRow notes={form.filteredNotes} onPick={form.pickRecentNote} />
          </Section>

          <CategorySection
            visibleCategories={form.visibleCategories}
            selectedId={form.categoryId}
            onSelect={form.setCategoryId}
            hasMore={form.hasMoreCategories}
            expanded={form.categoriesExpanded}
            onToggleExpanded={() => form.setCategoriesExpanded((v) => !v)}
          />

          <DateTimeSection
            date={form.expenseDate}
            time={form.expenseTime}
            isSpread={form.isSpread}
            spreadStart={form.spreadStart}
            spreadEnd={form.spreadEnd}
            amountValue={form.amountValue}
            currency={form.currency}
            onDateChange={form.setExpenseDate}
            onTimeChange={form.setExpenseTime}
            onTimeFocus={form.handleTextFocus}
            onEnterSpread={form.enterSpread}
            onExitSpread={form.exitSpread}
            onSpreadRangeChange={form.handleSpreadRangeChange}
          />

          <PaymentMethodRow
            paymentMethod={form.paymentMethod}
            onChange={form.setPaymentMethod}
          />

          <LocationSection
            status={form.locationStatus}
            latitude={form.latitude}
            longitude={form.longitude}
            placeName={form.placeName}
            onRefresh={form.refreshLocation}
            onRemove={form.removeLocation}
          />

          <AdvancedTogglesSection
            isRefund={form.isRefund}
            setIsRefund={form.setIsRefund}
            isExcluded={form.isExcluded}
            setIsExcluded={form.setIsExcluded}
            isPrivate={form.isPrivate}
            setIsPrivate={form.setIsPrivate}
            isSharedTrip={form.isSharedTrip}
            splitEnabled={form.splitEnabled}
            setSplitEnabled={form.toggleSplit}
          />

          {form.isSharedTrip && form.splitEnabled ? (
            <SplitParticipantsList
              splitMode={form.splitMode}
              onModeChange={form.setSplitMode}
              participants={form.splitParticipants}
              onToggleParticipant={form.toggleSplitParticipant}
              customAmounts={form.customAmounts}
              onCustomAmountChange={form.setCustomAmount}
              onTextFocus={form.handleTextFocus}
              equalShares={form.equalShares}
              customAssigned={form.customAssigned}
              customMatchesTotal={form.customMatchesTotal}
              amountValue={form.amountValue}
              currency={form.currency}
              members={form.tripMembers}
              memberNames={form.memberNames}
              currentUserId={form.user?.id ?? null}
              onSplitRest={form.splitRest}
            />
          ) : null}

          {/* Photos — not editable in edit mode for now */}
          {!form.isEditing ? (
            <PhotoSection
              photos={photos.photos}
              onCamera={photos.handleCamera}
              onGallery={photos.handleGallery}
              onRemove={photos.removePhoto}
            />
          ) : null}

          {form.error ? (
            <Text style={[styles.error, { color: theme.red }]}>{form.error}</Text>
          ) : null}
        </ScrollView>

        {form.activeInput === 'numpad' ? (
          <View
            style={[
              styles.numpadBar,
              { backgroundColor: theme.bg, borderTopColor: theme.border },
            ]}
          >
            <NumPad
              onKeyPress={handleKey}
              onLongBackspace={handleLongBackspace}
              onDone={form.handleNumpadDone}
              disabled={form.saving}
            />
          </View>
        ) : null}

        <Pressable
          onPress={handleSave}
          disabled={!form.formIsValid || form.saving}
          style={[
            styles.fab,
            {
              bottom: fabBottomOffset,
              [isRTL ? 'left' : 'right']: spacing.lg,
              shadowColor: theme.accentGlow,
              opacity: !form.formIsValid || form.saving ? 0.5 : 1,
            },
          ]}
          accessibilityLabel={t('expense.save')}
        >
          <LinearGradient
            colors={theme.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabInner}
          >
            <Text style={styles.fabIcon}>{form.saving ? '…' : '✓'}</Text>
          </LinearGradient>
        </Pressable>
      </KeyboardAwareWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerButton: {
    width: sizing.headerButton,
    height: sizing.headerButton,
    borderRadius: sizing.headerButtonRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonText: { fontSize: 18, fontWeight: '600' },
  title: { ...typography.screenTitle, flex: 1, textAlign: 'center' },
  content: {
    padding: spacing.base,
    paddingBottom: NUMPAD_BAR_HEIGHT + spacing.xxl,
    gap: spacing.base,
  },
  input: {
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  error: { ...typography.caption, textAlign: 'center' },
  numpadBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
  },
  fab: {
    position: 'absolute',
    width: sizing.fabSize,
    height: sizing.fabSize,
    borderRadius: sizing.fabRadius,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 10,
  },
  fabInner: {
    flex: 1,
    borderRadius: sizing.fabRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
});
