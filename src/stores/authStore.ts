import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { getCurrentSession, onAuthStateChange, signIn as authSignIn, signOut as authSignOut, signUp as authSignUp, type SignInInput, type SignUpInput } from '@/services/auth';
import { supabase } from '@/services/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    try {
      const session = await getCurrentSession();
      set({ session, user: session?.user ?? null, isInitialized: true });
    } catch (error) {
      console.warn('Failed to restore session:', error);
      set({ session: null, user: null, isInitialized: true });
    }

    if (authSubscription) authSubscription.unsubscribe();
    const { data } = onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
      // Keep the realtime client's JWT in lockstep with the HTTP client.
      // supabase-js auto-refreshes session tokens for PostgREST transparently,
      // but the realtime client uses whatever token setAuth was last called
      // with — without this, postgres_changes events silently stop flowing
      // after the first token rotation (~1h), and partner-device updates
      // never reach this device until a foreground/reconnect-triggered pull.
      supabase.realtime.setAuth(session?.access_token ?? '');
    });
    authSubscription = data.subscription;
  },

  signIn: async (input) => {
    set({ isLoading: true });
    try {
      const session = await authSignIn(input);
      set({ session, user: session.user });
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (input) => {
    set({ isLoading: true });
    try {
      const session = await authSignUp(input);
      set({ session, user: session?.user ?? null });
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await authSignOut();
      set({ session: null, user: null });
    } finally {
      set({ isLoading: false });
    }
  },
}));
