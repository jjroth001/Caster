import type { SQLiteDatabase } from 'expo-sqlite';

import type { TrimSilence } from '@/player/engine';

export type ThemeChoice = 'auto' | 'paper' | 'dusk' | 'midnight';

export type Settings = {
  /** Automatic follows the phone's light/dark mode: Paper by day, `autoDark` at night. */
  theme: ThemeChoice;
  autoDark: 'dusk' | 'midnight';
  /** The Podcasts tab: covers in a grid, big covers, or a list with each show's newest episode. */
  libraryLayout: 'grid' | 'large' | 'list';
  librarySort: 'latest' | 'title' | 'added';
  /** Player and podcast pages take their colour from the cover art. */
  tintFromArtwork: boolean;
  skipBackS: number;
  skipForwardS: number;
  speed: number;
  trimSilence: TrimSilence;
  volumeBoost: boolean;
  /** Up Next plays the next episode automatically when one finishes. */
  autoPlayNext: boolean;
  /** The episode in the player (kept so it's still there after the app restarts). */
  nowPlaying: number | null;
  lastRefreshAt: number | null;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  autoDark: 'dusk',
  libraryLayout: 'grid',
  librarySort: 'latest',
  tintFromArtwork: false,
  skipBackS: 10,
  skipForwardS: 30,
  speed: 1,
  trimSilence: 'off',
  volumeBoost: false,
  autoPlayNext: true,
  nowPlaying: null,
  lastRefreshAt: null,
};

/** All settings, with defaults filled in for anything never set. Values are stored as JSON. */
export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM setting',
  );
  const stored: Partial<Settings> = {};
  for (const row of rows) {
    try {
      (stored as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      // ignore a damaged value; the default applies
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSetting<K extends keyof Settings>(
  db: SQLiteDatabase,
  key: K,
  value: Settings[K],
): Promise<void> {
  await db.runAsync(
    'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}
