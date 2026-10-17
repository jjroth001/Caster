import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { DEFAULT_SETTINGS } from '@/db/settings';
import { useSettings } from '@/db/use-settings';

import { resolveTheme } from './resolve';
import { THEMES, type Theme } from './themes';

const ThemeContext = createContext<Theme>(THEMES.paper);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const settings = useSettings().data ?? DEFAULT_SETTINGS;
  const theme = resolveTheme(settings.theme, settings.autoDark, scheme);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
