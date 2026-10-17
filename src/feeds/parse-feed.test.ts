import { absolute, parseFeed } from './parse-feed';

// A made-up show, with the quirks real feeds have: CDATA, entities, a relative image link,
// itunes and Podcasting 2.0 tags, a duplicate guid and an item with no audio.
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Low Tide Radio</title>
    <link>https://lowtide.example/</link>
    <description><![CDATA[Stories from the <b>coast</b>.]]></description>
    <itunes:author>Harbour &amp; Pier Collective</itunes:author>
    <itunes:image href="/art/cover.jpg"/>
    <item>
      <title>The lighthouse keeper&#8217;s log</title>
      <guid isPermaLink="false">ep-42</guid>
      <pubDate>Wed, 14 Oct 2026 10:00:00 +0200</pubDate>
      <itunes:duration>42:05</itunes:duration>
      <enclosure url="https://cdn.example/ep42.mp3" type="audio/mpeg" length="40400000"/>
      <content:encoded><![CDATA[<p>Notes</p>]]></content:encoded>
      <podcast:transcript url="https://cdn.example/ep42.html" type="text/html"/>
      <podcast:transcript url="https://cdn.example/ep42.vtt" type="text/vtt"/>
      <podcast:chapters url="https://cdn.example/ep42.json" type="application/json+chapters"/>
      <itunes:season>2</itunes:season>
      <itunes:episode>7</itunes:episode>
    </item>
    <item>
      <title>Same guid again</title>
      <guid>ep-42</guid>
      <enclosure url="https://cdn.example/dupe.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <title>Trailer video</title>
      <pubDate>2 Oct 2026 08:30 EST</pubDate>
      <itunes:duration>95</itunes:duration>
      <enclosure url="https://cdn.example/trailer.mp4" type="video/mp4" length="0"/>
    </item>
    <item>
      <title>Text-only post</title>
      <guid>post-1</guid>
    </item>
  </channel>
</rss>`;

describe('parseFeed', () => {
  const feed = parseFeed(FEED, 'https://lowtide.example/feed.xml');

  it('reads the show', () => {
    expect(feed).toMatchObject({
      title: 'Low Tide Radio',
      author: 'Harbour & Pier Collective',
      artworkUrl: 'https://lowtide.example/art/cover.jpg',
      website: 'https://lowtide.example/',
    });
    expect(feed.description).toContain('coast');
  });

  it('keeps playable, unique episodes only', () => {
    expect(feed.episodes.map((e) => e.title)).toEqual([
      'The lighthouse keeper’s log',
      'Trailer video',
    ]);
  });

  it('reads episode details', () => {
    expect(feed.episodes[0]).toMatchObject({
      guid: 'ep-42',
      pubDate: Date.UTC(2026, 9, 14, 8, 0, 0),
      durationS: 2525,
      enclosureUrl: 'https://cdn.example/ep42.mp3',
      sizeBytes: 40400000,
      mediaType: 'audio',
      transcriptUrl: 'https://cdn.example/ep42.vtt',
      transcriptType: 'text/vtt',
      chaptersUrl: 'https://cdn.example/ep42.json',
      season: 2,
      number: 7,
    });
  });

  it('falls back to the enclosure URL for a missing guid and spots video', () => {
    expect(feed.episodes[1]).toMatchObject({
      guid: 'https://cdn.example/trailer.mp4',
      mediaType: 'video',
      sizeBytes: null,
      pubDate: Date.UTC(2026, 9, 2, 13, 30, 0),
    });
  });

  it('rejects things that are not feeds', () => {
    expect(() => parseFeed('<html><body>Hello</body></html>', 'https://x.example')).toThrow(
      /podcast feed/,
    );
  });
});

describe('absolute', () => {
  it.each([
    ['https://a.example/x.mp3', 'https://a.example/x.mp3'],
    ['//cdn.example/x.mp3', 'https://cdn.example/x.mp3'],
    ['/x.mp3', 'https://feeds.example/x.mp3'],
    ['x.mp3', 'https://feeds.example/show/x.mp3'],
    ['mailto:a@example.com', null],
  ])('%s', (url, expected) => {
    expect(absolute(url, 'https://feeds.example/show/feed.xml?x=1')).toBe(expected);
  });
});
