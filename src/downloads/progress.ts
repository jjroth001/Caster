import { useSyncExternalStore } from 'react';

import { PlayerCore, type DownloadState } from '@modules/player-core/src';

/**
 * Live download status by key while the app is open: waiting, downloading (with progress),
 * failed (with a reason) or done. Seeded from the native side when first used, so a screen
 * opened after a download started still shows it.
 */

export type DownloadStatus = { state: DownloadState; progress: number; error: string | null };

const statuses = new Map<string, DownloadStatus>();
const listeners = new Set<() => void>();
let version = 0;
let subscribed = false;

const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

function ensureSubscribed() {
  if (subscribed || !PlayerCore) return;
  subscribed = true;
  PlayerCore.addListener('onDownload', (event) => {
    statuses.set(event.key, { state: event.state, progress: event.progress, error: event.error });
    bump();
  });
  void PlayerCore.activeDownloads().then((active) => {
    for (const a of active) {
      if (!statuses.has(a.key))
        statuses.set(a.key, { state: a.state, progress: a.progress, error: a.error });
    }
    bump();
  });
}

function subscribe(listener: () => void) {
  ensureSubscribed();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The latest status of one download, or null if nothing is known about it. */
export function useDownloadStatus(key: string | null): DownloadStatus | null {
  useSyncExternalStore(subscribe, () => version);
  return key ? (statuses.get(key) ?? null) : null;
}

/** Progress of one download (0–1), or null when it isn't downloading. */
export function useDownloadProgress(key: string | null): number | null {
  const status = useDownloadStatus(key);
  return status?.state === 'downloading' ? status.progress : null;
}
