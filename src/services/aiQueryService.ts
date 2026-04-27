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
const RETRY_DELAY_MS = 1000;

interface FetchOutcome {
  ok: boolean;
  status: number;
  body: Partial<AskResponse> | null;
}

interface FetchInput {
  url: string;
  token: string;
  payload: unknown;
}

async function fetchOnce({ url, token, payload }: FetchInput): Promise<FetchOutcome> {
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
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body: Partial<AskResponse> | null = null;
    try {
      body = (await res.json()) as Partial<AskResponse>;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    // Network abort or fetch error — surface as a non-retryable failure
    // (we don't want to compound timeouts by retrying on broken connections).
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

// 503 + the SUPABASE_EDGE_RUNTIME_ERROR string are the two patterns we see
// when the edge runtime is cold-starting or briefly OOM. Both clear within a
// few seconds, so a single 1-second retry is enough to mask the blip without
// turning a real outage into a retry storm.
function isTransientFailure(r: FetchOutcome): boolean {
  if (r.status === 503) return true;
  const err = r.body?.error;
  if (typeof err === 'string' && /SUPABASE_EDGE_RUNTIME_ERROR/i.test(err)) return true;
  return false;
}

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

  const input: FetchInput = {
    url: `${config.supabase.url}/functions/v1/ai-query`,
    token,
    payload: {
      question,
      tripId,
      conversationHistory: history.slice(-HISTORY_LIMIT),
      language,
    },
  };

  let outcome = await fetchOnce(input);
  if (isTransientFailure(outcome)) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    outcome = await fetchOnce(input);
  }

  if (outcome.ok && outcome.body && typeof outcome.body.answer === 'string') {
    return {
      answer: outcome.body.answer,
      followUps: Array.isArray(outcome.body.followUps) ? outcome.body.followUps : [],
      intent: typeof outcome.body.intent === 'string' ? outcome.body.intent : 'error',
      error: outcome.body.error,
    };
  }

  return {
    answer: errorMessage,
    followUps: [],
    intent: 'error',
    error: outcome.body?.error ?? (outcome.status > 0 ? String(outcome.status) : undefined),
  };
}
