import { addDatabaseChangeListener, type SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import {
  dequeue,
  getEpisode,
  getPodcastSettings,
  popQueue,
  savePosition,
  setPlayed,
  setPodcastSetting,
} from '@/db/library';
import { getSettings, setSetting } from '@/db/settings';
import { removeDownload } from '@/downloads/downloads';

import { ensureChapters, saveEmbeddedChapters } from './chapters';
import { engine, type PlayerState, type TrimSilence } from './engine';

/**
 * Glue between the library and the player engine: what to load, from where, with which
 * settings; saving positions; skipping intros, outros, unticked chapters and ads; marking
 * episodes played and moving on through Up Next.
 */

let lastState: PlayerState | null = null;
let lastSavedMs = 0;
let endedFor: string | null = null;

// --- Small stores the UI reads ------------------------------------------------------------

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => value,
      ),
  };
}

// "End of episode" lives here; the minutes timer lives in the engine (it must run with the
// screen off, where JS timers stop).
const stopAtEnd = store(false);
export const setStopAtEndOfEpisode = (on: boolean) => stopAtEnd.set(on);
export const useStopAtEndOfEpisode = stopAtEnd.use;

export type SkipNotice = { id: number; label: string; undoToMs: number; rangeKey: string };
const skipNotice = store<SkipNotice | null>(null);
export const useSkipNotice = skipNotice.use;
export const dismissSkipNotice = () => skipNotice.set(null);

// --- Effective settings ------------------------------------------------------------------

type Options = {
  speed: number;
  trimSilence: TrimSilence;
  volumeBoost: boolean;
  skipStartS: number;
  skipEndS: number;
};

export async function optionsFor(db: SQLiteDatabase, podcastId: number): Promise<Options> {
  const [s, p] = await Promise.all([getSettings(db), getPodcastSettings(db, podcastId)]);
  return {
    speed: p.speed ?? s.speed,
    trimSilence: (p.trim_silence as TrimSilence | null) ?? s.trimSilence,
    volumeBoost: p.volume_boost == null ? s.volumeBoost : !!p.volume_boost,
    skipStartS: p.skip_start_s ?? 0,
    skipEndS: p.skip_end_s ?? 0,
  };
}

const PODCAST_KEY = {
  speed: 'speed',
  trimSilence: 'trim_silence',
  volumeBoost: 'volume_boost',
} as const;

/**
 * Changes speed, trim silence or volume boost from the player: for this podcast if it has its
 * own setting, otherwise everywhere.
 */
export async function setPlaybackOption<K extends 'speed' | 'trimSilence' | 'volumeBoost'>(
  db: SQLiteDatabase,
  podcastId: number | null,
  key: K,
  value: Options[K],
) {
  const own = podcastId != null ? await getPodcastSettings(db, podcastId) : null;
  const column = PODCAST_KEY[key];
  if (own && podcastId != null && own[column] != null) {
    const stored = key === 'volumeBoost' ? (value ? 1 : 0) : value;
    await setPodcastSetting(db, podcastId, column, stored as never);
  } else {
    await setSetting(db, key, value as never);
  }
  if (key === 'speed') await engine.setSpeed(value as number);
  if (key === 'trimSilence') await engine.setTrimSilence(value as TrimSilence);
  if (key === 'volumeBoost') await engine.setVolumeBoost(value as boolean);
}

export async function applyPlayerSettings(db: SQLiteDatabase) {
  const s = await getSettings(db);
  await engine.setSkipIntervals(s.skipBackS, s.skipForwardS);
}

// --- Skip rules for the episode in the player ----------------------------------------------

type Skip = { start: number; end: number; label: string; key: string };
let rules: { id: number; skipEndS: number; skips: Skip[] } | null = null;
/** Ranges the user chose to hear after all (Undo), for this listening session. */
const heard = new Set<string>();

async function refreshRules(db: SQLiteDatabase, episodeId: number) {
  const episode = await getEpisode(db, episodeId);
  if (!episode) return;
  const options = await optionsFor(db, episode.podcast_id);
  const chapters = await db.getAllAsync<{
    start_s: number;
    end_s: number | null;
    title: string | null;
  }>('SELECT start_s, end_s, title FROM chapter WHERE episode_id = ? AND selected = 0', episodeId);
  const ads = await db.getAllAsync<{ start_s: number; end_s: number }>(
    `SELECT start_s, end_s FROM ad_segment WHERE episode_id = ?
       AND COALESCE(user_verdict, CASE WHEN confidence >= 0.8 THEN 'ad' END) = 'ad'`,
    episodeId,
  );
  const skips: Skip[] = [
    ...chapters
      .filter((c) => c.end_s != null)
      .map((c) => ({
        start: c.start_s,
        end: c.end_s!,
        label: c.title ? `Skipped “${c.title}”` : 'Skipped chapter',
        key: `c:${c.start_s}`,
      })),
    ...ads.map((a) => ({
      start: a.start_s,
      end: a.end_s,
      label: 'Skipped ad',
      key: `a:${a.start_s}`,
    })),
  ];
  rules = { id: episodeId, skipEndS: options.skipEndS, skips };
}

export function undoSkip(notice: SkipNotice) {
  heard.add(notice.rangeKey);
  skipNotice.set(null);
  void engine.seekTo(notice.undoToMs);
}

// --- Loading and finishing ---------------------------------------------------------------

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
  const options = await optionsFor(db, episode.podcast_id);
  let startS = episode.played ? 0 : episode.position_s;
  // Starting within the last few seconds would end it at once; start over instead.
  if (episode.duration_s && startS > episode.duration_s - 10) startS = 0;
  // Skip the intro: never start before the podcast's "skip first N seconds".
  if (startS < options.skipStartS) startS = options.skipStartS;
  if (episode.played) await setPlayed(db, episodeId, false);
  await dequeue(db, episodeId);
  await setSetting(db, 'nowPlaying', episodeId);
  endedFor = null;
  heard.clear();
  skipNotice.set(null);
  await refreshRules(db, episodeId);
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
  await Promise.all([
    engine.setSpeed(options.speed),
    engine.setTrimSilence(options.trimSilence),
    engine.setVolumeBoost(options.volumeBoost),
  ]);
  void ensureChapters(db, episodeId).then(() => refreshRules(db, episodeId));
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
  if (endedFor === id) return; // the outro skip and the real end can both report it
  endedFor = id;
  await setPlayed(db, Number(id), true);
  const settings = await getSettings(db);
  if (settings.deletePlayedDownloads) await removeDownload(db, Number(id));
  if (stopAtEnd.get()) {
    stopAtEnd.set(false);
    await engine.pause();
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

/** Skips unticked chapters and ads, and ends early for the podcast's "skip last N seconds". */
function applyRules(db: SQLiteDatabase, state: PlayerState) {
  if (!rules || String(rules.id) !== state.id || !state.playing) return;
  const pos = state.positionMs / 1000;
  const duration = state.durationMs ? state.durationMs / 1000 : null;
  if (duration && rules.skipEndS > 0 && pos >= duration - rules.skipEndS) {
    void onEnded(db, state.id);
    return;
  }
  const skip = rules.skips.find((s) => !heard.has(s.key) && pos >= s.start && pos < s.end - 0.5);
  if (!skip) return;
  heard.add(skip.key); // once per range, so seeking back into it on purpose works
  const target = duration ? Math.min(skip.end, duration) : skip.end;
  void engine.seekTo(target * 1000);
  skipNotice.set({
    id: Date.now(),
    label: skip.label,
    undoToMs: skip.start * 1000,
    rangeKey: skip.key,
  });
}

/**
 * Listens to the engine for the life of the app: saves positions every few seconds and on
 * pause, applies skip rules, and handles episodes finishing. Returns an unsubscribe function.
 */
export function startPlayerSync(db: SQLiteDatabase): () => void {
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'ended') {
      void onEnded(db, event.id);
      return;
    }
    if (event.type === 'chapters') {
      void saveEmbeddedChapters(db, Number(event.id), event.chapters).then(() =>
        refreshRules(db, Number(event.id)),
      );
      return;
    }
    if (event.type !== 'state') return;
    const prev = lastState;
    const state = event.state;
    lastState = state;
    if (!state.id || state.state === 'ended') return;
    applyRules(db, state);
    const paused = prev?.playWhenReady && !state.playWhenReady;
    const moved = Math.abs(state.positionMs - lastSavedMs) >= 5000;
    // (Not on load: the first updates can report 0 before the resume position is applied.)
    if (paused || (state.playing && moved)) {
      lastSavedMs = state.positionMs;
      void savePosition(db, Number(state.id), state.positionMs / 1000);
    }
  });
  // Ticking or unticking chapters, or marking ads, changes what gets skipped.
  const changes = addDatabaseChangeListener(({ tableName }) => {
    if (rules && ['chapter', 'ad_segment', 'podcast_settings'].includes(tableName)) {
      void refreshRules(db, rules.id);
    }
  });
  void (async () => {
    await applyPlayerSettings(db);
    // Put the last episode back in the player (paused) after the app restarts.
    const settings = await getSettings(db);
    const current = await engine.getState(); // still playing from before the UI restarted?
    if (settings.nowPlaying && !current.id) {
      await playEpisode(db, settings.nowPlaying, { playWhenReady: false });
    } else if (current.id) {
      await refreshRules(db, Number(current.id));
    }
  })();
  return () => {
    unsubscribe();
    changes.remove();
  };
}
