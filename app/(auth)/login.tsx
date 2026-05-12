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
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/stores/authStore';
import { href } from '@/utils/nav';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const signIn = useAuthStore((s) => s.signIn);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('auth.login.missingInfoTitle'), t('auth.login.missingInfoBody'));
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
      router.replace(href('/(main)'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.login.failedFallback');
      Alert.alert(t('auth.login.failedTitle'), message);
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
              <Text style={styles.heroEmoji}>✈️</Text>
            </LinearGradient>
            <Text style={[styles.title, { color: theme.text }]}>{t('auth.login.heroTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {t('auth.login.heroSubtitle')}
            </Text>
          </View>

          <View style={styles.form}>
            <Field
              label={t('auth.login.email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.login.emailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              theme={theme}
            />
            <Field
              label={t('auth.login.password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.login.passwordPlaceholder')}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              theme={theme}
            />

            <Pressable
              onPress={handleLogin}
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
                colors={theme.gradient1}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitText}>{t('auth.login.submit')}</Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                {t('auth.login.footerPrompt')}
              </Text>
              <Link href="/(auth)/signup" asChild>
                <Pressable>
                  <Text style={[styles.footerLink, { color: theme.accent }]}>
                    {t('auth.login.footerLink')}
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

interface FieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
  theme: ReturnType<typeof useTheme>;
}

function Field({ label, theme, style, ...props }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textMuted}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xxl, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.xxl + spacing.md },
  heroBadge: {
    width: 88, // brand mark geometry
    height: 88,
    borderRadius: sizing.radiusCard + 6, // 28 — slightly more rounded than card
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 12,
  },
  heroEmoji: { fontSize: 44 },
  title: { ...typography.title, textAlign: 'center' },
  subtitle: { ...typography.body, textAlign: 'center', marginTop: spacing.sm },
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.subtitle },
  input: {
    ...typography.body,
    height: 52, // form field tall geometry
    borderRadius: sizing.radiusInput,
    borderWidth: borderWidth.base,
    paddingHorizontal: spacing.lg,
  },
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
