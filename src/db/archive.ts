import type { SQLiteDatabase } from 'expo-sqlite';

import { inTransaction } from './library';
import { getSettings } from './settings';

/**
 * Auto-archive, as in Pocket Casts: played episodes after a while, and episodes you never
 * started once they're old. Archived episodes drop out of a podcast's list (behind "Show
 * archived") and out of new-episode counts; playing one brings it back. Never archived: what's
 * in Up Next, playing or downloaded, and starred episodes unless you include them.
 */

/** Hours; -1 is never. */
export const ARCHIVE_PLAYED_OPTIONS = [
  { value: -1, label: 'Never' },
  { value: 0, label: 'Right away' },
  { value: 24, label: 'After 1 day' },
  { value: 48, label: 'After 2 days' },
  { value: 168, label: 'After 1 week' },
];

export const ARCHIVE_INACTIVE_OPTIONS = [
  { value: -1, label: 'Never' },
  { value: 24, label: 'After 1 day' },
  { value: 48, label: 'After 2 days' },
  { value: 168, label: 'After 1 week' },
  { value: 336, label: 'After 2 weeks' },
  { value: 720, label: 'After 30 days' },
  { value: 2160, label: 'After 3 months' },
];

const HOUR = 60 * 60 * 1000;

/** Archives what the rules say should be, podcast by podcast (each may have its own rules). */
export async function runAutoArchive(db: SQLiteDatabase, now = Date.now()): Promise<number> {
  const settings = await getSettings(db);
  const podcasts = await db.getAllAsync<{
    id: number;
    played_h: number | null;
    inactive_h: number | null;
  }>(
    `SELECT p.id, ps.archive_played_h AS played_h, ps.archive_inactive_h AS inactive_h
     FROM podcast p LEFT JOIN podcast_settings ps ON ps.podcast_id = p.id WHERE p.subscribed = 1`,
  );
  const keep = `COALESCE(s.local_path, '') = '' AND e.id != ?
    AND NOT EXISTS (SELECT 1 FROM queue_item q WHERE q.episode_id = e.id)
    ${settings.autoArchiveStarred ? '' : 'AND COALESCE(s.starred, 0) = 0'}`;
  let archived = 0;
  await inTransaction(db, async () => {
    for (const p of podcasts) {
      const playedH = p.played_h ?? settings.autoArchivePlayed;
      const inactiveH = p.inactive_h ?? settings.autoArchiveInactive;
      if (playedH >= 0) {
        const r = await db.runAsync(
          `UPDATE episode_state SET archived = 1, updated_at = ? WHERE episode_id IN (
             SELECT e.id FROM episode e JOIN episode_state s ON s.episode_id = e.id
             WHERE e.podcast_id = ? AND s.played = 1 AND s.archived = 0
               AND COALESCE(s.played_at, s.updated_at) <= ? AND ${keep})`,
          now,
          p.id,
          now - playedH * HOUR,
          settings.nowPlaying ?? -1,
        );
        archived += r.changes;
      }
      if (inactiveH >= 0) {
        const r = await db.runAsync(
          `INSERT INTO episode_state (episode_id, updated_at, archived)
           SELECT e.id, ?, 1 FROM episode e LEFT JOIN episode_state s ON s.episode_id = e.id
           WHERE e.podcast_id = ? AND COALESCE(s.played, 0) = 0 AND COALESCE(s.archived, 0) = 0
             AND COALESCE(s.position_s, 0) = 0 AND COALESCE(e.pub_date, 0) <= ? AND ${keep}
           ON CONFLICT (episode_id) DO UPDATE SET archived = 1, updated_at = excluded.updated_at`,
          now,
          p.id,
          now - inactiveH * HOUR,
          settings.nowPlaying ?? -1,
        );
        archived += r.changes;
      }
    }
  });
  return archived;
}
