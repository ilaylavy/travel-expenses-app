import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { DEFAULT_CURRENCY } from '@/constants/currencies';

const STORAGE_KEY = 'settings:v1';

interface PersistedSettings {
  isDark: boolean;
  defaultCurrency: string;
}

interface SettingsState extends PersistedSettings {
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  toggleTheme: () => void;
  setIsDark: (isDark: boolean) => void;
  setDefaultCurrency: (code: string) => void;
}

const defaults: PersistedSettings = {
  isDark: true,
  defaultCurrency: DEFAULT_CURRENCY,
};

async function persist(state: PersistedSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist settings:', error);
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  isHydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
        set({
          isDark: parsed.isDark ?? defaults.isDark,
          defaultCurrency: parsed.defaultCurrency ?? defaults.defaultCurrency,
          isHydrated: true,
        });
        return;
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
    set({ isHydrated: true });
  },

  toggleTheme: () => {
    const next = !get().isDark;
    set({ isDark: next });
    void persist({ isDark: next, defaultCurrency: get().defaultCurrency });
  },

  setIsDark: (isDark) => {
    set({ isDark });
    void persist({ isDark, defaultCurrency: get().defaultCurrency });
  },

  setDefaultCurrency: (code) => {
    set({ defaultCurrency: code });
    void persist({ isDark: get().isDark, defaultCurrency: code });
  },
}));
