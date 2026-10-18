import type { SQLiteDatabase } from 'expo-sqlite';

import type { HeadsetAction } from '@modules/player-core/src';
import type { TrimSilence } from '@/player/engine';

export type LibrarySort = 'latest' | 'title' | 'added' | 'played' | 'manual';

export const LIBRARY_SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'added', label: 'Date added' },
  { value: 'latest', label: 'Episode release date' },
  { value: 'played', label: 'Recently played' },
  { value: 'title', label: 'Name' },
  { value: 'manual', label: 'Drag & drop' },
];

export type ThemeChoice = 'auto' | 'paper' | 'dusk' | 'midnight';

export type Settings = {
  /** Automatic follows the phone's light/dark mode: Paper by day, `autoDark` at night. */
  theme: ThemeChoice;
  autoDark: 'dusk' | 'midnight';
  /** The Podcasts tab: covers in a grid, big covers, or a list with each show's newest episode. */
  libraryLayout: 'grid' | 'large' | 'list';
  /** Library order: newest episode, name, date added, recently played or your own (drag). */
  librarySort: LibrarySort;
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
  /** Check for new episodes in the background every N hours (0: only when the app opens). */
  refreshHours: number;
  notifyNewEpisodes: boolean;
  /**
   * Before 0.4.3: download the newest N new episodes of every podcast (0: off). Only read once,
   * to carry it over to the settings below.
   */
  autoDownload: number;
  /** Set once the old auto-download setting has been carried over. */
  autoDownloadUpgraded: boolean;
  /** Download new episodes of the podcasts chosen for it (podcast_settings.auto_download_n). */
  autoDownloadNew: boolean;
  /** Keep at most this many automatic downloads per chosen podcast, newest first. */
  autoDownloadLimit: number;
  /** Download the latest two episodes of a podcast when you follow it. */
  autoDownloadOnFollow: boolean;
  /** Download episodes when they're added to Up Next. */
  autoDownloadUpNext: boolean;
  /** Download the first episodes of these playlists. */
  autoDownloadPlaylists: number[];
  downloadWifiOnly: boolean;
  downloadChargingOnly: boolean;
  /** Automatic downloads wait while the phone is low on storage. */
  downloadStorageNotLow: boolean;
  /** Archive played episodes this many hours after they finish (-1: never). */
  autoArchivePlayed: number;
  /** Archive episodes never started once they're this many hours old (-1: never). */
  autoArchiveInactive: number;
  /** Auto-archive starred episodes too. */
  autoArchiveStarred: boolean;
  /** Keep downloads under this many GB by removing played ones, oldest first (0: no limit). */
  storageCapGb: number;
  deletePlayedDownloads: boolean;
  /** Skip ad breaks found by chapter titles and transcripts. */
  adSkip: boolean;
  /** Chapters whose title contains one of these are skipped as ads. */
  adKeywords: string[];
  /** Brands found in ad reads on this phone, recognised in later episodes. */
  adBrands: string[];
  /** The ad detection that last checked the transcripts already saved. */
  adDetectionVersion: number;
  headsetDouble: HeadsetAction;
  headsetTriple: HeadsetAction;
  /** Up Next picks a random episode each time one ends, instead of the next in line. */
  upNextShuffle: boolean;
  /** Bookmarks keep the transcript passage before them and take a title from it. */
  smartBookmarks: boolean;
  /** How sure transcript ad detection must be before skipping: cautious, balanced or eager. */
  adSensitivity: 'cautious' | 'balanced' | 'eager';
  /** The whisper.cpp model used for generated transcripts (null: none chosen). */
  speechModel: string | null;
  /**
   * Transcribe downloaded episodes automatically while charging: never, while Caster is open
   * or playing, or any time (Android wakes Caster to do it while it's closed).
   */
  autoTranscribe: 'off' | 'open' | 'always';
  /** Back up into a chosen folder automatically: never, daily or weekly. */
  autoBackup: 'off' | 'daily' | 'weekly';
  /** The folder automatic backups go to (an Android content:// address), and its name. */
  autoBackupFolder: string | null;
  autoBackupFolderName: string | null;
  lastAutoBackupAt: number | null;
  /** Why the last automatic backup failed, if it did. */
  autoBackupError: string | null;
  /** Feeds with a saved sign-in (the sign-ins themselves are in encrypted storage). */
  privateFeeds: string[];
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
  refreshHours: 4,
  notifyNewEpisodes: false,
  autoDownload: 0,
  autoDownloadUpgraded: false,
  autoDownloadNew: false,
  autoDownloadLimit: 2,
  autoDownloadOnFollow: false,
  autoDownloadUpNext: false,
  autoDownloadPlaylists: [],
  downloadWifiOnly: true,
  downloadChargingOnly: false,
  downloadStorageNotLow: true,
  autoArchivePlayed: -1,
  autoArchiveInactive: -1,
  autoArchiveStarred: false,
  storageCapGb: 0,
  deletePlayedDownloads: false,
  adSkip: true,
  adKeywords: ['sponsor', 'advertisement', 'ad break', 'promo'],
  adBrands: [],
  adDetectionVersion: 0,
  headsetDouble: 'skipForward',
  headsetTriple: 'skipBack',
  upNextShuffle: false,
  smartBookmarks: true,
  adSensitivity: 'balanced',
  speechModel: null,
  autoTranscribe: 'off',
  autoBackup: 'off',
  autoBackupFolder: null,
  autoBackupFolderName: null,
  lastAutoBackupAt: null,
  autoBackupError: null,
  privateFeeds: [],
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
