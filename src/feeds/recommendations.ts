import type { SQLiteDatabase } from 'expo-sqlite';

import type { DirectoryPodcast } from './apple';
import type { PodrollItem } from './parse-feed';
import { podcastIndexByGuid } from './podcast-index';
import { fetchShowInfo } from './sync';

/**
 * "Recommended by your shows": podcasts that the shows you follow recommend in their own feeds
 * (podcast:podroll). Nothing about you is sent anywhere; recommended shows are looked up by
 * reading the start of their feeds, or through Podcast Index when only their guid is given
 * (only with your key). What a show is called is kept for two weeks.
 */

export type Recommendation = DirectoryPodcast & { pickedBy: string[] };

const KEEP_MS = 14 * 86_400_000;
/** The most shows looked up in one go, so a long list doesn't download dozens of feeds. */
const MAX_LOOKUPS = 24;

/** Feed addresses compare without http(s):// or a trailing slash, and in any case. */
export function feedKey(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

type Pick = { item: PodrollItem; key: string; pickedBy: string[] };

/** Each recommended show once, with who recommends it, most-recommended first. */
export function collectPicks(
  shows: { title: string; feed_url: string; podroll_json: string | null }[],
): Pick[] {
  const followed = new Set(shows.map((s) => feedKey(s.feed_url)));
  const picks = new Map<string, Pick>();
  for (const show of shows) {
    let items: PodrollItem[] = [];
    try {
      items = JSON.parse(show.podroll_json ?? '[]') as PodrollItem[];
    } catch {
      continue;
    }
    for (const item of items) {
      const key = item.feedUrl ? feedKey(item.feedUrl) : `guid:${item.feedGuid}`;
      if (followed.has(key)) continue;
      const pick = picks.get(key) ?? { item, key, pickedBy: [] };
      if (!pick.pickedBy.includes(show.title)) pick.pickedBy.push(show.title);
      picks.set(key, pick);
    }
  }
  return [...picks.values()].sort((a, b) => b.pickedBy.length - a.pickedBy.length);
}

type Known = {
  key: string;
  feed_url: string | null;
  title: string | null;
  author: string | null;
  artwork_url: string | null;
  checked_at: number;
};

async function lookUp(db: SQLiteDatabase, pick: Pick): Promise<Known> {
  let found: Omit<Known, 'key' | 'checked_at'> = {
    feed_url: null,
    title: null,
    author: null,
    artwork_url: null,
  };
  if (pick.item.feedUrl) {
    const info = await fetchShowInfo(pick.item.feedUrl);
    if (info) {
      found = {
        feed_url: pick.item.feedUrl,
        title: info.title,
        author: info.author,
        artwork_url: info.artworkUrl,
      };
    }
  } else if (pick.item.feedGuid) {
    const show = await podcastIndexByGuid(pick.item.feedGuid).catch(() => null);
    if (show) {
      found = {
        feed_url: show.feedUrl,
        title: show.title,
        author: show.author,
        artwork_url: show.artworkUrl,
      };
    }
  }
  const known = { key: pick.key, ...found, checked_at: Date.now() };
  await db.runAsync(
    `INSERT OR REPLACE INTO podroll_show (key, feed_url, title, author, artwork_url, checked_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    known.key,
    known.feed_url,
    known.title,
    known.author,
    known.artwork_url,
    known.checked_at,
  );
  return known;
}

/** The shows your podcasts recommend that you don't follow yet, looked up where needed. */
export async function recommendedShows(db: SQLiteDatabase): Promise<Recommendation[]> {
  const shows = await db.getAllAsync<{
    title: string;
    feed_url: string;
    podroll_json: string | null;
  }>('SELECT title, feed_url, podroll_json FROM podcast WHERE subscribed = 1');
  const followed = new Set(shows.map((s) => feedKey(s.feed_url)));
  const picks = collectPicks(shows);
  if (picks.length === 0) return [];

  const known = new Map(
    (await db.getAllAsync<Known>('SELECT * FROM podroll_show')).map((k) => [k.key, k]),
  );
  const stale = picks
    .filter((p) => {
      const k = known.get(p.key);
      return !k || Date.now() - k.checked_at > KEEP_MS;
    })
    .slice(0, MAX_LOOKUPS);
  // A few at a time, so the rest of the app keeps its connection.
  let next = 0;
  const worker = async () => {
    while (next < stale.length) {
      const pick = stale[next++];
      known.set(pick.key, await lookUp(db, pick));
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const pick of picks) {
    const k = known.get(pick.key);
    if (!k?.title || !k.feed_url) continue;
    const fk = feedKey(k.feed_url);
    if (followed.has(fk) || seen.has(fk)) continue;
    seen.add(fk);
    out.push({
      appleId: `rec:${fk}`,
      title: k.title,
      author: k.author ?? '',
      artworkUrl: k.artwork_url,
      feedUrl: k.feed_url,
      pickedBy: pick.pickedBy,
    });
  }
  return out;
}
