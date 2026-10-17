import { Share } from 'react-native';

import type { EpisodeItem } from '@/db/library';

/**
 * Sharing uses the publisher's own links (episode page, else the audio file), never a
 * short-link service, so nothing passes through a third party.
 */

const episodeLink = (e: Pick<EpisodeItem, 'link' | 'enclosure_url'>) => e.link ?? e.enclosure_url;

/** The episode link with a `t=` timestamp in whole seconds (players that support it jump there). */
export function shareAtLink(
  e: Pick<EpisodeItem, 'link' | 'enclosure_url'>,
  seconds: number,
): string {
  const url = episodeLink(e);
  const t = Math.max(0, Math.floor(seconds));
  const [base, hash] = url.split('#');
  const joined = `${base}${base.includes('?') ? '&' : '?'}t=${t}`;
  return hash ? `${joined}#${hash}` : joined;
}

export function shareEpisode(e: EpisodeItem) {
  void Share.share({ message: `${e.title} (${e.podcast_title})\n${episodeLink(e)}` });
}

export function shareEpisodeAt(e: EpisodeItem, seconds: number, label: string) {
  void Share.share({
    message: `${e.title} (${e.podcast_title}), from ${label}\n${shareAtLink(e, seconds)}`,
  });
}

export function sharePodcast(p: { title: string; website: string | null; feed_url: string }) {
  void Share.share({ message: `${p.title}\n${p.website ?? p.feed_url}` });
}
