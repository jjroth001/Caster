import type { SQLiteDatabase } from 'expo-sqlite';

import { queueEpisode } from './library';
import { getSettings } from './settings';

/**
 * Auto-add to Up Next, as in Pocket Casts: a podcast set to it has its new episodes added at
 * the top (to play next) or the bottom, until Up Next reaches its limit. Only episodes newer
 * than the ones it had before the check count, so following a show or an old episode
 * reappearing never floods the queue. What you queued yourself is never touched.
 */

/** Which new episodes to add, oldest first, given how full Up Next is. */
export function episodesToAdd(newIds: number[], queued: number, limit: number): number[] {
  return newIds.slice(0, Math.max(0, limit - queued));
}

export async function autoQueueNew(db: SQLiteDatabase, podcastId: number, latestBefore: number) {
  const own = await db.getFirstAsync<{ up_next_auto: string | null }>(
    'SELECT up_next_auto FROM podcast_settings WHERE podcast_id = ?',
    podcastId,
  );
  const where = own?.up_next_auto;
  if (where !== 'top' && where !== 'bottom') return;
  const fresh = await db.getAllAsync<{ id: number }>(
    `SELECT e.id FROM episode e
     JOIN podcast p ON p.id = e.podcast_id AND p.subscribed = 1
     LEFT JOIN episode_state s ON s.episode_id = e.id
     WHERE e.podcast_id = ? AND e.pub_date > ?
       AND COALESCE(s.played, 0) = 0 AND COALESCE(s.archived, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM queue_item q WHERE q.episode_id = e.id)
     ORDER BY e.pub_date ASC`,
    podcastId,
    latestBefore,
  );
  if (fresh.length === 0) return;
  const { upNextLimit } = await getSettings(db);
  const queued =
    (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM queue_item'))?.n ?? 0;
  // Oldest first: at the top, each newer one goes above it, so the newest plays next.
  for (const id of episodesToAdd(
    fresh.map((e) => e.id),
    queued,
    upNextLimit,
  )) {
    await queueEpisode(db, id, where === 'top' ? 'next' : 'last');
  }
}
