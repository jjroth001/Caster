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
  episodes: ParsedEpisode[];
};

export class FeedError extends Error {}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'podcast:transcript', 'link', 'enclosure'].includes(name),
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
    episodes,
  };
}
