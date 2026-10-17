import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Suspense, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { pruneUnfollowed } from '@/db/library';
import { migrateDbIfNeeded } from '@/db/migrations';
import { getSettings } from '@/db/settings';
import { useSettings } from '@/db/use-settings';
import { refreshAll } from '@/feeds/sync';
import { startPlayerSync } from '@/player/controller';
import { ThemeProvider, useTheme } from '@/theme/theme-provider';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense fallback={null}>
        <SQLiteProvider
          databaseName="caster.db"
          options={{ enableChangeListener: true }}
          onInit={migrateDbIfNeeded}
          useSuspense>
          <ThemeProvider>
            <Root />
          </ThemeProvider>
        </SQLiteProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}

/** Starts the player glue and checks feeds for new episodes when the app opens. */
function useAppStart() {
  const db = useSQLiteContext();
  useEffect(() => startPlayerSync(db), [db]);
  useEffect(() => {
    void (async () => {
      const settings = await getSettings(db);
      await pruneUnfollowed(db, settings.nowPlaying);
      await refreshAll(db);
    })();
  }, [db]);
}

function Root() {
  const theme = useTheme();
  const settings = useSettings();
  useAppStart();
  const ready = settings.status !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);

  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: 'transparent',
      card: theme.background,
      text: theme.text,
      primary: theme.accent,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="podcast/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="player"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="episode/[id]"
          options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
        />
      </Stack>
    </NavThemeProvider>
  );
}
