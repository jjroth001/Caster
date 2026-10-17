import { useMemo, useSyncExternalStore } from 'react';

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

export type EpisodePlayback = {
  current: boolean;
  playWhenReady: boolean;
  positionMs: number;
  durationMs: number | null;
};

const IDLE = 'idle';

/**
 * One episode's view of the player, for list rows. Rows for other episodes never re-render on
 * player updates, and the playing row only every few seconds (enough for its progress ring).
 */
export function useEpisodePlayback(episodeId: number): EpisodePlayback {
  const key = String(episodeId);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const s = current;
      if (s.id !== key) return IDLE;
      const pos = Math.floor(s.positionMs / 5000) * 5000;
      return `${s.playWhenReady ? 1 : 0}|${pos}|${s.durationMs ?? ''}`;
    },
    () => IDLE,
  );
  return useMemo(() => {
    if (snapshot === IDLE)
      return { current: false, playWhenReady: false, positionMs: 0, durationMs: null };
    const [play, pos, dur] = snapshot.split('|');
    return {
      current: true,
      playWhenReady: play === '1',
      positionMs: Number(pos),
      durationMs: dur ? Number(dur) : null,
    };
  }, [snapshot]);
}
