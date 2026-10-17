import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Suspense, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SheetHost } from '@/components/sheet';
import { SkipToast } from '@/components/skip-toast';
import { GlobalTabBar } from '@/components/tab-bar';
import { migrateDbIfNeeded } from '@/db/migrations';
import { useSettings } from '@/db/use-settings';
import { startAppSync } from '@/downloads/app-sync';
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

/** Starts the player glue and the app's catch-up work (feeds, downloads, background check). */
function useAppStart() {
  const db = useSQLiteContext();
  useEffect(() => startPlayerSync(db), [db]);
  useEffect(() => startAppSync(db), [db]);
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
        <Stack.Screen name="downloads" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="video" options={{ animation: 'fade' }} />
        <Stack.Screen name="auto-download" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auto-download-choose" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="chapters" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="bookmarks" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="transcript" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="transcripts" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="stats" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="clip" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="folder/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="playlist/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="playlist-edit" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="folder-edit" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/appearance" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/playback" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/ads" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/new-episodes" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/downloads" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/transcripts" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/backup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings/about" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="podcast-settings/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="player"
          options={{
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="episode/[id]"
          options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
        />
      </Stack>
      <GlobalTabBar />
      <SkipToast />
      <SheetHost />
    </NavThemeProvider>
  );
}
