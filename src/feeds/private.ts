import type { SQLiteDatabase } from 'expo-sqlite';

import { getSettings, setSetting } from '@/db/settings';

import {
  forgetFeedLogin,
  getFeedLogin,
  saveFeedLogin,
  shareWithPlayer,
  type FeedLogin,
} from './credentials';

/** Saves a private feed's sign-in and remembers that the feed is private. */
export async function rememberFeedLogin(db: SQLiteDatabase, feedUrl: string, login: FeedLogin) {
  await saveFeedLogin(feedUrl, login);
  const { privateFeeds } = await getSettings(db);
  if (!privateFeeds.includes(feedUrl)) {
    await setSetting(db, 'privateFeeds', [...privateFeeds, feedUrl]);
  }
}

export async function forgetPrivateFeed(db: SQLiteDatabase, feedUrl: string) {
  await forgetFeedLogin(feedUrl);
  const { privateFeeds } = await getSettings(db);
  await setSetting(
    db,
    'privateFeeds',
    privateFeeds.filter((u) => u !== feedUrl),
  );
}

/**
 * Hands the player and downloader the sign-ins they need: each private feed's own host and the
 * hosts its episodes are served from. Run when Caster opens and after feeds are checked.
 */
export async function syncPrivateLogins(db: SQLiteDatabase) {
  const { privateFeeds } = await getSettings(db);
  for (const feedUrl of privateFeeds) {
    const login = await getFeedLogin(feedUrl);
    if (!login) continue;
    const episodes = await db.getAllAsync<{ enclosure_url: string }>(
      `SELECT DISTINCT e.enclosure_url FROM episode e JOIN podcast p ON p.id = e.podcast_id
       WHERE p.feed_url = ? LIMIT 200`,
      feedUrl,
    );
    shareWithPlayer([feedUrl, ...episodes.map((e) => e.enclosure_url)], login);
  }
}
