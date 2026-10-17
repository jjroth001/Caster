import type { SQLiteDatabase } from 'expo-sqlite';

import { getSettings } from '@/db/settings';

export type Cue = { start: number; end: number; text: string; speaker?: string | null };

/** The transcript text spoken in the ~20 seconds before `positionS`. */
export function passageFrom(cues: Cue[], positionS: number, windowS = 20): string | null {
  const text = cues
    .filter((c) => c.end > positionS - windowS && c.start <= positionS)
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** A short title from a passage: its first clause, at most 60 characters. */
export function titleFrom(passage: string): string {
  const clause = passage.split(/(?<=[.!?;:])\s|\s[-–—]\s/)[0] ?? passage;
  const trimmed = clause.trim();
  if (trimmed.length <= 60) return trimmed;
  const cut = trimmed.slice(0, 60);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).trim()}…`;
}

/**
 * Smart Bookmarks: when the episode has a transcript, a bookmark keeps the passage leading up
 * to it and takes a title from it. Off in settings, or with no transcript, it returns null.
 */
export async function passageBefore(
  db: SQLiteDatabase,
  episodeId: number,
  positionS: number,
): Promise<{ title: string; text: string } | null> {
  const settings = await getSettings(db);
  if (!settings.smartBookmarks) return null;
  const row = await db.getFirstAsync<{ cues_json: string }>(
    'SELECT cues_json FROM transcript WHERE episode_id = ?',
    episodeId,
  );
  if (!row) return null;
  let cues: Cue[];
  try {
    cues = JSON.parse(row.cues_json);
  } catch {
    return null;
  }
  const text = passageFrom(cues, positionS);
  return text ? { title: titleFrom(text), text } : null;
}
