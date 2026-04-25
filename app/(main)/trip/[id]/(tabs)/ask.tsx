import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
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
import { sizing, spacing, typography } from '@/constants/theme';
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

export default function AskScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const params = useGlobalSearchParams<{ id: string }>();
  const tripId = Array.isArray(params.id) ? params.id[0] : params.id;
  const trip = useTripStore((s) => s.trips.find((x) => x.id === tripId));

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, loading]);

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

      const result: AskResponse = await askQuestion(tripId, trimmed, historyForApi.slice(0, -1), {
        offlineMessage: t('ask.offline'),
        errorMessage: t('ask.error'),
      });

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
    [messages, tripId, t],
  );

  const handleSendCurrent = useCallback(() => {
    void send(input);
  }, [input, send]);

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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={[
              styles.headerButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
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
          <View style={[styles.headerButton, styles.headerButtonGhost]} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
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
                <ChatBubble role="assistant" content={t('ask.thinking')} />
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
      </KeyboardAvoidingView>
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonGhost: { borderColor: 'transparent', opacity: 0 },
  headerButtonText: { fontSize: 18, fontWeight: '600', lineHeight: 20 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { ...typography.itemTitle },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 12, gap: 4 },
  messageBlock: { gap: 4 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  linkButton: {
    borderRadius: sizing.radiusButton,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  linkButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
