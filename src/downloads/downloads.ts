import type { SQLiteDatabase } from 'expo-sqlite';

import { PlayerCore, type DownloadEvent } from '@modules/player-core/src';
import { getSettings } from '@/db/settings';

/**
 * Episode downloads. The native side (WorkManager) owns the files; this keeps the library's
 * download_status / local_path in step with it. Downloads need the installed app (not Expo Go).
 */

export const downloadsAvailable = !!PlayerCore;

type EpisodeKeyRow = {
  id: number;
  podcast_id: number;
  guid: string;
  enclosure_url: string;
  mime: string | null;
  title: string;
};

export const keyFor = (e: { podcast_id: number; guid: string }) => `${e.podcast_id}:${e.guid}`;

function splitKey(key: string): { podcastId: number; guid: string } | null {
  const i = key.indexOf(':');
  if (i < 1) return null;
  const podcastId = Number(key.slice(0, i));
  return Number.isFinite(podcastId) ? { podcastId, guid: key.slice(i + 1) } : null;
}

async function episodeForKey(db: SQLiteDatabase, key: string) {
  const parts = splitKey(key);
  if (!parts) return null;
  return db.getFirstAsync<{ id: number }>(
    'SELECT id FROM episode WHERE podcast_id = ? AND guid = ?',
    parts.podcastId,
    parts.guid,
  );
}

async function setDownloadState(
  db: SQLiteDatabase,
  episodeId: number,
  status: string | null,
  localPath: string | null,
) {
  await db.runAsync(
    `INSERT INTO episode_state (episode_id, updated_at, download_status, local_path) VALUES (?, ?, ?, ?)
     ON CONFLICT (episode_id) DO UPDATE SET download_status = excluded.download_status,
       local_path = excluded.local_path, updated_at = excluded.updated_at`,
    episodeId,
    Date.now(),
    status,
    localPath,
  );
}

export async function downloadEpisode(
  db: SQLiteDatabase,
  episodeId: number,
  { automatic = false }: { automatic?: boolean } = {},
) {
  if (!PlayerCore) return;
  const e = await db.getFirstAsync<EpisodeKeyRow>(
    'SELECT id, podcast_id, guid, enclosure_url, mime, title FROM episode WHERE id = ?',
    episodeId,
  );
  if (!e) return;
  const settings = await getSettings(db);
  PlayerCore.download({
    key: keyFor(e),
    url: e.enclosure_url,
    mime: e.mime,
    title: e.title,
    // Downloads you start yourself go ahead on mobile data; automatic ones follow the settings.
    wifiOnly: automatic && settings.downloadWifiOnly,
    chargingOnly: automatic && settings.downloadChargingOnly,
  });
  await setDownloadState(db, e.id, 'queued', null);
}

export async function removeDownload(db: SQLiteDatabase, episodeId: number) {
  const e = await db.getFirstAsync<EpisodeKeyRow>(
    'SELECT id, podcast_id, guid FROM episode WHERE id = ?',
    episodeId,
  );
  if (!e) return;
  PlayerCore?.deleteDownload(keyFor(e));
  await setDownloadState(db, e.id, null, null);
}

/** Applies a progress/finish event from the native side. */
export async function applyDownloadEvent(db: SQLiteDatabase, event: DownloadEvent) {
  const episode = await episodeForKey(db, event.key);
  if (!episode) return; // an episode the app hasn't saved yet; reconcile picks it up later
  if (event.state === 'done' && event.uri) {
    await setDownloadState(db, episode.id, 'done', event.uri);
  } else if (event.state === 'cancelled') {
    await setDownloadState(db, episode.id, null, null);
  } else {
    await setDownloadState(db, episode.id, event.state, null);
  }
}

/**
 * Brings the library in line with the files on disk: finished downloads (including ones the
 * background refresh started) get their path; entries whose file is gone are cleared.
 */
export async function reconcileDownloads(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  const finished = PlayerCore.listDownloads();
  const active = await PlayerCore.activeDownloads();
  const byKey = new Map(finished.map((f) => [f.key, f.uri]));
  const activeKeys = new Map(active.map((a) => [a.key, a.state]));
  const rows = await db.getAllAsync<{
    id: number;
    podcast_id: number;
    guid: string;
    local_path: string | null;
    download_status: string | null;
  }>(
    `SELECT e.id, e.podcast_id, e.guid, s.local_path, s.download_status FROM episode e
     JOIN episode_state s ON s.episode_id = e.id
     WHERE s.local_path IS NOT NULL OR s.download_status IS NOT NULL`,
  );
  const known = new Set<string>();
  for (const row of rows) {
    const key = keyFor(row);
    known.add(key);
    const uri = byKey.get(key) ?? null;
    const status = uri
      ? 'done'
      : (activeKeys.get(key) ?? (row.download_status === 'failed' ? 'failed' : null));
    if (uri !== row.local_path || status !== row.download_status) {
      await setDownloadState(db, row.id, status, uri);
    }
  }
  for (const [key, uri] of byKey) {
    if (known.has(key)) continue;
    const episode = await episodeForKey(db, key);
    if (episode) await setDownloadState(db, episode.id, 'done', uri);
  }
  for (const [key, state] of activeKeys) {
    if (known.has(key)) continue;
    const episode = await episodeForKey(db, key);
    if (episode) await setDownloadState(db, episode.id, state, null);
  }
}

/** Downloads the newest new episodes of podcasts with auto-download on. */
export async function autoDownloadNew(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  const settings = await getSettings(db);
  const podcasts = await db.getAllAsync<{ id: number; new_since: number; n: number | null }>(
    `SELECT p.id, p.new_since, ps.auto_download_n AS n FROM podcast p
     LEFT JOIN podcast_settings ps ON ps.podcast_id = p.id WHERE p.subscribed = 1`,
  );
  for (const p of podcasts) {
    const n = p.n ?? settings.autoDownload;
    if (n <= 0) continue;
    const candidates = await db.getAllAsync<{ id: number }>(
      `SELECT e.id FROM episode e LEFT JOIN episode_state s ON s.episode_id = e.id
       WHERE e.podcast_id = ? AND COALESCE(e.pub_date, 0) >= ?
         AND COALESCE(s.played, 0) = 0 AND COALESCE(s.archived, 0) = 0
       ORDER BY e.pub_date DESC LIMIT ?`,
      p.id,
      p.new_since,
      n,
    );
    for (const c of candidates) {
      const state = await db.getFirstAsync<{ download_status: string | null }>(
        'SELECT download_status FROM episode_state WHERE episode_id = ?',
        c.id,
      );
      if (!state?.download_status) await downloadEpisode(db, c.id, { automatic: true });
    }
  }
}

/** Removes played downloads, oldest first, until the total fits the storage limit. */
export async function enforceStorageCap(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  const { storageCapGb } = await getSettings(db);
  if (storageCapGb <= 0) return;
  const files = PlayerCore.listDownloads();
  let total = files.reduce((sum, f) => sum + f.bytes, 0);
  const cap = storageCapGb * 1024 ** 3;
  if (total <= cap) return;
  const bytes = new Map(files.map((f) => [f.uri, f.bytes]));
  const played = await db.getAllAsync<{ episode_id: number; local_path: string }>(
    `SELECT episode_id, local_path FROM episode_state
     WHERE local_path IS NOT NULL AND played = 1 ORDER BY played_at`,
  );
  for (const row of played) {
    if (total <= cap) break;
    total -= bytes.get(row.local_path) ?? 0;
    await removeDownload(db, row.episode_id);
  }
}

/** Total size of downloaded episodes, in bytes. */
export function downloadedBytes(): number {
  return PlayerCore?.listDownloads().reduce((sum, f) => sum + f.bytes, 0) ?? 0;
}

export async function removePlayedDownloads(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ episode_id: number }>(
    'SELECT episode_id FROM episode_state WHERE local_path IS NOT NULL AND played = 1',
  );
  for (const r of rows) await removeDownload(db, r.episode_id);
  return rows.length;
}
