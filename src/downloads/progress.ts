import { useSyncExternalStore } from 'react';

import { PlayerCore } from '@modules/player-core/src';

/** Live download progress (0–1) by download key, while the app is open. */
const progress = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
let subscribed = false;

function ensureSubscribed() {
  if (subscribed || !PlayerCore) return;
  subscribed = true;
  PlayerCore.addListener('onDownload', (event) => {
    if (event.state === 'downloading') progress.set(event.key, event.progress);
    else progress.delete(event.key);
    version++;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  ensureSubscribed();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Progress of one download (0–1), or null when it isn't downloading. */
export function useDownloadProgress(key: string | null): number | null {
  useSyncExternalStore(subscribe, () => version);
  return key ? (progress.get(key) ?? null) : null;
}
