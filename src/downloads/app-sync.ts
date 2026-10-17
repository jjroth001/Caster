import type { SQLiteDatabase } from 'expo-sqlite';
import { AppState } from 'react-native';

import { PlayerCore } from '@modules/player-core/src';
import { pruneUnfollowed } from '@/db/library';
import { getSettings } from '@/db/settings';
import { refreshAll } from '@/feeds/sync';

import { processInbox, writeBackgroundConfig } from './background';
import {
  applyDownloadEvent,
  autoDownloadNew,
  enforceStorageCap,
  reconcileDownloads,
} from './downloads';

const STALE_MS = 15 * 60_000;

/** Everything the app does to catch up with the outside world when it opens or returns. */
async function catchUp(db: SQLiteDatabase, { force }: { force: boolean }) {
  await processInbox(db);
  await reconcileDownloads(db);
  const settings = await getSettings(db);
  if (force || !settings.lastRefreshAt || Date.now() - settings.lastRefreshAt > STALE_MS) {
    await refreshAll(db);
  }
  await autoDownloadNew(db);
  await enforceStorageCap(db);
  await writeBackgroundConfig(db);
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
  })();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void catchUp(db, { force: false });
    if (state === 'background') void writeBackgroundConfig(db);
  });
  const downloads = PlayerCore?.addListener('onDownload', (event) => {
    void applyDownloadEvent(db, event).then(() =>
      event.state === 'done' ? enforceStorageCap(db) : undefined,
    );
  });
  return () => {
    appState.remove();
    downloads?.remove();
  };
}
