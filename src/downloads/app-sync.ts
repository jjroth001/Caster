import { addDatabaseChangeListener, type SQLiteDatabase } from 'expo-sqlite';
import { AppState } from 'react-native';

import { PlayerCore } from '@modules/player-core/src';
import { detectRepeatedAds } from '@/ads/repeats';
import { applyPendingState, writeAutoLibrary } from '@/auto/snapshot';
import { runAutoTranscribe, startAutoTranscribe } from '@/transcripts/auto';
import { pruneUnfollowed, queueListeners } from '@/db/library';
import { getSettings } from '@/db/settings';
import { syncPrivateLogins } from '@/feeds/private';
import { refreshAll } from '@/feeds/sync';
import { runAutoBackupIfDue } from '@/lib/auto-backup';
import { redetectTranscriptAds } from '@/transcripts/transcripts';

import { processInbox, writeBackgroundConfig } from './background';
import { autoDownloadQueued, runAutoDownloads } from './auto-download';
import { applyDownloadEvent, enforceStorageCap, reconcileDownloads } from './downloads';

const STALE_MS = 15 * 60_000;

/** Everything the app does to catch up with the outside world when it opens or returns. */
async function catchUp(db: SQLiteDatabase, { force }: { force: boolean }) {
  await applyPendingState(db);
  await syncPrivateLogins(db);
  await processInbox(db);
  await reconcileDownloads(db);
  const settings = await getSettings(db);
  if (force || !settings.lastRefreshAt || Date.now() - settings.lastRefreshAt > STALE_MS) {
    await refreshAll(db);
  }
  await syncPrivateLogins(db);
  await runAutoDownloads(db);
  await enforceStorageCap(db);
  await writeBackgroundConfig(db);
  await writeAutoLibrary(db);
  await runAutoBackupIfDue(db);
  // Slow (decoding audio), so it carries on in the background.
  void detectRepeatedAds(db);
}

/**
 * Starts the app's background housekeeping: catch up on open and whenever the app comes back
 * to the front, keep download progress in the library, and refresh the background snapshot
 * when the app goes away. Returns a function that stops it.
 */
export function startAppSync(db: SQLiteDatabase): () => void {
  void (async () => {
    const settings = await getSettings(db);
    await pruneUnfollowed(db, settings.nowPlaying);
    await catchUp(db, { force: true });
    await redetectTranscriptAds(db);
  })();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void catchUp(db, { force: false }).then(() => runAutoTranscribe(db));
    }
    if (state === 'background') {
      void runAutoBackupIfDue(db);
      void writeBackgroundConfig(db);
      void writeAutoLibrary(db);
    }
  });
  // Keep Android Auto's lists current while the app is open (a burst of changes writes once).
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  const AUTO_TABLES = ['queue_item', 'episode_state', 'playlist', 'playlist_item', 'podcast'];
  const changes = addDatabaseChangeListener(({ tableName }) => {
    if (!AUTO_TABLES.includes(tableName)) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => void writeAutoLibrary(db), 5000);
  });
  const downloads = PlayerCore?.addListener('onDownload', (event) => {
    void applyDownloadEvent(db, event).then(() =>
      event.state === 'done' ? enforceStorageCap(db).then(() => detectRepeatedAds(db)) : undefined,
    );
  });
  const transcribe = startAutoTranscribe(db);
  const onQueued = (d: SQLiteDatabase, episodeId: number) => void autoDownloadQueued(d, episodeId);
  queueListeners.add(onQueued);
  return () => {
    queueListeners.delete(onQueued);
    transcribe();
    appState.remove();
    downloads?.remove();
    changes.remove();
    clearTimeout(autoTimer);
  };
}
