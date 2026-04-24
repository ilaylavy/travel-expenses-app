import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import he from './locales/he.json';

export type LanguagePref = 'auto' | 'en' | 'he';
export type ResolvedLanguage = 'en' | 'he';

export const SUPPORTED_LANGUAGES: readonly ResolvedLanguage[] = ['en', 'he'];
const RTL_LANGUAGES = new Set<string>(['he', 'ar', 'fa', 'ur']);

export function getDeviceLanguage(): ResolvedLanguage {
  const tag = Localization.getLocales()[0]?.languageCode ?? 'en';
  return tag === 'he' ? 'he' : 'en';
}

export function resolveLanguage(pref: LanguagePref): ResolvedLanguage {
  return pref === 'auto' ? getDeviceLanguage() : pref;
}

export function isRTLLanguage(lng: string): boolean {
  return RTL_LANGUAGES.has(lng);
}

// Apply layout direction for the given language. Returns true if the
// direction actually changed — callers should treat this as a reload hint.
export function applyRTL(lng: string): boolean {
  const shouldRTL = isRTLLanguage(lng);
  if (I18nManager.isRTL === shouldRTL) return false;
  try {
    I18nManager.allowRTL(shouldRTL);
    I18nManager.forceRTL(shouldRTL);
  } catch (error) {
    console.warn('Failed to set layout direction:', error);
  }
  return true;
}

// Initializes i18next (idempotent) and syncs layout direction.
// Returns true if the direction changed — reload is required for the new
// direction to render correctly.
export async function initI18n(pref: LanguagePref): Promise<boolean> {
  const lng = resolveLanguage(pref);
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources: {
        en: { translation: en },
        he: { translation: he },
      },
      lng,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      compatibilityJSON: 'v4',
    });
  } else if (i18n.language !== lng) {
    await i18n.changeLanguage(lng);
  }
  return applyRTL(lng);
}

export default i18n;
