import { fetch as streamingFetch } from 'expo/fetch';
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

const USER_AGENT = 'PodWizard/1.0 (Android; open-source podcast player)';

/**
 * Lets the interface handle taps and scrolling before the next chunk of work: parsing a big
 * feed runs on the same thread as the screen.
 */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type FetchResult =
  | { status: 'unchanged' }
  | { status: 'ok'; feed: ParsedFeed; etag: string | null; lastModified: string | null };

/** What a feed request sends: who's asking, what it accepts, any sign-in and cache headers. */
async function feedHeaders(
  url: string,
  cache?: { etag: string | null; lastModified: string | null },
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  };
  if (cache?.etag) headers['If-None-Match'] = cache.etag;
  if (cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
  const login = await getFeedLogin(url);
  if (login) headers.Authorization = basicAuth(login);
  return headers;
}

/** Turns a feed server's refusal into the message to show. */
function checkFeedStatus(status: number, ok: boolean) {
  if (status === 401 || status === 403) throw new FeedAuthError();
  if (status === 404 || status === 410) {
    throw new FeedError('This podcast’s feed is gone (the address no longer works).');
  }
  if (!ok) throw new FeedError(`The podcast’s server answered ${status}.`);
}

/** Downloads and parses a feed; with a cached ETag/Last-Modified, unchanged feeds cost one small request. */
export async function fetchFeed(
  url: string,
  cache?: { etag: string | null; lastModified: string | null },
): Promise<FetchResult> {
  const headers = await feedHeaders(url, cache);
  let response: Response;
  try {
    // Feeds can be large, so a longer limit than searches get.
    response = await fetchWithTimeout(url, { headers }, 45_000);
  } catch {
    throw new FeedError('Couldn’t reach this podcast. Check your connection.');
  }
  if (response.status === 304) return { status: 'unchanged' };
  checkFeedStatus(response.status, response.ok);
  const xml = await response.text();
  await yieldToUi();
  return {
    status: 'ok',
    feed: parseFeed(xml, url),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

/**
 * A show's name, author and cover from its feed, without its episodes (only the part before
 * the first episode is read), for showing a podcast you don't follow. Null if it isn't a feed.
 */
export async function fetchShowInfo(
  url: string,
): Promise<{ title: string; author: string | null; artworkUrl: string | null } | null> {
  try {
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, 20_000);
    if (!response.ok) return null;
    const xml = await response.text();
    const head = xml.indexOf('<item');
    const feed = parseFeed(head === -1 ? xml : `${xml.slice(0, head)}</channel></rss>`, url);
    return { title: feed.title, author: feed.author, artworkUrl: feed.artworkUrl };
  } catch {
    return null;
  }
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
  opening++;
  let finished = false;
  const done = () => {
    if (!finished) opening--;
    finished = true;
  };
  try {
    return await streamNewFeed(db, url, done);
  } catch (e) {
    done();
    throw e;
  }
}

/** Episodes saved straight away when opening a show: enough to fill its page. */
const FIRST_EPISODES = 15;
/** A download that sends nothing for this long is given up. */
const STALLED_MS = 30_000;

/** The first `count` episodes of a feed that's still arriving, as a feed of its own, or null. */
export function firstEpisodes(xml: string, count: number): string | null {
  let end = 0;
  for (let i = 0; i < count; i++) {
    const at = xml.indexOf('</item>', end);
    if (at === -1) return null;
    end = at + '</item>'.length;
  }
  return `${xml.slice(0, end)}</channel></rss>`;
}

/**
 * Downloads a show you're opening for the first time, reading it as it arrives: once its newest
 * episodes are in, the show is saved and its id returned, so its page can show them; the rest
 * carry on loading and fill in below. `done` is called when the whole feed is in (or fails).
 */
async function streamNewFeed(db: SQLiteDatabase, url: string, done: () => void): Promise<number> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const keepAlive = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), STALLED_MS);
  };
  keepAlive();
  let response: Awaited<ReturnType<typeof streamingFetch>>;
  try {
    response = await streamingFetch(url, {
      headers: await feedHeaders(url),
      signal: controller.signal,
    });
    checkFeedStatus(response.status, response.ok);
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof FeedError) throw e;
    throw new FeedError('Couldn’t reach this podcast. Check your connection.');
  }
  const cache = {
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };

  // A feed that has moved is stored under its new address.
  let target: string | null = null;
  const save = async (feed: ParsedFeed, withCache: boolean) => {
    if (target == null) {
      target = feed.newFeedUrl ?? url;
      const moved = target !== url ? await findPodcastByFeed(db, target) : null;
      if (moved) return moved.id;
    }
    const empty = { etag: null, lastModified: null };
    return savePodcast(db, target, feed, withCache ? cache : empty, false);
  };

  return new Promise<number>((resolve, reject) => {
    let id: number | null = null;
    void (async () => {
      const reader = response.body?.getReader();
      let xml = '';
      if (reader) {
        const decoder = new TextDecoder();
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          keepAlive();
          xml += decoder.decode(value, { stream: true });
          const early = id == null ? firstEpisodes(xml, FIRST_EPISODES) : null;
          if (early) {
            // Saved without the cache headers, so a check before the rest is saved reads it all.
            id = await save(parseFeed(early, url), false);
            resolve(id);
          }
        }
        xml += decoder.decode();
      } else {
        xml = await response.text();
      }
      clearTimeout(timer);
      await yieldToUi();
      const saved = await save(parseFeed(xml, url), true);
      if (id == null) resolve(saved);
    })()
      .catch(async (e: unknown) => {
        clearTimeout(timer);
        const error =
          e instanceof FeedError
            ? e
            : new FeedError(
                controller.signal.aborted
                  ? 'This podcast stopped sending its feed. Try again in a moment.'
                  : 'This address didn’t return a podcast feed.',
              );
        // Once the page is showing, a failure later on is noted on the show instead.
        if (id == null) reject(error);
        else await markRefreshed(db, id, error.message).catch(() => {});
      })
      .finally(done);
  });
}

/**
 * Shows being opened right now. Background feed checks wait while there are any, so opening a
 * show never queues behind them.
 */
let opening = 0;

async function waitWhileOpening() {
  while (opening > 0) await new Promise((r) => setTimeout(r, 250));
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
        await waitWhileOpening();
        if (next >= podcasts.length) break;
        const podcast = podcasts[next++];
        if (!(await refreshOne(db, podcast))) failed++;
        await yieldToUi();
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
