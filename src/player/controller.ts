import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { getEpisode, popQueue, dequeue, savePosition, setPlayed } from '@/db/library';
import { getSettings, setSetting } from '@/db/settings';
import { removeDownload } from '@/downloads/downloads';

import { engine, type PlayerState } from './engine';

/**
 * Glue between the library and the player engine: what to load, from where, at what speed;
 * saving positions; marking episodes played and moving on through Up Next.
 */

let lastState: PlayerState | null = null;
let lastSavedMs = 0;

// "End of episode" lives here; the minutes timer lives in the engine (it must run with the
// screen off, where JS timers stop).
let stopAtEnd = false;
const sleepListeners = new Set<() => void>();
export function setStopAtEndOfEpisode(on: boolean) {
  stopAtEnd = on;
  sleepListeners.forEach((l) => l());
}
export function useStopAtEndOfEpisode() {
  return useSyncExternalStore(
    (l) => {
      sleepListeners.add(l);
      return () => sleepListeners.delete(l);
    },
    () => stopAtEnd,
  );
}

export async function applyPlayerSettings(db: SQLiteDatabase) {
  const s = await getSettings(db);
  await Promise.all([
    engine.setSkipIntervals(s.skipBackS, s.skipForwardS),
    engine.setTrimSilence(s.trimSilence),
    engine.setVolumeBoost(s.volumeBoost),
  ]);
}

async function speedFor(db: SQLiteDatabase, podcastId: number, fallback: number) {
  const row = await db.getFirstAsync<{ speed: number | null }>(
    'SELECT speed FROM podcast_settings WHERE podcast_id = ?',
    podcastId,
  );
  return row?.speed ?? fallback;
}

/** Saves where the current episode is, so it resumes there. */
async function saveCurrent(db: SQLiteDatabase) {
  const state = lastState;
  if (!state?.id || state.state === 'ended') return;
  await savePosition(db, Number(state.id), state.positionMs / 1000);
}

export async function playEpisode(
  db: SQLiteDatabase,
  episodeId: number,
  { playWhenReady = true }: { playWhenReady?: boolean } = {},
) {
  const episode = await getEpisode(db, episodeId);
  if (!episode) return;
  if (lastState?.id !== String(episodeId)) await saveCurrent(db);
  const settings = await getSettings(db);
  let startS = episode.played ? 0 : episode.position_s;
  // Starting within the last few seconds would end it at once; start over instead.
  if (episode.duration_s && startS > episode.duration_s - 10) startS = 0;
  if (episode.played) await setPlayed(db, episodeId, false);
  await dequeue(db, episodeId);
  await setSetting(db, 'nowPlaying', episodeId);
  await engine.load({
    id: String(episodeId),
    url: episode.local_path ?? episode.enclosure_url,
    title: episode.title,
    artist: episode.podcast_title,
    album: episode.podcast_title,
    artworkUrl: episode.artwork_url ?? episode.podcast_artwork ?? undefined,
    startPositionMs: startS * 1000,
    playWhenReady,
  });
  await engine.setSpeed(await speedFor(db, episode.podcast_id, settings.speed));
}

/** Plays or pauses; with nothing loaded, starts the first Up Next episode. */
export async function togglePlay(db: SQLiteDatabase) {
  if (lastState?.id && lastState.state !== 'ended') {
    if (lastState.playWhenReady) await engine.pause();
    else await engine.play();
    return;
  }
  // Resume the episode in the player; after one has finished, move on to Up Next first.
  const { nowPlaying } = await getSettings(db);
  const ended = lastState?.state === 'ended';
  const next = (ended ? null : nowPlaying) ?? (await popQueue(db)) ?? nowPlaying;
  if (next) await playEpisode(db, next);
}

async function onEnded(db: SQLiteDatabase, id: string) {
  await setPlayed(db, Number(id), true);
  const settings = await getSettings(db);
  if (settings.deletePlayedDownloads) await removeDownload(db, Number(id));
  if (stopAtEnd) {
    setStopAtEndOfEpisode(false);
    return;
  }
  const next = settings.autoPlayNext ? await popQueue(db) : null;
  if (next) {
    await playEpisode(db, next);
  } else {
    await setSetting(db, 'nowPlaying', null);
    await engine.stop();
  }
}

/**
 * Listens to the engine for the life of the app: saves positions every few seconds and on
 * pause, and handles episodes finishing. Returns an unsubscribe function.
 */
export function startPlayerSync(db: SQLiteDatabase): () => void {
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'ended') {
      void onEnded(db, event.id);
      return;
    }
    if (event.type !== 'state') return;
    const prev = lastState;
    const state = event.state;
    lastState = state;
    if (!state.id || state.state === 'ended') return;
    const paused = prev?.playWhenReady && !state.playWhenReady;
    const moved = Math.abs(state.positionMs - lastSavedMs) >= 5000;
    // (Not on load: the first updates can report 0 before the resume position is applied.)
    if (paused || (state.playing && moved)) {
      lastSavedMs = state.positionMs;
      void savePosition(db, Number(state.id), state.positionMs / 1000);
    }
  });
  void (async () => {
    await applyPlayerSettings(db);
    // Put the last episode back in the player (paused) after the app restarts.
    const settings = await getSettings(db);
    const current = await engine.getState(); // still playing from before the UI restarted?
    if (settings.nowPlaying && !current.id) {
      await playEpisode(db, settings.nowPlaying, { playWhenReady: false });
    }
  })();
  return unsubscribe;
}
