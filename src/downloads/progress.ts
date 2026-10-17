import { useSyncExternalStore } from 'react';

import { PlayerCore, type DownloadState } from '@modules/player-core/src';

/**
 * Live download status by key while the app is open: waiting, downloading (with progress),
 * failed (with a reason) or done. Seeded from the native side when first used, so a screen
 * opened after a download started still shows it.
 */

export type DownloadStatus = {
  state: DownloadState;
  progress: number;
  written: number;
  error: string | null;
};

const statuses = new Map<string, DownloadStatus>();
const listeners = new Set<() => void>();
let subscribed = false;

const bump = () => listeners.forEach((l) => l());

function ensureSubscribed() {
  if (subscribed || !PlayerCore) return;
  subscribed = true;
  PlayerCore.addListener('onDownload', (event) => {
    statuses.set(event.key, {
      state: event.state,
      progress: event.progress,
      written: event.written ?? 0,
      error: event.error,
    });
    bump();
  });
  void PlayerCore.activeDownloads().then((active) => {
    for (const a of active) {
      if (!statuses.has(a.key))
        statuses.set(a.key, {
          state: a.state,
          progress: a.progress,
          written: a.written ?? 0,
          error: a.error,
        });
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
  // The snapshot is the status itself (a new object on every event), not a separate version
  // number: React Compiler memoizes plain reads of module state, so reading the map after a
  // version bump kept returning the first answer and progress never moved.
  return useSyncExternalStore(subscribe, () => (key ? (statuses.get(key) ?? null) : null));
}

/** "42%", or "12 MB" when the server didn't give the file size; null when not downloading. */
export function downloadLabel(status: DownloadStatus | null): string | null {
  if (status?.state !== 'downloading') return null;
  if (status.progress >= 0) return `${Math.round(status.progress * 100)}%`;
  return `${Math.round(status.written / 1_000_000)} MB`;
}

/** How far one download has got, as text, or null when it isn't downloading. */
export function useDownloadLabel(key: string | null): string | null {
  return downloadLabel(useDownloadStatus(key));
}
