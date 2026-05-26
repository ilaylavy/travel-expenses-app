import type { ThemeColors } from '@/constants/theme';

import { getTripTint } from './tripTint';

// Same deterministic 8-color hash as getTripTint, exposed under a name
// that reads naturally at member call sites (HistoryRow chips, balance
// monogram tiles, members-share rows). Trips and members share the tint
// vocabulary so a member's color is stable everywhere they appear.
export function getMemberTint(userId: string, theme: ThemeColors): string {
  return getTripTint(userId, theme);
}
