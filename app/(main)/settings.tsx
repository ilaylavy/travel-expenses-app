import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencyPickerModal } from '@/components/currency/CurrencyPickerModal';
import { sizing, spacing, typography } from '@/constants/theme';
import { deleteDatabase } from '@/db/database';
import { getProfile, updateProfile, type Profile } from '@/db/queries/profiles';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { type LanguagePref } from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSyncStore } from '@/stores/syncStore';
import { useTripStore } from '@/stores/tripStore';
import { syncEngine } from '@/sync/syncEngine';
import { href } from '@/utils/nav';
import { initials } from '@/utils/initials';

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

const LANGUAGE_OPTIONS: readonly LanguagePref[] = ['auto', 'en', 'he'];

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
    async (next: LanguagePref): Promise<void> => {
      if (next === language) return;
      const directionChanged = await setLanguage(next);
      if (directionChanged) {
        Alert.alert(
          t('language.rtlRestartTitle'),
          t('language.rtlRestartBody'),
        );
      }
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
    Alert.alert(
      t('settings.account.signOutConfirmTitle'),
      t('settings.account.signOutConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.signOut'),
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              await resetAllStoresAndDb();
            } catch (e) {
              console.warn('Sign out failed:', e);
              Alert.alert(t('settings.account.signOutFailed'));
            }
          },
        },
      ],
    );
  }, [t, signOut, resetAllStoresAndDb]);

  const handleDeleteAccount = useCallback((): void => {
    Alert.alert(
      t('settings.account.deleteConfirmTitle'),
      t('settings.account.deleteConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            // MVP: deletion is a v2 feature. For now, signing out is the safe
            // fallback; server-side account deletion will come later.
            try {
              await signOut();
              await resetAllStoresAndDb();
            } catch (e) {
              console.warn('Delete (sign out) failed:', e);
            }
          },
        },
      ],
    );
  }, [t, signOut, resetAllStoresAndDb]);

  const email = user?.email ?? '—';
  const displayName = profile?.name ?? nameDraft ?? '';
  const effectiveCurrency = profile?.defaultCurrency ?? settingsDefaultCurrency;

  const syncDotColor = (() => {
    if (syncStatus === 'error') return theme.red;
    if (syncStatus === 'syncing' || syncStatus === 'pending' || pendingCount > 0) return theme.orange;
    return theme.green;
  })();

  const syncStatusLabel = (() => {
    if (syncStatus === 'error') return t('settings.sync.statusError');
    if (syncStatus === 'syncing') return t('sync.syncing');
    if (pendingCount > 0) return t('settings.sync.statusPending');
    return t('settings.sync.statusSynced');
  })();

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

      <ScrollView contentContainerStyle={styles.content}>
        {/* PROFILE */}
        <SectionHeader theme={theme} label={t('settings.profile.section')} />
        <Card theme={theme}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.avatarText, { color: theme.accent }]}>
                {initials(displayName || email)}
              </Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={[styles.labelSmall, { color: theme.textSecondary }]}>
                {t('settings.profile.nameLabel')}
              </Text>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                onBlur={() => { void handleSaveName(); }}
                onSubmitEditing={() => { void handleSaveName(); }}
                editable={!nameSaving}
                returnKeyType="done"
                placeholder={t('settings.profile.namePlaceholder')}
                placeholderTextColor={theme.textMuted}
                style={[
                  styles.nameInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                  },
                ]}
              />
              <Text style={[styles.labelSmall, { color: theme.textSecondary, marginTop: spacing.sm }]}>
                {t('settings.profile.emailLabel')}
              </Text>
              <Text style={[styles.emailValue, { color: theme.text }]} numberOfLines={1}>
                {email}
              </Text>
            </View>
          </View>
        </Card>

        {/* PREFERENCES */}
        <SectionHeader theme={theme} label={t('settings.preferences.section')} />
        <Card theme={theme}>
          <Row
            theme={theme}
            label={t('settings.preferences.theme')}
            right={
              <Segment
                theme={theme}
                options={[
                  { value: 'light', label: `☀️ ${t('settings.preferences.themeLight')}` },
                  { value: 'dark', label: `🌙 ${t('settings.preferences.themeDark')}` },
                ]}
                value={isDark ? 'dark' : 'light'}
                onChange={(v) => {
                  if ((v === 'dark') !== isDark) toggleTheme();
                }}
              />
            }
          />
          <Divider theme={theme} />
          <Row
            theme={theme}
            label={t('settings.preferences.language')}
            right={
              <Segment
                theme={theme}
                options={LANGUAGE_OPTIONS.map((opt) => ({
                  value: opt,
                  label: t(`language.${opt === 'auto' ? 'auto' : opt === 'en' ? 'english' : 'hebrew'}`),
                }))}
                value={language}
                onChange={(v) => { void handleSetLanguage(v as LanguagePref); }}
              />
            }
          />
          <Divider theme={theme} />
          <Pressable
            onPress={() => setCurrencyPickerOpen(true)}
            style={({ pressed }) => [styles.pressableRow, pressed && { opacity: 0.7 }]}
          >
            <Row
              theme={theme}
              label={t('settings.preferences.defaultCurrency')}
              right={
                <View style={styles.valuePill}>
                  <Text style={[styles.valuePillText, { color: theme.accent }]}>
                    {effectiveCurrency}
                  </Text>
                  <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
                </View>
              }
            />
          </Pressable>
        </Card>

        {/* CATEGORIES */}
        <SectionHeader theme={theme} label={t('settings.categories.section')} />
        <Card theme={theme}>
          <Pressable
            onPress={() => router.push(href('/categories'))}
            style={({ pressed }) => [styles.pressableRow, pressed && { opacity: 0.7 }]}
          >
            <Row
              theme={theme}
              label={t('settings.categories.manageDefaults')}
              subtitle={t('settings.categories.count', { count: defaultCategoryCount })}
              right={<Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>}
            />
          </Pressable>
        </Card>

        {/* DATA & SYNC */}
        <SectionHeader theme={theme} label={t('settings.sync.section')} />
        <Card theme={theme}>
          <Row
            theme={theme}
            label={t('settings.sync.status')}
            right={
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: syncDotColor }]} />
                <Text style={[styles.valueText, { color: theme.text }]}>
                  {syncStatusLabel}
                </Text>
              </View>
            }
          />
          <Divider theme={theme} />
          <Row
            theme={theme}
            label={t('settings.sync.lastSynced')}
            right={
              <Text style={[styles.valueText, { color: theme.textSecondary }]}>
                {lastSyncedLabel}
              </Text>
            }
          />
          <Divider theme={theme} />
          <Row
            theme={theme}
            label={t('settings.sync.pendingChanges')}
            right={
              <Text style={[styles.valueText, { color: theme.text }]}>
                {pendingCount}
              </Text>
            }
          />
          <Pressable
            onPress={() => { void handleSyncNow(); }}
            disabled={syncStatus === 'syncing'}
            style={({ pressed }) => [
              styles.syncButton,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.accent,
                opacity: pressed || syncStatus === 'syncing' ? 0.7 : 1,
              },
            ]}
          >
            <Text style={[styles.syncButtonText, { color: theme.accent }]}>
              {t('sync.syncNow')}
            </Text>
          </Pressable>
        </Card>

        {/* ACCOUNT */}
        <SectionHeader theme={theme} label={t('settings.account.section')} />
        <Card theme={theme}>
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [styles.pressableRow, pressed && { opacity: 0.7 }]}
          >
            <Row
              theme={theme}
              label={t('settings.account.signOut')}
              right={<Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>}
            />
          </Pressable>
          <Divider theme={theme} />
          <Pressable
            onPress={handleDeleteAccount}
            style={({ pressed }) => [styles.pressableRow, pressed && { opacity: 0.7 }]}
          >
            <Row
              theme={theme}
              label={
                <Text style={[styles.labelText, { color: theme.red }]}>
                  {t('settings.account.deleteAccount')}
                </Text>
              }
              right={<Text style={[styles.chevron, { color: theme.red }]}>›</Text>}
            />
          </Pressable>
        </Card>

        {/* ABOUT */}
        <SectionHeader theme={theme} label={t('settings.about.section')} />
        <Card theme={theme}>
          <Row
            theme={theme}
            label={t('settings.about.appName')}
            right={
              <Text style={[styles.valueText, { color: theme.text }]}>
                {t('common.appName')}
              </Text>
            }
          />
          <Divider theme={theme} />
          <Row
            theme={theme}
            label={t('settings.about.version')}
            right={
              <Text style={[styles.valueText, { color: theme.textSecondary }]}>
                {APP_VERSION}
              </Text>
            }
          />
        </Card>

        <Text style={[styles.footer, { color: theme.textMuted }]}>
          {t('settings.about.footer')}
        </Text>
      </ScrollView>

      <CurrencyPickerModal
        visible={currencyPickerOpen}
        selectedCode={effectiveCurrency}
        onSelect={(code) => { void handleSelectCurrency(code); }}
        onClose={() => setCurrencyPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

function SectionHeader({
  theme,
  label,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
}) {
  return (
    <Text style={[styles.sectionHeader, { color: theme.textMuted }]}>
      {label.toUpperCase()}
    </Text>
  );
}

function Card({
  theme,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      {children}
    </View>
  );
}

function Row({
  theme,
  label,
  subtitle,
  right,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string | React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelWrap}>
        {typeof label === 'string' ? (
          <Text style={[styles.labelText, { color: theme.text }]}>{label}</Text>
        ) : (
          label
        )}
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </View>
  );
}

function Divider({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />;
}

function Segment<T extends string>({
  theme,
  options,
  value,
  onChange,
}: {
  theme: ReturnType<typeof useTheme>;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={[styles.segment, { backgroundColor: theme.bg, borderColor: theme.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentBtn,
              active && { backgroundColor: theme.accent },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: active ? '#FFFFFF' : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  sectionHeader: {
    ...typography.micro,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  card: {
    borderRadius: sizing.radiusCard,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: sizing.categoryIconLarge,
    height: sizing.categoryIconLarge,
    borderRadius: sizing.categoryIconLarge / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  profileMeta: { flex: 1, minWidth: 0 },
  labelSmall: { ...typography.caption, marginBottom: 4 },
  nameInput: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: sizing.radiusInput,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontWeight: '600',
  },
  emailValue: { ...typography.body, fontWeight: '500' },
  pressableRow: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowLabelWrap: { flex: 1, minWidth: 0 },
  rowRight: { flexShrink: 0 },
  labelText: { ...typography.body, fontWeight: '600' },
  subtitle: { ...typography.caption, marginTop: 2 },
  valueText: { ...typography.body, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth },
  segment: {
    flexDirection: 'row',
    borderRadius: sizing.radiusButton,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: sizing.radiusButton - 2,
  },
  segmentText: { fontSize: 12, fontWeight: '700' },
  valuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  valuePillText: { ...typography.body, fontWeight: '700' },
  chevron: { fontSize: 20, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  syncButton: {
    marginVertical: spacing.md,
    borderRadius: sizing.radiusButton,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  syncButtonText: { fontSize: 14, fontWeight: '700' },
  footer: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});
