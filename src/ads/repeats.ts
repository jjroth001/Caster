import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { PlayerCore, type AudioRepeat } from '@modules/player-core/src';
import { inTransaction } from '@/db/library';
import { getSettings } from '@/db/settings';
import { keyFor, splitKey } from '@/downloads/downloads';
import { refreshSkipRules } from '@/player/controller';

import { mergeSpans, repeatConfidence, type AdSpan } from './repeat-rules';

/**
 * Ad-skipping layer 3: the same audio in more than one episode. Each downloaded episode gets an
 * audio fingerprint (kept after the download is removed; about 450 KB an hour) and is compared
 * with the most recent others. A stretch of 15 seconds or more that matches another show, or
 * the middle of another episode of the same show, is almost always an ad; one at the very start
 * or end of the same show is more likely its theme, so it's only shaded on the progress bar.
 */

/** Keys of fingerprints of ads you marked (parts of episodes), checked against every episode. */
export const SAMPLE = 'ad:';
const isSample = (key: string) => key.startsWith(SAMPLE);

/** How many other episodes each new one is compared with. */
const COMPARE_WITH = 40;
/** Fingerprints kept (the newest episodes'); older ones are removed. */
const KEEP = 300;
type EpisodeRow = {
  id: number;
  podcast_id: number;
  guid: string;
  duration_s: number | null;
  local_path?: string | null;
};

async function episodeForKey(db: SQLiteDatabase, key: string): Promise<EpisodeRow | null> {
  const parts = splitKey(key);
  if (!parts) return null;
  return db.getFirstAsync<EpisodeRow>(
    'SELECT id, podcast_id, guid, duration_s FROM episode WHERE podcast_id = ? AND guid = ?',
    parts.podcastId,
    parts.guid,
  );
}

/**
 * Saves repeated-audio ads for one episode: replaces earlier findings you haven't judged, and
 * never adds one over a stretch you said isn't an ad (Undo).
 */
export async function saveSpans(db: SQLiteDatabase, episodeId: number, spans: AdSpan[]) {
  if (spans.length === 0) return;
  await inTransaction(db, async () => {
    const existing = await db.getAllAsync<{
      start_s: number;
      end_s: number;
      confidence: number;
      user_verdict: string | null;
    }>(
      'SELECT start_s, end_s, confidence, user_verdict FROM ad_segment WHERE episode_id = ? AND layer = 3',
      episodeId,
    );
    const judged = existing.filter((e) => e.user_verdict != null);
    const merged = mergeSpans([
      ...existing
        .filter((e) => e.user_verdict == null)
        .map((e) => ({ start: e.start_s, end: e.end_s, confidence: e.confidence })),
      ...spans,
    ]);
    await db.runAsync(
      'DELETE FROM ad_segment WHERE episode_id = ? AND layer = 3 AND user_verdict IS NULL',
      episodeId,
    );
    for (const s of merged) {
      const overlapsJudged = judged.some(
        (j) => Math.min(j.end_s, s.end) - Math.max(j.start_s, s.start) > (s.end - s.start) / 2,
      );
      if (overlapsJudged) continue;
      await db.runAsync(
        'INSERT INTO ad_segment (episode_id, start_s, end_s, layer, confidence) VALUES (?, ?, ?, 3, ?)',
        episodeId,
        s.start,
        s.end,
        s.confidence,
      );
    }
  });
}

/** Turns what the matcher found into ads for this episode and for the episodes it matched. */
async function applyRepeats(db: SQLiteDatabase, episode: EpisodeRow, repeats: AudioRepeat[]) {
  const mine: AdSpan[] = [];
  const theirs = new Map<number, { episode: EpisodeRow; spans: AdSpan[] }>();
  for (const r of repeats) {
    // The same audio as an ad you marked yourself: as sure as it gets.
    if (isSample(r.otherKey)) {
      mine.push({ start: r.start, end: r.end, confidence: 0.95 });
      continue;
    }
    const otherPodcast = splitKey(r.otherKey)?.podcastId ?? -1;
    const otherShow = otherPodcast !== episode.podcast_id;
    mine.push({ ...r, confidence: repeatConfidence(r, episode.duration_s, otherShow) });
    const other = await episodeForKey(db, r.otherKey);
    if (!other) continue;
    const span = { start: r.otherStart, end: r.otherStart + (r.end - r.start) };
    const entry = theirs.get(other.id) ?? { episode: other, spans: [] };
    entry.spans.push({ ...span, confidence: repeatConfidence(span, other.duration_s, otherShow) });
    theirs.set(other.id, entry);
  }
  await saveSpans(db, episode.id, mine);
  for (const { episode: other, spans } of theirs.values()) await saveSpans(db, other.id, spans);
}

let running = false;
let again = false;
let cancelled = false;

/** Stops after the episode being fingerprinted now (the phone was unplugged). */
export function cancelRepeatedAds() {
  cancelled = true;
  again = false;
}
/** Downloads that couldn't be fingerprinted this session (not retried until Caster restarts). */
const failed = new Set<string>();

// --- What the episode page shows: which episodes have a fingerprint, and which one is in progress.

type FingerprintState = { known: Set<string> | null; working: string | null; failed: Set<string> };
let state: FingerprintState = { known: null, working: null, failed };
const listeners = new Set<() => void>();
function update(next: Partial<FingerprintState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!state.known && PlayerCore) {
    const known = new Set(PlayerCore.listFingerprints());
    queueMicrotask(() => update({ known }));
  }
  return () => listeners.delete(listener);
}

export type FingerprintStatus = 'done' | 'working' | 'waiting' | 'failed' | 'needs-download';

/** Where an episode's audio fingerprint is up to (null before it's known, or in Expo Go). */
export function useFingerprintStatus(
  episode: { podcast_id: number; guid: string } | null,
  downloaded: boolean,
): FingerprintStatus | null {
  const s = useSyncExternalStore(subscribe, () => state);
  if (!PlayerCore || !episode || !s.known) return null;
  const key = keyFor(episode);
  if (s.known.has(key)) return 'done';
  if (s.working === key) return 'working';
  if (s.failed.has(key)) return 'failed';
  return downloaded ? 'waiting' : 'needs-download';
}

/**
 * Fingerprints downloaded episodes that don't have one yet, newest first, and marks the ads
 * they share with other episodes. Runs one at a time in the background; a call while it's
 * running makes it go round once more.
 */
export async function detectRepeatedAds(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  cancelled = false;
  try {
    do {
      again = false;
      await runOnce(db);
    } while (again);
  } finally {
    running = false;
  }
}

async function runOnce(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  const settings = await getSettings(db);
  if (!settings.adSkip) return;
  const have = new Set(PlayerCore.listFingerprints());
  const downloaded = await db.getAllAsync<EpisodeRow & { local_path: string }>(
    `SELECT e.id, e.podcast_id, e.guid, e.duration_s, s.local_path FROM episode e
     JOIN episode_state s ON s.episode_id = e.id
     WHERE s.local_path IS NOT NULL ORDER BY e.pub_date DESC LIMIT 100`,
  );
  const todo = downloaded.filter((e) => !have.has(keyFor(e)) && !failed.has(keyFor(e)));
  // Tells the charging worker whether there's anything left for it to do.
  PlayerCore.setFingerprintPending(todo.length);
  let changed = false;
  let left = todo.length;
  for (const episode of todo) {
    if (cancelled) break;
    const key = keyFor(episode);
    update({ working: key });
    try {
      await PlayerCore.fingerprintEpisode(key, episode.local_path);
    } catch {
      failed.add(key);
      update({ working: null, failed: new Set(failed) });
      continue;
    }
    have.add(key);
    update({ working: null, known: new Set(have) });
    PlayerCore.setFingerprintPending(--left);
    const others = [...(await recentKeys(db, [...have], key)), ...[...have].filter(isSample)];
    const repeats = await PlayerCore.findRepeats(key, others);
    if (repeats.length > 0) {
      await applyRepeats(db, episode, repeats);
      changed = true;
    }
  }
  if (changed) await refreshSkipRules(db);
  await prune(db, [...have]);
}

/** The most recently published fingerprinted episodes, other than this one. */
async function recentKeys(
  db: SQLiteDatabase,
  keys: string[],
  except: string,
  limit = COMPARE_WITH,
): Promise<string[]> {
  const dated: { key: string; date: number }[] = [];
  for (const key of keys) {
    if (key === except) continue;
    const parts = splitKey(key);
    if (!parts) continue;
    const row = await db.getFirstAsync<{ pub_date: number | null }>(
      'SELECT pub_date FROM episode WHERE podcast_id = ? AND guid = ?',
      parts.podcastId,
      parts.guid,
    );
    dated.push({ key, date: row?.pub_date ?? 0 });
  }
  return dated
    .sort((a, b) => b.date - a.date)
    .slice(0, limit)
    .map((d) => d.key);
}

/** Keeps the newest fingerprints; removes the rest (and any whose episode is gone). */
async function prune(db: SQLiteDatabase, keys: string[]) {
  if (!PlayerCore || keys.length <= KEEP) return;
  const keep = new Set(await recentKeys(db, keys, '', KEEP));
  for (const key of keys) if (!keep.has(key) && !isSample(key)) PlayerCore.deleteFingerprint(key);
}

/** Checks the recent episodes against an ad you just marked, so they skip it too. */
export async function scanForSample(db: SQLiteDatabase, sampleKey: string) {
  if (!PlayerCore) return;
  const keys = PlayerCore.listFingerprints();
  let changed = false;
  for (const key of await recentKeys(db, keys, '')) {
    const episode = await episodeForKey(db, key);
    if (!episode) continue;
    const repeats = await PlayerCore.findRepeats(key, [sampleKey]);
    if (repeats.length > 0) {
      await applyRepeats(db, episode, repeats);
      changed = true;
    }
  }
  if (changed) await refreshSkipRules(db);
}
