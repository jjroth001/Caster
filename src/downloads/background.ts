import type { SQLiteDatabase } from 'expo-sqlite';
import { PermissionsAndroid, Platform } from 'react-native';

import { PlayerCore } from '@modules/player-core/src';
import { savePodcast } from '@/db/library';
import { getSettings } from '@/db/settings';
import { parseFeed } from '@/feeds/parse-feed';

/**
 * Hands the native background check a snapshot of what to look at: followed podcasts, their
 * cache headers and newest episode date, and the refresh/notify/auto-download settings.
 */
export async function writeBackgroundConfig(db: SQLiteDatabase) {
  if (!PlayerCore) return;
  const settings = await getSettings(db);
  const podcasts = await db.getAllAsync<{
    id: number;
    title: string;
    feed_url: string;
    etag: string | null;
    last_modified: string | null;
    latest_pub: number | null;
    notify: number | null;
    auto_n: number | null;
  }>(
    `SELECT p.id, p.title, p.feed_url, p.etag, p.last_modified,
       (SELECT MAX(pub_date) FROM episode WHERE podcast_id = p.id) AS latest_pub,
       ps.notify, ps.auto_download_n AS auto_n
     FROM podcast p LEFT JOIN podcast_settings ps ON ps.podcast_id = p.id
     WHERE p.subscribed = 1`,
  );
  PlayerCore.configureBackground(
    JSON.stringify({
      settings: {
        refreshHours: settings.refreshHours,
        wifiOnly: settings.downloadWifiOnly,
        chargingOnly: settings.downloadChargingOnly,
        storageNotLow: settings.downloadStorageNotLow,
      },
      podcasts: podcasts.map((p) => ({
        id: p.id,
        title: p.title,
        feedUrl: p.feed_url,
        etag: p.etag,
        lastModified: p.last_modified,
        latestPub: p.latest_pub ?? 0,
        notify: p.notify == null ? settings.notifyNewEpisodes : !!p.notify,
        private: settings.privateFeeds.includes(p.feed_url),
        autoDownload: settings.autoDownloadNew && p.auto_n ? settings.autoDownloadLimit : 0,
      })),
    }),
  );
}

/** Saves feeds the background check fetched while the app was closed. */
export async function processInbox(db: SQLiteDatabase): Promise<number> {
  if (!PlayerCore) return 0;
  const inbox = PlayerCore.readInbox();
  for (const item of inbox) {
    try {
      const podcast = await db.getFirstAsync<{ feed_url: string }>(
        'SELECT feed_url FROM podcast WHERE id = ?',
        item.podcastId,
      );
      if (podcast) {
        const feed = parseFeed(item.xml, podcast.feed_url);
        await savePodcast(db, podcast.feed_url, feed, item, false);
      }
    } catch {
      // A feed that won't parse is dropped; the next check fetches it again.
    }
    PlayerCore.clearInbox(item.podcastId);
  }
  return inbox.length;
}

/** Asks for permission to show notifications (Android 13+). Returns whether it's granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const result = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
