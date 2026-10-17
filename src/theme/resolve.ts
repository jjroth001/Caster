import type { Settings } from '@/db/settings';

import { THEMES, type Theme } from './themes';

/** Automatic follows the phone's light/dark mode: Paper by day, the chosen dark theme at night. */
export function resolveTheme(
  choice: Settings['theme'],
  autoDark: Settings['autoDark'],
  scheme: string | null | undefined,
): Theme {
  if (choice !== 'auto') return THEMES[choice];
  return scheme === 'dark' ? THEMES[autoDark] : THEMES.paper;
}
