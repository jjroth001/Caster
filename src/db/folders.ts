import type { SQLiteDatabase } from 'expo-sqlite';

import { inTransaction } from './library';

export const FOLDER_COLORS = [
  '#E07A5F',
  '#F2B880',
  '#81B29A',
  '#5B8DEF',
  '#9B7BFF',
  '#D9667A',
  '#8C8A84',
];

export type FolderRow = { id: number; name: string; color: string; sort_order: number };

export type LibraryFolder = FolderRow & {
  podcast_count: number;
  new_count: number;
  /** Up to four covers for the folder's tile. */
  artworks: (string | null)[];
};

export async function listFolders(db: SQLiteDatabase): Promise<LibraryFolder[]> {
  const folders = await db.getAllAsync<FolderRow & { podcast_count: number; new_count: number }>(`
    SELECT f.*,
      (SELECT COUNT(*) FROM podcast p WHERE p.folder_id = f.id AND p.subscribed = 1) AS podcast_count,
      (SELECT COUNT(*) FROM episode e JOIN podcast p ON p.id = e.podcast_id
         LEFT JOIN episode_state s ON s.episode_id = e.id
       WHERE p.folder_id = f.id AND p.subscribed = 1 AND COALESCE(e.pub_date, 0) >= p.new_since
         AND COALESCE(s.played, 0) = 0 AND COALESCE(s.archived, 0) = 0) AS new_count
    FROM folder f ORDER BY f.sort_order, f.name COLLATE NOCASE`);
  const result: LibraryFolder[] = [];
  for (const f of folders) {
    const art = await db.getAllAsync<{ artwork_url: string | null }>(
      'SELECT artwork_url FROM podcast WHERE folder_id = ? AND subscribed = 1 ORDER BY title COLLATE NOCASE LIMIT 4',
      f.id,
    );
    result.push({ ...f, artworks: art.map((a) => a.artwork_url) });
  }
  return result;
}

export function getFolder(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<FolderRow>('SELECT * FROM folder WHERE id = ?', id);
}

export async function createFolder(db: SQLiteDatabase, name: string): Promise<number> {
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM folder');
  const result = await db.runAsync(
    'INSERT INTO folder (name, color, sort_order) VALUES (?, ?, ?)',
    name.trim() || 'Folder',
    FOLDER_COLORS[(count?.n ?? 0) % FOLDER_COLORS.length],
    count?.n ?? 0,
  );
  return result.lastInsertRowId;
}

export async function renameFolder(db: SQLiteDatabase, id: number, name: string) {
  await db.runAsync('UPDATE folder SET name = ? WHERE id = ?', name.trim() || 'Folder', id);
}

export async function setFolderColor(db: SQLiteDatabase, id: number, color: string) {
  await db.runAsync('UPDATE folder SET color = ? WHERE id = ?', color, id);
}

/** Deleting a folder keeps its podcasts; they go back to the main list. */
export async function deleteFolder(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM folder WHERE id = ?', id);
}

/**
 * Saves your own library order (drag and drop): folders and podcasts share one sequence, so a
 * folder can sit between two podcasts.
 */
export async function saveLibraryOrder(
  db: SQLiteDatabase,
  items: { kind: 'folder' | 'podcast'; id: number }[],
) {
  await inTransaction(db, async () => {
    for (const [i, item] of items.entries()) {
      await db.runAsync(
        `UPDATE ${item.kind === 'folder' ? 'folder' : 'podcast'} SET sort_order = ? WHERE id = ?`,
        i,
        item.id,
      );
    }
  });
}

/** Sets which podcasts are in a folder: these ones in, any others it had back out. */
export async function setFolderPodcasts(db: SQLiteDatabase, folderId: number, podcastIds: number[]) {
  await inTransaction(db, async () => {
    await db.runAsync('UPDATE podcast SET folder_id = NULL WHERE folder_id = ?', folderId);
    for (const id of podcastIds) {
      await db.runAsync('UPDATE podcast SET folder_id = ? WHERE id = ?', folderId, id);
    }
  });
}

export async function movePodcastToFolder(
  db: SQLiteDatabase,
  podcastId: number,
  folderId: number | null,
) {
  await db.runAsync('UPDATE podcast SET folder_id = ? WHERE id = ?', folderId, podcastId);
}
