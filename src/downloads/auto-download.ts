import type { SQLiteDatabase } from 'expo-sqlite';

import { PlayerCore } from '@modules/player-core/src';
import { getPlaylist, playlistEpisodes } from '@/db/playlists';
import { getSettings, setSetting } from '@/db/settings';

import { downloadEpisode, keyFor, removeDownload } from './downloads';

/**
 * Auto-download, in the style of Pocket Casts: new episodes of the podcasts you choose (with a
 * limit on how many each keeps), episodes added to Up Next, the first few of chosen playlists,
 * and the latest two of a podcast you follow. Downloads you start yourself are never removed.
 */

/** How many episodes from the top of each chosen playlist are downloaded. */
export const PLAYLIST_DOWNLOADS = 10;
/** How many episodes are downloaded when you follow a podcast. */
export const ON_FOLLOW_DOWNLOADS = 2;

async function needsDownload(db: SQLiteDatabase, episodeId: number) {
  const row = await db.getFirstAsync<{ download_status: string | null }>(
    'SELECT download_status FROM episode_state WHERE episode_id = ?',
    episodeId,
  );
  return !row?.download_status;
}

async function downloadIfNeeded(db: SQLiteDatabase, episodeId: number) {
  if (await needsDownload(db, episodeId)) await downloadEpisode(db, episodeId, { automatic: true });
}

/** Ids of the episodes the playlists chosen for auto-download start with. */
async function playlistWanted(db: SQLiteDatabase, ids: number[]): Promise<Set<number>> {
  const wanted = new Set<number>();
  for (const id of ids) {
    const playlist = await getPlaylist(db, id);
    if (!playlist) continue;
    const episodes = await playlistEpisodes(db, playlist);
    episodes
      .filter((e) => !e.played && !e.archived)
      .slice(0, PLAYLIST_DOWNLOADS)
      .forEach((e) => wanted.add(e.id));
  }
  return wanted;
}

/**
 * Of one podcast's automatic downloads (newest first), the ones beyond the limit that can go:
 * not in Up Next, not playing, not half-listened, not starred and not wanted by a playlist.
 */
export function overLimit(
  downloads: { id: number; keep: boolean }[],
  limit: number,
  wanted: Set<number>,
): number[] {
  return downloads
    .slice(limit)
    .filter((d) => !d.keep && !wanted.has(d.id))
    .map((d) => d.id);
}

/** Starts every automatic download the settings call for, then trims to the limits. */
export async function runAutoDownloads(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  await upgradeAutoDownloadSettings(db);
  const settings = await getSettings(db);
  const wanted = await playlistWanted(db, settings.autoDownloadPlaylists);

  const chosen = settings.autoDownloadNew
    ? await db.getAllAsync<{ id: number; new_since: number }>(
        `SELECT p.id, p.new_since FROM podcast p JOIN podcast_settings ps ON ps.podcast_id = p.id
         WHERE p.subscribed = 1 AND ps.auto_download_n > 0`,
      )
    : [];
  for (const p of chosen) {
    const fresh = await db.getAllAsync<{ id: number }>(
      `SELECT e.id FROM episode e LEFT JOIN episode_state s ON s.episode_id = e.id
       WHERE e.podcast_id = ? AND COALESCE(e.pub_date, 0) >= ?
         AND COALESCE(s.played, 0) = 0 AND COALESCE(s.archived, 0) = 0
       ORDER BY e.pub_date DESC LIMIT ?`,
      p.id,
      p.new_since,
      settings.autoDownloadLimit,
    );
    for (const e of fresh) await downloadIfNeeded(db, e.id);
  }

  if (settings.autoDownloadUpNext) {
    const queue = await db.getAllAsync<{ episode_id: number }>(
      'SELECT episode_id FROM queue_item ORDER BY position',
    );
    for (const q of queue) await downloadIfNeeded(db, q.episode_id);
  }
  for (const id of wanted) await downloadIfNeeded(db, id);

  // The limit: each chosen podcast keeps its newest automatic downloads.
  for (const p of chosen) {
    const downloads = await db.getAllAsync<{ id: number; keep: number }>(
      `SELECT e.id, (
           EXISTS (SELECT 1 FROM queue_item q WHERE q.episode_id = e.id)
           OR e.id = ? OR s.starred = 1 OR (s.position_s > 0 AND s.played = 0)
         ) AS keep
       FROM episode e JOIN episode_state s ON s.episode_id = e.id
       WHERE e.podcast_id = ? AND s.auto_downloaded = 1 AND s.download_status IS NOT NULL
       ORDER BY e.pub_date DESC`,
      settings.nowPlaying ?? -1,
      p.id,
    );
    const remove = overLimit(
      downloads.map((d) => ({ id: d.id, keep: !!d.keep })),
      settings.autoDownloadLimit,
      wanted,
    );
    for (const id of remove) await removeDownload(db, id);
  }
}

/** After an episode joins Up Next: download it if that's switched on. */
export async function autoDownloadQueued(db: SQLiteDatabase, episodeId: number) {
  if (!PlayerCore) return;
  const settings = await getSettings(db);
  if (settings.autoDownloadUpNext) await downloadIfNeeded(db, episodeId);
}

/** After following a podcast: download its latest two episodes if that's switched on. */
export async function autoDownloadFollowed(db: SQLiteDatabase, podcastId: number) {
  if (!PlayerCore) return;
  const settings = await getSettings(db);
  if (!settings.autoDownloadOnFollow) return;
  const latest = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM episode WHERE podcast_id = ? ORDER BY pub_date DESC LIMIT ?',
    podcastId,
    ON_FOLLOW_DOWNLOADS,
  );
  for (const e of latest) await downloadIfNeeded(db, e.id);
}

/** Chooses (or stops choosing) one podcast for new-episode downloads. */
export async function setPodcastAutoDownload(db: SQLiteDatabase, podcastId: number, on: boolean) {
  await db.runAsync(
    `INSERT INTO podcast_settings (podcast_id, auto_download_n) VALUES (?, ?)
     ON CONFLICT (podcast_id) DO UPDATE SET auto_download_n = excluded.auto_download_n`,
    podcastId,
    on ? 1 : 0,
  );
}

/** Stops every download that's waiting or in progress. */
export async function stopAllDownloads(db: SQLiteDatabase): Promise<number> {
  const rows = await db.getAllAsync<{ id: number; podcast_id: number; guid: string }>(
    `SELECT e.id, e.podcast_id, e.guid FROM episode e JOIN episode_state s ON s.episode_id = e.id
     WHERE s.download_status IN ('queued', 'downloading')`,
  );
  for (const r of rows) {
    PlayerCore?.deleteDownload(keyFor(r));
    await db.runAsync(
      `UPDATE episode_state SET download_status = NULL, local_path = NULL, auto_downloaded = 0
       WHERE episode_id = ?`,
      r.id,
    );
  }
  return rows.length;
}

/** Forgets failed downloads, so they stop showing an error. */
export async function clearDownloadErrors(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync(
    `UPDATE episode_state SET download_status = NULL WHERE download_status = 'failed'`,
  );
  return result.changes;
}

/**
 * What the old one-number setting (newest N of every podcast, with per-podcast overrides)
 * becomes: the podcasts that downloaded anything are chosen, and N becomes the limit.
 */
export function planAutoDownloadUpgrade(
  oldGlobal: number,
  podcasts: { id: number; n: number | null }[],
): { enabled: boolean; limit: number; chosen: number[]; notChosen: number[] } {
  const chosen: number[] = [];
  const notChosen: number[] = [];
  let limit = oldGlobal;
  for (const p of podcasts) {
    const n = p.n ?? oldGlobal;
    if (n > 0) chosen.push(p.id);
    else notChosen.push(p.id);
    if (p.n && oldGlobal <= 0) limit = Math.max(limit, p.n);
  }
  return { enabled: chosen.length > 0, limit: limit > 0 ? limit : 2, chosen, notChosen };
}

/** Carries the pre-0.4.3 auto-download setting over, once. */
export async function upgradeAutoDownloadSettings(db: SQLiteDatabase) {
  const settings = await getSettings(db);
  if (settings.autoDownloadUpgraded) return;
  const podcasts = await db.getAllAsync<{ id: number; n: number | null }>(
    `SELECT p.id, ps.auto_download_n AS n FROM podcast p
     LEFT JOIN podcast_settings ps ON ps.podcast_id = p.id WHERE p.subscribed = 1`,
  );
  const plan = planAutoDownloadUpgrade(settings.autoDownload, podcasts);
  for (const id of plan.chosen) await setPodcastAutoDownload(db, id, true);
  for (const id of plan.notChosen) await setPodcastAutoDownload(db, id, false);
  await setSetting(db, 'autoDownloadNew', plan.enabled);
  await setSetting(db, 'autoDownloadLimit', plan.limit);
  await setSetting(db, 'autoDownloadUpgraded', true);
}
