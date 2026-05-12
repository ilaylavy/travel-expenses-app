import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/chat/ChatBubble';
import { EmptyState } from '@/components/chat/EmptyState';
import { FollowUpChips } from '@/components/chat/FollowUpChips';
import { MessageInput } from '@/components/chat/MessageInput';
import { KeyboardAwareWrapper } from '@/components/ui/KeyboardAwareWrapper';
import { borderWidth, sizing, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import {
  askQuestion,
  type AskResponse,
  type ConversationMessage,
} from '@/services/aiQueryService';
import { useTripStore } from '@/stores/tripStore';
import { href } from '@/utils/nav';

interface UiMessage extends ConversationMessage {
  tryAgain?: boolean;
  previousUser?: string;
  followUps?: string[];
}

const THINKING_KEYS = [
  'ask.thinking1',
  'ask.thinking2',
  'ask.thinking3',
  'ask.thinking4',
] as const;

export default function AskScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, pulse]);

  // Rotate the "thinking..." copy every 3s while waiting on the AI so the
  // user sees forward motion instead of a frozen "Thinking..." for the full
  // (often 6-15s) round trip.
  useEffect(() => {
    if (!loading) {
      setThinkingIdx(0);
      return;
    }
    const id = setInterval(() => {
      setThinkingIdx((i) => (i + 1) % THINKING_KEYS.length);
    }, 3000);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, loading]);

  // When the keyboard opens, scroll to the latest message so the input bar
  // and the most recent reply both stay visible above the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!tripId) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      const userMsg: UiMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      const historyForApi: ConversationMessage[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const language: 'en' | 'he' = i18n.language === 'he' ? 'he' : 'en';
      const result: AskResponse = await askQuestion(
        tripId,
        trimmed,
        historyForApi.slice(0, -1),
        language,
        {
          offlineMessage: t('ask.offline'),
          errorMessage: t('ask.error'),
        },
      );

      const aiMsg: UiMessage = {
        role: 'assistant',
        content: result.answer,
        followUps: result.followUps,
        tryAgain: result.intent === 'error',
        previousUser: result.intent === 'error' ? trimmed : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLoading(false);
    },
    [messages, tripId, t, i18n.language],
  );

  const handleSendCurrent = useCallback(() => {
    void send(input);
  }, [input, send]);

  const handleReset = useCallback(() => {
    setMessages([]);
    setInput('');
    setLoading(false);
  }, []);

  const handlePick = useCallback(
    (question: string) => {
      void send(question);
    },
    [send],
  );

  const lastAiIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  if (!trip || !tripId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.missing}>
          <Text style={{ color: theme.textSecondary }}>{t('trips.notFound')}</Text>
          <Pressable
            onPress={() => router.replace(href('/(main)'))}
            style={[styles.linkButton, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.linkButtonText}>{t('trips.backToTrips')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <KeyboardAwareWrapper hasBottomTab hasFixedBottom style={styles.flex}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.headerButton,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              },
            ]}
            hitSlop={8}
          >
            <Text style={[styles.headerButtonText, { color: theme.text }]}>‹</Text>
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {t('ask.title')}
            </Text>
          </View>
          {messages.length > 0 || loading ? (
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [
                styles.headerButton,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
              ]}
              hitSlop={8}
              accessibilityLabel={t('ask.refreshA11yLabel')}
            >
              <Text style={[styles.headerButtonText, { color: theme.text }]}>↻</Text>
            </Pressable>
          ) : (
            <View style={[styles.headerButton, styles.headerButtonGhost]} />
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.length === 0 && !loading ? (
            <EmptyState trip={trip} onPick={handlePick} />
          ) : null}

          {messages.map((m, idx) => {
            const showFollowUps =
              m.role === 'assistant' &&
              idx === lastAiIdx &&
              !loading &&
              !m.tryAgain &&
              (m.followUps?.length ?? 0) > 0;
            return (
              <View key={idx} style={styles.messageBlock}>
                <ChatBubble
                  role={m.role}
                  content={m.content}
                  onTryAgain={
                    m.tryAgain && m.previousUser
                      ? () => {
                          void send(m.previousUser!);
                        }
                      : undefined
                  }
                />
                {showFollowUps && m.followUps ? (
                  <FollowUpChips chips={m.followUps} onPress={handlePick} />
                ) : null}
              </View>
            );
          })}

          {loading ? (
            <View style={styles.messageBlock}>
              <Animated.View style={{ opacity: pulse }}>
                <ChatBubble role="assistant" content={t(THINKING_KEYS[thinkingIdx])} />
              </Animated.View>
            </View>
          ) : null}
        </ScrollView>

        <MessageInput
          value={input}
          onChange={setInput}
          onSend={handleSendCurrent}
          disabled={loading}
        />
      </KeyboardAwareWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
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
    borderWidth: borderWidth.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonGhost: { borderColor: 'transparent', opacity: 0 },
  headerButtonText: { fontSize: 18, fontWeight: '600', lineHeight: 20 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.itemTitle },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md + 2, gap: spacing.xs },
  messageBlock: { gap: spacing.xs },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  linkButton: {
    borderRadius: sizing.radiusButton,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2, // 12 — taller button
  },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
