import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';

import { supabase } from './supabase';

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  defaultCurrency: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signUp({ email, password, name, defaultCurrency }: SignUpInput): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, default_currency: defaultCurrency },
    },
  });

  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ name, default_currency: defaultCurrency })
      .eq('id', data.user.id);
    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('Failed to update profile after signup:', profileError.message);
    }
  }

  return data.session;
}

export async function signIn({ email, password }: SignInInput): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('No session returned from sign in.');
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): { data: { subscription: Subscription } } {
  return supabase.auth.onAuthStateChange(callback);
}
