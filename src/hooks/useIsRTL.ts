// Cross-platform RTL hook. I18nManager.isRTL is always false on web (the
// React Native Web shim ignores forceRTL), so RTL-aware components have to
// read direction from i18next instead. This hook returns the same boolean
// on both platforms and stays in sync as the user changes language.
import { useTranslation } from 'react-i18next';

export function useIsRTL(): boolean {
  const { i18n } = useTranslation();
  return i18n.dir() === 'rtl';
}
