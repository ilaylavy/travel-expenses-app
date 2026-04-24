import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { initI18n, type LanguagePref } from '@/i18n';

const STORAGE_KEY = 'settings:v1';

interface PersistedSettings {
  isDark: boolean;
  defaultCurrency: string;
  language: LanguagePref;
}

interface SettingsState extends PersistedSettings {
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  toggleTheme: () => void;
  setIsDark: (isDark: boolean) => void;
  setDefaultCurrency: (code: string) => void;
  // Returns true when the layout direction changed and a reload is needed
  // for RTL ↔ LTR to take effect (I18nManager.forceRTL requires a reload).
  setLanguage: (language: LanguagePref) => Promise<boolean>;
}

const defaults: PersistedSettings = {
  isDark: true,
  defaultCurrency: DEFAULT_CURRENCY,
  language: 'auto',
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
    let loaded: PersistedSettings = defaults;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
        loaded = {
          isDark: parsed.isDark ?? defaults.isDark,
          defaultCurrency: parsed.defaultCurrency ?? defaults.defaultCurrency,
          language: parsed.language ?? defaults.language,
        };
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }

    try {
      await initI18n(loaded.language);
    } catch (error) {
      console.warn('Failed to initialize i18n:', error);
    }

    set({ ...loaded, isHydrated: true });
  },

  toggleTheme: () => {
    const next = !get().isDark;
    set({ isDark: next });
    void persist({ isDark: next, defaultCurrency: get().defaultCurrency, language: get().language });
  },

  setIsDark: (isDark) => {
    set({ isDark });
    void persist({ isDark, defaultCurrency: get().defaultCurrency, language: get().language });
  },

  setDefaultCurrency: (code) => {
    set({ defaultCurrency: code });
    void persist({ isDark: get().isDark, defaultCurrency: code, language: get().language });
  },

  setLanguage: async (language) => {
    set({ language });
    void persist({ isDark: get().isDark, defaultCurrency: get().defaultCurrency, language });
    return initI18n(language);
  },
}));
