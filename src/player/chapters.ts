import type { SQLiteDatabase } from 'expo-sqlite';

import type { EmbeddedChapter } from '@modules/player-core/src';
import { inTransaction } from '@/db/library';
import { getSettings, setSetting } from '@/db/settings';
import { fetchWithTimeout } from '@/lib/http';

export type Chapter = {
  start: number;
  end: number | null;
  title: string | null;
  imageUrl: string | null;
  url: string | null;
};

export type ChapterRow = {
  episode_id: number;
  start_s: number;
  end_s: number | null;
  title: string | null;
  image_url: string | null;
  url: string | null;
  selected: number;
  source: string;
};

/** Podcasting 2.0 JSON chapters; entries marked `toc: false` are hidden markers, not chapters. */
export function parseChaptersJson(text: string): Chapter[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = (data as { chapters?: unknown })?.chapters;
  if (!Array.isArray(list)) return [];
  const chapters = list
    .filter(
      (c) => c && typeof c === 'object' && Number.isFinite(Number(c.startTime)) && c.toc !== false,
    )
    .map((c) => ({
      start: Math.max(0, Number(c.startTime)),
      end: Number.isFinite(Number(c.endTime)) ? Number(c.endTime) : null,
      title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : null,
      imageUrl: typeof c.img === 'string' && /^https?:\/\//.test(c.img) ? c.img : null,
      url: typeof c.url === 'string' && /^https?:\/\//.test(c.url) ? c.url : null,
    }))
    .sort((a, b) => a.start - b.start);
  return fillEnds(chapters);
}

/** Each chapter ends where the next begins, unless it says otherwise. */
export function fillEnds(chapters: Chapter[]): Chapter[] {
  return chapters.map((c, i) => ({ ...c, end: c.end ?? chapters[i + 1]?.start ?? null }));
}

export function fromEmbedded(chapters: EmbeddedChapter[]): Chapter[] {
  return fillEnds(
    chapters.map((c) => ({
      start: c.startMs / 1000,
      end: c.endMs > c.startMs ? c.endMs / 1000 : null,
      title: c.title,
      imageUrl: null,
      url: null,
    })),
  );
}

/**
 * Saves your chapter words and skips saved chapters that now match (ones you ticked or
 * unticked yourself otherwise stay as they are).
 */
export async function setChapterWords(db: SQLiteDatabase, words: string[]) {
  await setSetting(db, 'adKeywords', words);
  const chapters = await db.getAllAsync<{ rowid: number; title: string | null }>(
    'SELECT rowid, title FROM chapter WHERE selected = 1 AND title IS NOT NULL',
  );
  const matching = chapters.filter((c) => isAdTitle(c.title, words));
  await inTransaction(db, async () => {
    for (const c of matching) {
      await db.runAsync('UPDATE chapter SET selected = 0 WHERE rowid = ?', c.rowid);
    }
  });
}

/** Whether a chapter title looks like an ad break, by the user's keyword list. */
export function isAdTitle(title: string | null, keywords: string[]): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return keywords.some((k) => {
    const word = k.trim().toLowerCase();
    if (!word) return false;
    // Whole words (plurals too), so "ad" doesn't match "Adam" or "read".
    return new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?([^a-z]|$)`).test(
      t,
    );
  });
}

async function adSkipOn(
  db: SQLiteDatabase,
  episodeId: number,
): Promise<{ on: boolean; keywords: string[] }> {
  const settings = await getSettings(db);
  const row = await db.getFirstAsync<{ ad_skip_enabled: number | null }>(
    `SELECT ps.ad_skip_enabled FROM episode e LEFT JOIN podcast_settings ps ON ps.podcast_id = e.podcast_id
     WHERE e.id = ?`,
    episodeId,
  );
  const on = row?.ad_skip_enabled == null ? settings.adSkip : !!row.ad_skip_enabled;
  return { on, keywords: settings.adKeywords };
}

export async function saveChapters(
  db: SQLiteDatabase,
  episodeId: number,
  chapters: Chapter[],
  source: 'json' | 'id3',
) {
  if (chapters.length === 0) return;
  const ads = await adSkipOn(db, episodeId);
  await inTransaction(db, async () => {
    await db.runAsync('DELETE FROM chapter WHERE episode_id = ?', episodeId);
    for (const c of chapters) {
      const selected = ads.on && isAdTitle(c.title, ads.keywords) ? 0 : 1;
      await db.runAsync(
        `INSERT OR REPLACE INTO chapter (episode_id, start_s, end_s, title, image_url, url, selected, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        episodeId,
        c.start,
        c.end,
        c.title,
        c.imageUrl,
        c.url,
        selected,
        source,
      );
    }
  });
}

export function listChapters(db: SQLiteDatabase, episodeId: number) {
  return db.getAllAsync<ChapterRow>(
    'SELECT * FROM chapter WHERE episode_id = ? ORDER BY start_s',
    episodeId,
  );
}

/** Fetches an episode's Podcasting 2.0 chapters once (they win over chapters in the file). */
export async function ensureChapters(db: SQLiteDatabase, episodeId: number) {
  const existing = await db.getFirstAsync<{ source: string }>(
    'SELECT source FROM chapter WHERE episode_id = ? LIMIT 1',
    episodeId,
  );
  if (existing?.source === 'json') return;
  const episode = await db.getFirstAsync<{ chapters_url: string | null }>(
    'SELECT chapters_url FROM episode WHERE id = ?',
    episodeId,
  );
  if (!episode?.chapters_url) return;
  try {
    const response = await fetchWithTimeout(episode.chapters_url, {}, 30_000);
    if (!response.ok) return;
    const chapters = parseChaptersJson(await response.text());
    await saveChapters(db, episodeId, chapters, 'json');
  } catch {
    // No chapters this time; playback carries on.
  }
}

/** Chapters the player found in the file, kept only when there are no JSON chapters. */
export async function saveEmbeddedChapters(
  db: SQLiteDatabase,
  episodeId: number,
  chapters: EmbeddedChapter[],
) {
  const existing = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM chapter WHERE episode_id = ?',
    episodeId,
  );
  if (existing?.n) return;
  await saveChapters(db, episodeId, fromEmbedded(chapters), 'id3');
}

export async function setChapterSelected(
  db: SQLiteDatabase,
  episodeId: number,
  start: number,
  selected: boolean,
) {
  await db.runAsync(
    'UPDATE chapter SET selected = ? WHERE episode_id = ? AND start_s = ?',
    selected ? 1 : 0,
    episodeId,
    start,
  );
}

/** The chapter playing at `positionS`. */
export function chapterAt<T extends { start_s: number; end_s: number | null }>(
  chapters: T[],
  positionS: number,
): { chapter: T; index: number } | null {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (positionS >= chapters[i].start_s) return { chapter: chapters[i], index: i };
  }
  return null;
}
