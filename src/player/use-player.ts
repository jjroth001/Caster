import { useMemo, useSyncExternalStore } from 'react';

import { engine, IDLE_STATE, type PlayerState } from './engine';

let current: PlayerState = IDLE_STATE;
let lastError: string | null = null;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

/** What a tap just changed, and when: a report from before it reached the player is ignored. */
let expected: { at: number; patch: Partial<PlayerState> } | null = null;
const SETTLE_MS = 700;
const SWITCH_MS = 2500;

/** A report from the player, unless it predates what was just tapped (then the tap wins). */
export function applyExpected(
  report: PlayerState,
  currentId: string | null,
  tapped: { at: number; patch: Partial<PlayerState> } | null,
  now: number,
): PlayerState {
  if (!tapped) return report;
  // Starting another episode: until the player reports the new one (a little longer, since
  // it has to load), updates about the old one are from before the tap.
  if (tapped.patch.id !== undefined && tapped.patch.id !== report.id) {
    return now - tapped.at <= SWITCH_MS ? { ...report, ...tapped.patch } : report;
  }
  if (now - tapped.at > SETTLE_MS || report.id !== currentId) return report;
  const { playWhenReady, positionMs } = tapped.patch;
  // Only what was tapped overrides the report (play/pause, position), never the rest of it.
  const fix: Partial<PlayerState> = {};
  if (playWhenReady !== undefined && report.playWhenReady !== playWhenReady) {
    fix.playWhenReady = playWhenReady;
  }
  if (positionMs !== undefined && Math.abs(report.positionMs - positionMs) > 1500) {
    fix.positionMs = positionMs;
  }
  return Object.keys(fix).length > 0 ? { ...report, ...fix } : report;
}

function start() {
  unsubscribe = engine.subscribe((event) => {
    if (event.type === 'state') {
      current = applyExpected(event.state, current.id, expected, Date.now());
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

/**
 * Shows a change straight away (play/pause flips the moment it's tapped) instead of waiting for
 * the player to report back; its next report replaces this either way.
 */
export function expectPlayerState(patch: Partial<PlayerState>) {
  const recent = expected && Date.now() - expected.at <= SETTLE_MS ? expected.patch : {};
  expected = { at: Date.now(), patch: { ...recent, ...patch } };
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
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
