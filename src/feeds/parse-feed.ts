import { XMLParser } from 'fast-xml-parser';

import { decodeEntities, parseDate, parseDuration } from './text';

export type ParsedEpisode = {
  /** Feed guid, or the enclosure URL when a feed has none. */
  guid: string;
  title: string;
  description: string | null;
  link: string | null;
  pubDate: number | null;
  durationS: number | null;
  enclosureUrl: string;
  mime: string | null;
  sizeBytes: number | null;
  mediaType: 'audio' | 'video';
  artworkUrl: string | null;
  transcriptUrl: string | null;
  transcriptType: string | null;
  chaptersUrl: string | null;
  season: number | null;
  number: number | null;
  episodeType: string | null;
};

export type ParsedFeed = {
  title: string;
  author: string | null;
  description: string | null;
  artworkUrl: string | null;
  website: string | null;
  /** The feed's own new address (itunes:new-feed-url), when it has moved. */
  newFeedUrl: string | null;
  /** Apple's categories the show lists (itunes:category), subcategories included. */
  categories: string[];
  /** Other shows this one recommends (podcast:podroll). */
  podroll: PodrollItem[];
  episodes: ParsedEpisode[];
};

/** A recommended show: its Podcasting 2.0 guid and/or its feed address. */
export type PodrollItem = { feedGuid: string | null; feedUrl: string | null };

export class FeedError extends Error {}

export const NEEDS_LOGIN = 'This feed is private and needs a username and password.';

/** The feed answered 401/403: it needs a sign-in (or the saved one is wrong). */
export class FeedAuthError extends FeedError {
  constructor() {
    super(NEEDS_LOGIN);
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) =>
    [
      'item',
      'entry',
      'podcast:transcript',
      'link',
      'enclosure',
      'itunes:category',
      'podcast:remoteItem',
    ].includes(name),
});

type Node = Record<string, unknown>;

/** Text content of an element that may be a string, a number or {#text, @_attr}. */
function text(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object') return text((value as Node)['#text']);
  const s = decodeEntities(String(value)).trim();
  return s || null;
}

function attr(value: unknown, name: string): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return attr(value[0], name);
  if (typeof value !== 'object') return null;
  const v = (value as Node)[`@_${name}`];
  return v == null ? null : String(v).trim() || null;
}

function int(value: unknown): number | null {
  const s = text(value);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Prefer a transcript format we can show, in this order. */
const TRANSCRIPT_ORDER = [
  'text/vtt',
  'application/x-subrip',
  'application/srt',
  'application/json',
  'text/html',
];

function pickTranscript(value: unknown): { url: string; type: string } | null {
  if (!Array.isArray(value)) return null;
  const options = value
    .map((t) => ({ url: attr(t, 'url'), type: (attr(t, 'type') ?? '').toLowerCase() }))
    .filter((t): t is { url: string; type: string } => !!t.url);
  options.sort((a, b) => rank(a.type) - rank(b.type));
  return options[0] ?? null;
}
const rank = (type: string) => {
  const i = TRANSCRIPT_ORDER.indexOf(type);
  return i === -1 ? TRANSCRIPT_ORDER.length : i;
};

/** Resolves the relative links some feeds use (React Native's URL can't resolve against a base). */
export function absolute(url: string | null, base: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const origin = /^(https?:)\/\/[^/?#]+/i.exec(base);
  if (!origin) return null;
  if (url.startsWith('//')) return origin[1] + url;
  if (url.startsWith('/')) return origin[0] + url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null; // another scheme (mailto:, data:)
  const dir = base.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '/');
  return dir + url;
}

function mediaTypeOf(mime: string | null, url: string): 'audio' | 'video' {
  if (mime?.startsWith('video/')) return 'video';
  if (!mime && /\.(mp4|m4v|mov|webm)(\?|$)/i.test(url)) return 'video';
  return 'audio';
}

/** Every category name, nested ones too ("Education", then "Language Learning"). */
function categoriesIn(value: unknown, out: string[] = []): string[] {
  if (!Array.isArray(value)) return out;
  for (const c of value) {
    const name = attr(c, 'text');
    if (name && !out.includes(name)) out.push(name);
    if (c && typeof c === 'object') categoriesIn((c as Node)['itunes:category'], out);
  }
  return out;
}

function podrollIn(value: unknown, feedUrl: string): PodrollItem[] {
  const roll = Array.isArray(value) ? value[0] : value;
  const items = roll && typeof roll === 'object' ? (roll as Node)['podcast:remoteItem'] : null;
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => !attr(i, 'medium') || attr(i, 'medium') === 'podcast')
    .map((i) => ({ feedGuid: attr(i, 'feedGuid'), feedUrl: absolute(attr(i, 'feedUrl'), feedUrl) }))
    .filter((i) => i.feedGuid || i.feedUrl);
}

/** Parses an RSS 2.0 podcast feed (iTunes and Podcasting 2.0 tags included). */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new FeedError('This address didn’t return a podcast feed.');
  }
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined;
  if (!channel) throw new FeedError('This address didn’t return a podcast feed.');

  const channelImage =
    attr(channel['itunes:image'], 'href') ?? text((channel.image as Node | undefined)?.url);
  const channelLink = (channel.link as unknown[] | undefined)?.map(text).find(Boolean) ?? null;

  const episodes: ParsedEpisode[] = [];
  const seen = new Set<string>();
  for (const item of (channel.item as Node[] | undefined) ?? []) {
    const enclosure = (item.enclosure as Node[] | undefined)?.[0];
    const enclosureUrl = absolute(attr(enclosure, 'url'), feedUrl);
    if (!enclosureUrl) continue; // not playable
    const guid = text(item.guid) ?? enclosureUrl;
    if (seen.has(guid)) continue;
    seen.add(guid);
    const mime = attr(enclosure, 'type');
    const size = Number(attr(enclosure, 'length'));
    const transcript = pickTranscript(item['podcast:transcript']);
    episodes.push({
      guid,
      title: text(item.title) ?? text(item['itunes:title']) ?? 'Untitled episode',
      description:
        text(item['content:encoded']) ?? text(item.description) ?? text(item['itunes:summary']),
      link: (item.link as unknown[] | undefined)?.map(text).find(Boolean) ?? null,
      pubDate: parseDate(text(item.pubDate)),
      durationS: parseDuration(text(item['itunes:duration'])),
      enclosureUrl,
      mime,
      sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
      mediaType: mediaTypeOf(mime, enclosureUrl),
      artworkUrl: absolute(attr(item['itunes:image'], 'href'), feedUrl),
      transcriptUrl: transcript ? absolute(transcript.url, feedUrl) : null,
      transcriptType: transcript?.type || null,
      chaptersUrl: absolute(attr(item['podcast:chapters'], 'url'), feedUrl),
      season: int(item['itunes:season']),
      number: int(item['itunes:episode']),
      episodeType: text(item['itunes:episodeType']),
    });
  }

  return {
    title: text(channel.title) ?? text(channel['itunes:title']) ?? 'Untitled podcast',
    author: text(channel['itunes:author']) ?? text(channel.managingEditor),
    description: text(channel.description) ?? text(channel['itunes:summary']),
    artworkUrl: absolute(channelImage, feedUrl),
    website: channelLink,
    newFeedUrl: absolute(text(channel['itunes:new-feed-url']), feedUrl),
    categories: categoriesIn(channel['itunes:category']),
    podroll: podrollIn(channel['podcast:podroll'], feedUrl),
    episodes,
  };
}

/** Episodes read per step by parseFeedInSteps. */
const ITEMS_PER_STEP = 150;

/**
 * Parses a feed a batch of episodes at a time, pausing (`pause`) between batches so a huge
 * feed (thousands of episodes) doesn't hold up the screen for seconds. Same result as
 * parseFeed; a feed it can't split cleanly is parsed in one go instead.
 */
export async function parseFeedInSteps(
  xml: string,
  feedUrl: string,
  pause: () => Promise<void>,
): Promise<ParsedFeed> {
  const first = xml.indexOf('<item');
  if (first === -1) return parseFeed(xml, feedUrl);
  const show = parseFeed(`${xml.slice(0, first)}</channel></rss>`, feedUrl);
  try {
    const episodes: ParsedEpisode[] = [];
    const seen = new Set<string>();
    let at = first;
    while (at !== -1) {
      let end = at;
      for (let i = 0; i < ITEMS_PER_STEP; i++) {
        const close = xml.indexOf('</item>', end);
        if (close === -1) break;
        end = close + '</item>'.length;
      }
      if (end === at) break;
      await pause();
      const part = parseFeed(`<rss><channel>${xml.slice(at, end)}</channel></rss>`, feedUrl);
      for (const e of part.episodes) {
        if (seen.has(e.guid)) continue;
        seen.add(e.guid);
        episodes.push(e);
      }
      at = xml.indexOf('<item', end);
    }
    return { ...show, episodes };
  } catch {
    return parseFeed(xml, feedUrl);
  }
}
