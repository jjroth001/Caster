import * as SecureStore from 'expo-secure-store';

import { fetchWithTimeout } from '@/lib/http';

import type { DirectoryPodcast } from './apple';

/**
 * Podcast Index (podcastindex.org), the open podcast directory: search and trending shows,
 * only when you've added your own free API key. The key and secret stay in Android's encrypted
 * storage; requests go straight from the phone to Podcast Index.
 */

const API = 'https://api.podcastindex.org/api/1.0';
const USER_AGENT = 'PodWizard/1.0 (Android; open-source podcast player)';
const KEY = 'podcastindex-key';
const SECRET = 'podcastindex-secret';

export type PodcastIndexLogin = { key: string; secret: string };

/** SHA-1 of a UTF-8 string, as hex (Podcast Index signs each request with one). */
export function sha1Hex(text: string): string {
  const bytes = Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLength >>> (i * 8)) & 0xff);
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array<number>(80);
  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunk + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

/** The headers Podcast Index wants: the key, the time, and both signed with the secret. */
export function signedHeaders(login: PodcastIndexLogin, nowS = Math.floor(Date.now() / 1000)) {
  return {
    'User-Agent': USER_AGENT,
    'X-Auth-Key': login.key,
    'X-Auth-Date': String(nowS),
    Authorization: sha1Hex(login.key + login.secret + nowS),
  };
}

export async function getPodcastIndexLogin(): Promise<PodcastIndexLogin | null> {
  try {
    const [key, secret] = await Promise.all([
      SecureStore.getItemAsync(KEY),
      SecureStore.getItemAsync(SECRET),
    ]);
    return key && secret ? { key, secret } : null;
  } catch {
    return null;
  }
}

/** Saves the key after checking it works (throws with a reason if it doesn't). */
export async function savePodcastIndexLogin(login: PodcastIndexLogin) {
  const response = await fetchWithTimeout(`${API}/stats/current`, {
    headers: signedHeaders(login),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Podcast Index didn’t accept that key and secret.');
  }
  if (!response.ok) throw new Error(`Podcast Index answered ${response.status}.`);
  await SecureStore.setItemAsync(KEY, login.key);
  await SecureStore.setItemAsync(SECRET, login.secret);
}

export async function forgetPodcastIndexLogin() {
  await Promise.all([SecureStore.deleteItemAsync(KEY), SecureStore.deleteItemAsync(SECRET)]);
}

type Feed = {
  id: number;
  title?: string;
  author?: string;
  ownerName?: string;
  image?: string;
  artwork?: string;
  url?: string;
};

const toPodcast = (f: Feed): DirectoryPodcast | null =>
  f.url && f.title
    ? {
        appleId: `pi${f.id}`,
        source: 'podcastindex',
        title: f.title,
        author: f.author || f.ownerName || '',
        artworkUrl: f.artwork || f.image || null,
        feedUrl: f.url,
      }
    : null;

async function get(path: string): Promise<Feed[]> {
  const login = await getPodcastIndexLogin();
  if (!login) return [];
  const response = await fetchWithTimeout(
    `${API}${path}`,
    { headers: signedHeaders(login) },
    15_000,
    'Podcast Index didn’t answer. Try again in a moment.',
  );
  if (!response.ok) throw new Error(`Podcast Index answered ${response.status}.`);
  const data = (await response.json()) as { feeds?: Feed[] };
  return data.feeds ?? [];
}

export async function searchPodcastIndex(term: string): Promise<DirectoryPodcast[]> {
  const feeds = await get(`/search/byterm?max=40&q=${encodeURIComponent(term.trim())}`);
  return feeds.map(toPodcast).filter((p): p is DirectoryPodcast => !!p);
}

export async function trendingPodcastIndex(language: string): Promise<DirectoryPodcast[]> {
  const feeds = await get(`/podcasts/trending?max=50&lang=${encodeURIComponent(language)}`);
  return feeds.map(toPodcast).filter((p): p is DirectoryPodcast => !!p);
}

/** Apple's results first, then Podcast Index's that Apple didn't have. */
export function mergeResults(apple: DirectoryPodcast[], index: DirectoryPodcast[]) {
  const norm = (u: string | null) =>
    (u ?? '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
  const seenFeeds = new Set(apple.map((p) => norm(p.feedUrl)).filter(Boolean));
  const seenNames = new Set(apple.map((p) => `${p.title}|${p.author}`.toLowerCase()));
  return [
    ...apple,
    ...index.filter(
      (p) =>
        !seenFeeds.has(norm(p.feedUrl)) && !seenNames.has(`${p.title}|${p.author}`.toLowerCase()),
    ),
  ];
}
