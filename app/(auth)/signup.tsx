import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CURRENCIES, DEFAULT_CURRENCY } from '@/constants/currencies';
import { sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';

export default function SignupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setDefaultCurrencyPref = useSettingsStore((s) => s.setDefaultCurrency);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing info', 'Please fill in name, email, and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Please use a password of at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        name: name.trim(),
        defaultCurrency: currency,
      });
      setDefaultCurrencyPref(currency);
      router.replace('/(main)/(tabs)/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign up.';
      Alert.alert('Signup failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isLoading || submitting;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={theme.fabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroBadge, { shadowColor: theme.accentGlow }]}
            >
              <Text style={styles.heroEmoji}>🧳</Text>
            </LinearGradient>
            <Text style={[styles.title, { color: theme.text }]}>Start your journey</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Create an account to track trips and expenses.
            </Text>
          </View>

          <View style={styles.form}>
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              theme={theme}
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@travel.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              theme={theme}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoComplete="password-new"
              textContentType="newPassword"
              theme={theme}
            />

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Default currency</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.currencyRow}
              >
                {CURRENCIES.map((c) => {
                  const selected = c.code === currency;
                  return (
                    <Pressable key={c.code} onPress={() => setCurrency(c.code)}>
                      <View
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? theme.accentSoft : theme.surface,
                            borderColor: selected ? theme.accent : theme.border,
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
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Pressable
              onPress={handleSignup}
              disabled={busy}
              style={({ pressed }) => [styles.submit, { opacity: pressed || busy ? 0.85 : 1 }]}
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
                  <Text style={styles.submitText}>Create account</Text>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Already have an account?
              </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text style={[styles.footerLink, { color: theme.accent }]}>Log in</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  hero: { alignItems: 'center', marginBottom: spacing.xxl },
  heroBadge: {
    width: 88,
    height: 88,
    borderRadius: 28,
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
    height: 52,
    borderRadius: sizing.radiusInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
  },
  currencyRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: sizing.radiusChip,
    borderWidth: 1.5,
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
