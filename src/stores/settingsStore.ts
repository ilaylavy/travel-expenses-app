import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { DEFAULT_CURRENCY } from '@/constants/currencies';
import { initI18n, type LanguagePref } from '@/i18n';

const STORAGE_KEY = 'settings:v1';

interface PersistedSettings {
  isDark: boolean;
  defaultCurrency: string;
  language: LanguagePref;
  favoriteCurrencies: string[];
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
  addFavoriteCurrency: (code: string) => void;
  removeFavoriteCurrency: (code: string) => void;
  toggleFavoriteCurrency: (code: string) => void;
}

const defaults: PersistedSettings = {
  isDark: true,
  defaultCurrency: DEFAULT_CURRENCY,
  language: 'auto',
  favoriteCurrencies: [DEFAULT_CURRENCY],
};

async function persist(state: PersistedSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist settings:', error);
  }
}

function snapshot(state: SettingsState): PersistedSettings {
  return {
    isDark: state.isDark,
    defaultCurrency: state.defaultCurrency,
    language: state.language,
    favoriteCurrencies: state.favoriteCurrencies,
  };
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
        const defaultCurrency = parsed.defaultCurrency ?? defaults.defaultCurrency;
        const favorites = Array.isArray(parsed.favoriteCurrencies)
          ? parsed.favoriteCurrencies.filter((c): c is string => typeof c === 'string')
          : [defaultCurrency];
        // Home currency is always a favorite.
        if (!favorites.includes(defaultCurrency)) favorites.unshift(defaultCurrency);
        loaded = {
          isDark: parsed.isDark ?? defaults.isDark,
          defaultCurrency,
          language: parsed.language ?? defaults.language,
          favoriteCurrencies: favorites,
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
    set({ isDark: !get().isDark });
    void persist(snapshot(get()));
  },

  setIsDark: (isDark) => {
    set({ isDark });
    void persist(snapshot(get()));
  },

  setDefaultCurrency: (code) => {
    const favorites = get().favoriteCurrencies;
    const nextFavorites = favorites.includes(code) ? favorites : [code, ...favorites];
    set({ defaultCurrency: code, favoriteCurrencies: nextFavorites });
    void persist(snapshot(get()));
  },

  setLanguage: async (language) => {
    set({ language });
    void persist(snapshot(get()));
    return initI18n(language);
  },

  addFavoriteCurrency: (code) => {
    const favorites = get().favoriteCurrencies;
    if (favorites.includes(code)) return;
    set({ favoriteCurrencies: [...favorites, code] });
    void persist(snapshot(get()));
  },

  removeFavoriteCurrency: (code) => {
    if (code === get().defaultCurrency) return;
    const favorites = get().favoriteCurrencies;
    if (!favorites.includes(code)) return;
    set({ favoriteCurrencies: favorites.filter((c) => c !== code) });
    void persist(snapshot(get()));
  },

  toggleFavoriteCurrency: (code) => {
    if (get().favoriteCurrencies.includes(code)) {
      get().removeFavoriteCurrency(code);
    } else {
      get().addFavoriteCurrency(code);
    }
  },
}));
