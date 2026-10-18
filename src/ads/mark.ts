import type { SQLiteDatabase } from 'expo-sqlite';

import { PlayerCore } from '@modules/player-core/src';
import { inTransaction } from '@/db/library';
import { keyFor } from '@/downloads/downloads';
import { refreshSkipRules } from '@/player/controller';

import { SAMPLE, scanForSample } from './repeats';

/** "That was an ad": how far back the choices reach, in seconds. */
export const MARK_CHOICES = [
  { seconds: 30, label: 'The last 30 seconds' },
  { seconds: 60, label: 'The last minute' },
  { seconds: 120, label: 'The last 2 minutes' },
];

/**
 * Marks the stretch just heard as an ad. It snaps to anything Caster had already found there,
 * is always skipped from now on, and (when the episode has an audio fingerprint) becomes a
 * sample that finds the same ad in other episodes, now and in future downloads.
 */
export async function markAdBefore(
  db: SQLiteDatabase,
  episode: { id: number; podcast_id: number; guid: string },
  positionS: number,
  seconds: number,
) {
  let start = Math.max(0, positionS - seconds);
  let end = positionS;
  const near = await db.getAllAsync<{ id: number; start_s: number; end_s: number }>(
    'SELECT id, start_s, end_s FROM ad_segment WHERE episode_id = ? AND end_s > ? AND start_s < ?',
    episode.id,
    start - 5,
    end + 5,
  );
  for (const n of near) {
    start = Math.min(start, n.start_s);
    end = Math.max(end, n.end_s);
  }
  await inTransaction(db, async () => {
    for (const n of near) {
      await db.runAsync("UPDATE ad_segment SET user_verdict = 'ad' WHERE id = ?", n.id);
    }
    await db.runAsync(
      `INSERT INTO ad_segment (episode_id, start_s, end_s, layer, confidence, user_verdict)
       VALUES (?, ?, ?, 3, 1, 'ad')`,
      episode.id,
      start,
      end,
    );
  });
  await refreshSkipRules(db);
  const key = keyFor(episode);
  const sampleKey = `${SAMPLE}${key}@${Math.round(start)}`;
  if (PlayerCore?.saveAdSample(key, sampleKey, start, end)) void scanForSample(db, sampleKey);
}
