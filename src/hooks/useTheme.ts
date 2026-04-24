import { getTheme, type ThemeColors } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settingsStore';

export function useTheme(): ThemeColors {
  const isDark = useSettingsStore((s) => s.isDark);
  return getTheme(isDark);
}

export function useIsDark(): boolean {
  return useSettingsStore((s) => s.isDark);
}
