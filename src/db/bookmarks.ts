import type { SQLiteDatabase } from 'expo-sqlite';

import { clock } from '@/lib/format';

export type BookmarkItem = {
  id: number;
  episode_id: number;
  position_s: number;
  title: string;
  transcript_passage: string | null;
  created_at: number;
  episode_title: string;
  podcast_title: string;
  artwork: string | null;
};

const SELECT = `
  SELECT b.*, e.title AS episode_title, p.title AS podcast_title,
         COALESCE(e.artwork_url, p.artwork_url) AS artwork
  FROM bookmark b JOIN episode e ON e.id = b.episode_id JOIN podcast p ON p.id = e.podcast_id`;

export function listBookmarks(db: SQLiteDatabase, episodeId?: number) {
  return episodeId == null
    ? db.getAllAsync<BookmarkItem>(`${SELECT} ORDER BY b.created_at DESC`)
    : db.getAllAsync<BookmarkItem>(
        `${SELECT} WHERE b.episode_id = ? ORDER BY b.position_s`,
        episodeId,
      );
}

export async function addBookmark(
  db: SQLiteDatabase,
  episodeId: number,
  positionS: number,
  title?: string,
  passage?: string | null,
) {
  const result = await db.runAsync(
    'INSERT INTO bookmark (episode_id, position_s, title, transcript_passage, created_at) VALUES (?, ?, ?, ?, ?)',
    episodeId,
    positionS,
    title ?? `Bookmark at ${clock(positionS * 1000)}`,
    passage ?? null,
    Date.now(),
  );
  return result.lastInsertRowId;
}

export async function renameBookmark(db: SQLiteDatabase, id: number, title: string) {
  await db.runAsync('UPDATE bookmark SET title = ? WHERE id = ?', title.trim() || 'Bookmark', id);
}

export async function deleteBookmark(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM bookmark WHERE id = ?', id);
}
