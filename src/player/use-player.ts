import { useSyncExternalStore } from 'react';

import { engine, IDLE_STATE, type PlayerState } from './engine';

let current: PlayerState = IDLE_STATE;
let lastError: string | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

function start() {
  unsubscribe = engine.subscribe((event) => {
    if (event.type === 'state') {
      current = event.state;
      if (event.state.playing) lastError = null;
    } else if (event.type === 'error') {
      lastError = event.message || 'Playback failed';
    } else {
      return;
    }
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribe) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}

const snapshot = () => current;
const errorSnapshot = () => lastError;

/** The player's live state (position updates about twice a second while playing). */
export function usePlayerState(): PlayerState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The last playback error message, cleared once something plays again. */
export function usePlayerError(): string | null {
  return useSyncExternalStore(subscribe, errorSnapshot, errorSnapshot);
}
