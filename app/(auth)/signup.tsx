import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Input } from '@/components/ui/Input';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { CURRENCIES, DEFAULT_CURRENCY } from '@/constants/currencies';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { href } from '@/utils/nav';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const signUp = useAuthStore((s) => s.signUp);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setDefaultCurrencyPref = useSettingsStore((s) => s.setDefaultCurrency);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t('formErrors.required');
    if (!email.trim()) next.email = t('formErrors.required');
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = t('formErrors.emailInvalid');
    if (!password) next.password = t('formErrors.required');
    else if (password.length < 6) next.password = t('formErrors.passwordTooShort');
    return next;
  };

  const handleSignup = async () => {
    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        name: name.trim(),
        defaultCurrency: currency,
      });
      setDefaultCurrencyPref(currency);
      router.replace(href('/(main)'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.signup.failedFallback');
      Alert.alert(t('auth.signup.failedTitle'), message);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isLoading || submitting;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAwareWrapper>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={theme.fabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroBadge, { shadowColor: theme.accentGlow }]}
            >
              <Icon name="flight" size={42} color="#FFFFFF" stroke={1.6} />
            </LinearGradient>
            <Text style={[styles.title, { color: theme.text }]}>{t('auth.signup.heroTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('auth.signup.heroSubtitle')}
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label={t('auth.signup.name')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
              }}
              placeholder={t('auth.signup.namePlaceholder')}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              error={Boolean(errors.name)}
              helper={errors.name}
            />
            <Input
              label={t('auth.signup.email')}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
              }}
              placeholder={t('auth.signup.emailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              error={Boolean(errors.email)}
              helper={errors.email}
            />
            <Input
              label={t('auth.signup.password')}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
              }}
              placeholder={t('auth.signup.passwordPlaceholder')}
              secureTextEntry
              autoComplete="password-new"
              textContentType="newPassword"
              error={Boolean(errors.password)}
              helper={errors.password}
            />

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textMuted }]}>
                {t('auth.signup.defaultCurrency').toUpperCase()}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.currencyRow}
              >
                {CURRENCIES.map((c) => {
                  const selected = c.code === currency;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => setCurrency(c.code)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: selected ? theme.accentSoft : theme.surface,
                          borderColor: selected ? theme.accent : theme.border,
                          transform: [{ scale: pressed ? 0.96 : 1 }],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: selected ? theme.accent : theme.textSecondary },
                        ]}
                      >
                        {c.symbol} {c.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              onPress={handleSignup}
              disabled={busy}
              style={({ pressed }) => [
                styles.submit,
                {
                  opacity: busy ? 0.85 : 1,
                  transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
                },
              ]}
            >
              <LinearGradient
                colors={theme.fabGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.submitGradient}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>{t('auth.signup.submit')}</Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                {t('auth.signup.footerPrompt')}
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text style={[styles.footerLink, { color: theme.accent }]}>
                    {t('auth.signup.footerLink')}
                  </Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAwareWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xxl, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.xxl },
  heroBadge: {
    width: 88,
    height: 88,
    borderRadius: sizing.radiusCard + 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 12,
  },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: { ...typography.body, textAlign: 'center', marginTop: spacing.sm },
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.micro, letterSpacing: 0.5 },
  currencyRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 7,
    borderRadius: sizing.radiusPill,
    borderWidth: borderWidth.hairline,
  },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  submit: { marginTop: spacing.md, borderRadius: sizing.radiusButton, overflow: 'hidden' },
  submitGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: sizing.radiusButton,
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  footerText: { ...typography.secondary },
  footerLink: { ...typography.secondary, fontWeight: '700' },
});
