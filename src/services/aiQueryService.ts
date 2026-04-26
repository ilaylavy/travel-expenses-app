import NetInfo from '@react-native-community/netinfo';

import { config } from '@/constants/config';
import { supabase } from '@/services/supabase';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskResponse {
  answer: string;
  followUps: string[];
  intent: string;
  error?: string;
}

interface AskOptions {
  offlineMessage: string;
  errorMessage: string;
}

const TIMEOUT_MS = 30_000;
const HISTORY_LIMIT = 10;

export async function askQuestion(
  tripId: string,
  question: string,
  history: ConversationMessage[],
  language: 'en' | 'he',
  { offlineMessage, errorMessage }: AskOptions,
): Promise<AskResponse> {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    return { answer: offlineMessage, followUps: [], intent: 'error' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { answer: errorMessage, followUps: [], intent: 'error' };
  }

  const url = `${config.supabase.url}/functions/v1/ai-query`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: config.supabase.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        tripId,
        conversationHistory: history.slice(-HISTORY_LIMIT),
        language,
      }),
      signal: controller.signal,
    });

    let body: Partial<AskResponse> | null = null;
    try {
      body = (await res.json()) as Partial<AskResponse>;
    } catch {
      body = null;
    }

    if (res.ok && body && typeof body.answer === 'string') {
      return {
        answer: body.answer,
        followUps: Array.isArray(body.followUps) ? body.followUps : [],
        intent: typeof body.intent === 'string' ? body.intent : 'error',
        error: body.error,
      };
    }

    return {
      answer: errorMessage,
      followUps: [],
      intent: 'error',
      error: body?.error ?? String(res.status),
    };
  } catch {
    return { answer: errorMessage, followUps: [], intent: 'error' };
  } finally {
    clearTimeout(timeoutId);
  }
}
