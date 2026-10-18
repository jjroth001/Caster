import type { SQLiteDatabase } from 'expo-sqlite';

import {
  findPodcastByFeed,
  followPodcast,
  markRefreshed,
  savePodcast,
  type PodcastRow,
} from '@/db/library';
import { setSetting } from '@/db/settings';
import { fetchWithTimeout } from '@/lib/http';

import { basicAuth, getFeedLogin, splitLogin } from './credentials';
import { FeedAuthError, FeedError, parseFeed, type ParsedFeed } from './parse-feed';
import { rememberFeedLogin } from './private';

const USER_AGENT = 'Caster/1.0 (Android; open-source podcast player)';

type FetchResult =
  | { status: 'unchanged' }
  | { status: 'ok'; feed: ParsedFeed; etag: string | null; lastModified: string | null };

/** Downloads and parses a feed; with a cached ETag/Last-Modified, unchanged feeds cost one small request. */
export async function fetchFeed(
  url: string,
  cache?: { etag: string | null; lastModified: string | null },
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  };
  if (cache?.etag) headers['If-None-Match'] = cache.etag;
  if (cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
  const login = await getFeedLogin(url);
  if (login) headers.Authorization = basicAuth(login);
  let response: Response;
  try {
    // Feeds can be large, so a longer limit than searches get.
    response = await fetchWithTimeout(url, { headers }, 45_000);
  } catch {
    throw new FeedError('Couldn’t reach this podcast. Check your connection.');
  }
  if (response.status === 304) return { status: 'unchanged' };
  if (response.status === 401 || response.status === 403) throw new FeedAuthError();
  if (response.status === 404 || response.status === 410) {
    throw new FeedError('This podcast’s feed is gone (the address no longer works).');
  }
  if (!response.ok) throw new FeedError(`The podcast’s server answered ${response.status}.`);
  const xml = await response.text();
  return {
    status: 'ok',
    feed: parseFeed(xml, url),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

/**
 * Loads a podcast into the library without following it, so it can be browsed and played
 * before deciding. Returns its id (an existing one if it's already there).
 */
export async function openFeed(db: SQLiteDatabase, address: string): Promise<number> {
  // A sign-in written into the address is kept encrypted, not in the saved address.
  const { url, login } = splitLogin(address);
  if (login) await rememberFeedLogin(db, url, login);
  const existing = await findPodcastByFeed(db, url);
  if (existing) return existing.id;
  const result = await fetchFeed(url);
  if (result.status !== 'ok') throw new FeedError('This address didn’t return a podcast feed.');
  // A feed that has moved is stored under its new address.
  const target = result.feed.newFeedUrl ?? url;
  const moved = target !== url ? await findPodcastByFeed(db, target) : null;
  if (moved) return moved.id;
  return savePodcast(db, target, result.feed, result, false);
}

/** Follows a podcast by its feed address. Returns the podcast id. */
export async function subscribeToFeed(db: SQLiteDatabase, url: string): Promise<number> {
  const id = await openFeed(db, url);
  await followPodcast(db, id);
  return id;
}

async function refreshOne(db: SQLiteDatabase, podcast: PodcastRow): Promise<boolean> {
  try {
    const result = await fetchFeed(podcast.feed_url, {
      etag: podcast.etag,
      lastModified: podcast.last_modified,
    });
    if (result.status === 'unchanged') {
      await markRefreshed(db, podcast.id, null);
      return true;
    }
    await savePodcast(db, podcast.feed_url, result.feed, result, false);
    return true;
  } catch (e) {
    await markRefreshed(db, podcast.id, e instanceof Error ? e.message : 'Refresh failed');
    return false;
  }
}

let running: Promise<{ updated: number; failed: number }> | null = null;

/** Checks every followed podcast for new episodes, a few at a time. Concurrent calls share one run. */
export function refreshAll(db: SQLiteDatabase): Promise<{ updated: number; failed: number }> {
  running ??= (async () => {
    const podcasts = await db.getAllAsync<PodcastRow>('SELECT * FROM podcast WHERE subscribed = 1');
    let next = 0;
    let failed = 0;
    const worker = async () => {
      while (next < podcasts.length) {
        const podcast = podcasts[next++];
        if (!(await refreshOne(db, podcast))) failed++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, podcasts.length) }, worker));
    await setSetting(db, 'lastRefreshAt', Date.now());
    return { updated: podcasts.length - failed, failed };
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function refreshPodcast(db: SQLiteDatabase, podcastId: number) {
  const podcast = await db.getFirstAsync<PodcastRow>(
    'SELECT * FROM podcast WHERE id = ?',
    podcastId,
  );
  if (podcast) await refreshOne(db, podcast);
}
