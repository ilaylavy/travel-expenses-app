import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencyPickerModal } from '@/components/currency/CurrencyPickerModal';
import { AboutSection } from '@/components/settings/AboutSection';
import { AccountSection } from '@/components/settings/AccountSection';
import { CategoriesSection } from '@/components/settings/CategoriesSection';
import { PreferencesSection } from '@/components/settings/PreferencesSection';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { SyncSection, type SyncSectionStatus } from '@/components/settings/SyncSection';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { sizing, spacing, typography } from '@/constants/theme';
import { showConfirmDialog } from '@/utils/confirmDialog';
import { deleteDatabase } from '@/db/database';
import { getProfile, updateProfile } from '@/db/queries/profiles';
import type { Profile } from '@/types/profile';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { isRTLLanguage, resolveLanguage, type LanguagePref } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import { href } from '@/utils/nav';

const APP_VERSION = '1.0.0';

function formatAgo(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return `${Math.round(diffHr / 24)}d`;
}

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const isDark = useSettingsStore((s) => s.isDark);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const settingsDefaultCurrency = useSettingsStore((s) => s.defaultCurrency);
  const setSettingsDefaultCurrency = useSettingsStore((s) => s.setDefaultCurrency);
  const favoriteCurrencies = useSettingsStore((s) => s.favoriteCurrencies);
  const toggleFavoriteCurrency = useSettingsStore((s) => s.toggleFavoriteCurrency);
  const favoriteCodesSet = useMemo(() => new Set(favoriteCurrencies), [favoriteCurrencies]);

  const syncStatus = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  const categories = useCategoryStore((s) => s.categories);
  const defaultCategoryCount = useMemo(
    () => categories.filter((c) => c.tripId === null && !c.isArchived).length,
    [categories],
  );

  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const p = await getProfile(user.id);
      if (!cancelled) {
        setProfile(p);
        setNameDraft(p?.name ?? '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSaveName = useCallback(async (): Promise<void> => {
    if (!user?.id || !profile) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0 || trimmed === profile.name) {
      setNameDraft(profile.name);
      return;
    }
    setNameSaving(true);
    try {
      const next = await updateProfile({ userId: user.id, name: trimmed });
      setProfile(next);
      void syncEngine.triggerSync();
    } catch (e) {
      console.warn('Failed to save name:', e);
      Alert.alert(t('settings.profile.saveFailed'));
      setNameDraft(profile.name);
    } finally {
      setNameSaving(false);
    }
  }, [user?.id, profile, nameDraft, t]);

  const handleSelectCurrency = useCallback(
    async (code: string): Promise<void> => {
      if (!user?.id) return;
      setSettingsDefaultCurrency(code);
      try {
        const next = await updateProfile({ userId: user.id, defaultCurrency: code });
        setProfile(next);
        void syncEngine.triggerSync();
      } catch (e) {
        console.warn('Failed to save default currency:', e);
      }
    },
    [user?.id, setSettingsDefaultCurrency],
  );

  const handleSetLanguage = useCallback(
    (next: LanguagePref): void => {
      if (next === language) return;
      const directionWillChange =
        isRTLLanguage(resolveLanguage(language)) !== isRTLLanguage(resolveLanguage(next));
      if (!directionWillChange) {
        void setLanguage(next);
        return;
      }
      Alert.alert(t('language.rtlRestartTitle'), t('language.rtlRestartBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('language.rtlRestartConfirm'),
          style: 'default',
          onPress: async () => {
            await setLanguage(next);
            if (Platform.OS === 'web') {
              // <html dir> is updated synchronously by applyRTL; reloading
              // makes RN-web re-pick up the direction so layout-mirrored
              // components rerender from scratch.
              if (typeof window !== 'undefined') window.location.reload();
              return;
            }
            // Lazy-require: native module is unavailable in Expo Go; production
            // builds bundle it and exit normally on Android.
            if (Platform.OS === 'android') {
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const RNExitApp = require('react-native-exit-app').default;
                RNExitApp.exitApp();
              } catch {
                // Native module unavailable (e.g. Expo Go); user must restart manually.
              }
            }
          },
        },
      ]);
    },
    [language, setLanguage, t],
  );

  const handleSyncNow = useCallback(async (): Promise<void> => {
    await syncEngine.triggerSync();
    const state = useSyncStore.getState();
    if (state.status === 'error') {
      Alert.alert(t('sync.errorTitle'), state.lastError ?? t('sync.errorBody'));
    } else {
      Alert.alert(t('sync.successTitle'), t('sync.successBody'));
    }
  }, [t]);

  const resetAllStoresAndDb = useCallback(async (): Promise<void> => {
    useExpenseStore.getState().clear();
    useTripStore.getState().reset();
    useCategoryStore.getState().reset();
    useSyncStore.getState().reset();
    try {
      await deleteDatabase();
    } catch (e) {
      console.warn('Failed to reset local database:', e);
    }
  }, []);

  const handleSignOut = useCallback((): void => {
    showConfirmDialog({
      title: t('settings.account.signOutConfirmTitle'),
      body: t('settings.account.signOutConfirmBody'),
      confirmLabel: t('settings.account.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await signOut();
          await resetAllStoresAndDb();
        } catch (e) {
          console.warn('Sign out failed:', e);
          Alert.alert(t('settings.account.signOutFailed'));
        }
      },
    });
  }, [t, signOut, resetAllStoresAndDb]);

  const handleDeleteAccount = useCallback((): void => {
    showConfirmDialog({
      title: t('settings.account.deleteConfirmTitle'),
      body: t('settings.account.deleteConfirmBody'),
      confirmLabel: t('settings.account.deleteAccount'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        // MVP: deletion is a v2 feature. For now, signing out is the safe
        // fallback; server-side account deletion will come later.
        try {
          await signOut();
          await resetAllStoresAndDb();
        } catch (e) {
          console.warn('Delete (sign out) failed:', e);
        }
      },
    });
  }, [t, signOut, resetAllStoresAndDb]);

  const email = user?.email ?? '—';
  const displayName = profile?.name ?? nameDraft ?? '';
  const effectiveCurrency = profile?.defaultCurrency ?? settingsDefaultCurrency;

  const lastSyncedLabel = (() => {
    const ago = formatAgo(lastSyncedAt);
    if (ago) return t('sync.lastSynced', { time: ago });
    return t('sync.neverSynced');
  })();

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
        <Text style={[styles.title, { color: theme.text }]}>{t('settings.title')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAwareWrapper>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <ProfileSection
            email={email}
            displayName={displayName}
            nameDraft={nameDraft}
            onChangeName={setNameDraft}
            onSaveName={() => {
              void handleSaveName();
            }}
            saving={nameSaving}
          />

          <PreferencesSection
            isDark={isDark}
            onToggleTheme={toggleTheme}
            language={language}
            onChangeLanguage={handleSetLanguage}
            defaultCurrency={effectiveCurrency}
            onOpenCurrencyPicker={() => setCurrencyPickerOpen(true)}
          />

          <CategoriesSection
            defaultCategoryCount={defaultCategoryCount}
            onPress={() => router.push(href('/categories'))}
          />

          <SyncSection
            status={syncStatus as SyncSectionStatus}
            pendingCount={pendingCount}
            lastSyncedLabel={lastSyncedLabel}
            onSyncNow={() => {
              void handleSyncNow();
            }}
          />

          <AccountSection onSignOut={handleSignOut} onDeleteAccount={handleDeleteAccount} />

          <AboutSection version={APP_VERSION} />

          <Text style={[styles.footer, { color: theme.textMuted }]}>
            {t('settings.about.footer')}
          </Text>
        </ScrollView>
      </KeyboardAwareWrapper>

      <CurrencyPickerModal
        visible={currencyPickerOpen}
        selectedCode={effectiveCurrency}
        onSelect={(code) => {
          void handleSelectCurrency(code);
        }}
        onClose={() => setCurrencyPickerOpen(false)}
        favoriteCodes={favoriteCodesSet}
        onToggleFavorite={toggleFavoriteCurrency}
        homeCurrency={settingsDefaultCurrency}
      />
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
  content: { padding: spacing.base, paddingBottom: spacing.xxl, gap: spacing.md },
  footer: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});
