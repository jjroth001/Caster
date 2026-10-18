import * as SecureStore from 'expo-secure-store';

import { PlayerCore } from '@modules/player-core/src';

/**
 * Usernames and passwords for private feeds, kept in Android's encrypted storage (never in the
 * database, backups or exports). They're sent only to the host they belong to: the feed's, and
 * the hosts its episodes come from.
 */

export type FeedLogin = { username: string; password: string };

/** SecureStore keys may only use letters, digits, ".", "-" and "_". */
function keyFor(feedUrl: string): string {
  let h = 5381;
  for (let i = 0; i < feedUrl.length; i++) h = ((h << 5) + h + feedUrl.charCodeAt(i)) | 0;
  return `feed-login-${(h >>> 0).toString(36)}`;
}

export function hostOf(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/**
 * The site a host belongs to ("feeds.example.org" → "example.org", "a.example.co.uk" →
 * "example.co.uk"), to keep a sign-in on its own site.
 */
export function siteOf(host: string): string {
  const labels = host.toLowerCase().split('.');
  // Two-letter country endings with a short second level ("co.uk", "com.au") take three.
  const three =
    labels.length >= 3 &&
    labels[labels.length - 1].length === 2 &&
    labels[labels.length - 2].length <= 3;
  return labels.slice(three ? -3 : -2).join('.');
}

/** Whether an address is on the same site as a feed (so its sign-in may go there). */
export function sameSite(feedUrl: string, url: string): boolean {
  const a = hostOf(feedUrl);
  const b = hostOf(url);
  return !!a && !!b && siteOf(a) === siteOf(b);
}

/**
 * Splits a login written into the address ("https://name:secret@host/feed") from the address
 * itself, since fetch() and media players don't accept it there.
 */
export function splitLogin(url: string): { url: string; login: FeedLogin | null } {
  const m = /^([a-z][a-z0-9+.-]*:\/\/)([^@/?#]*)@(.*)$/i.exec(url);
  if (!m) return { url, login: null };
  const [user, ...rest] = m[2].split(':');
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return {
    url: m[1] + m[3],
    login: { username: decode(user), password: decode(rest.join(':')) },
  };
}

/** The Basic authorization header for a login. */
export function basicAuth({ username, password }: FeedLogin): string {
  // btoa needs Latin-1; encode UTF-8 first so any character works.
  const bytes = unescape(encodeURIComponent(`${username}:${password}`));
  return `Basic ${btoa(bytes)}`;
}

const cache = new Map<string, FeedLogin | null>();

export async function getFeedLogin(feedUrl: string): Promise<FeedLogin | null> {
  if (cache.has(feedUrl)) return cache.get(feedUrl) ?? null;
  let login: FeedLogin | null = null;
  try {
    const raw = await SecureStore.getItemAsync(keyFor(feedUrl));
    login = raw ? (JSON.parse(raw) as FeedLogin) : null;
  } catch {
    login = null;
  }
  cache.set(feedUrl, login);
  return login;
}

export async function saveFeedLogin(feedUrl: string, login: FeedLogin) {
  await SecureStore.setItemAsync(keyFor(feedUrl), JSON.stringify(login));
  cache.set(feedUrl, login);
  shareWithPlayer([feedUrl], login);
}

export async function forgetFeedLogin(feedUrl: string) {
  await SecureStore.deleteItemAsync(keyFor(feedUrl)).catch(() => {});
  cache.set(feedUrl, null);
}

/** Lets the native player and downloader sign in to these hosts (kept in memory only). */
export function shareWithPlayer(urls: string[], login: FeedLogin) {
  const header = basicAuth(login);
  for (const url of urls) {
    const host = hostOf(url);
    if (host) PlayerCore?.setHostAuthorization(host, header);
  }
}
