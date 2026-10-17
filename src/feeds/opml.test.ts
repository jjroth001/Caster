import { classifyQuery } from './apple';
import { parseOpml, toOpml } from './opml';

const OPML = `<?xml version="1.0"?>
<opml version="1.0">
  <head><title>Exported</title></head>
  <body>
    <outline text="Science">
      <outline type="rss" text="Orbit Hours" xmlUrl="https://orbit.example/feed" />
      <outline type="rss" title="Quiet &amp; Machines" text="QM" xmlUrl="https://qm.example/rss" />
    </outline>
    <outline type="rss" text="Orbit again" xmlUrl="https://orbit.example/feed" />
    <outline type="rss" text="Not a web feed" xmlUrl="file:///sdcard/x.xml" />
  </body>
</opml>`;

describe('OPML', () => {
  it('finds feeds in folders, once each', () => {
    expect(parseOpml(OPML)).toEqual([
      { title: 'Orbit Hours', feedUrl: 'https://orbit.example/feed' },
      { title: 'Quiet & Machines', feedUrl: 'https://qm.example/rss' },
    ]);
  });

  it('round-trips an export', () => {
    const feeds = [
      { title: 'Low Tide <Radio> & "Friends"', feedUrl: 'https://lt.example/?a=1&b=2' },
    ];
    expect(parseOpml(toOpml(feeds))).toEqual(feeds);
  });

  it('rejects other files', () => {
    expect(() => parseOpml('{"json": true}')).toThrow(/OPML/);
  });
});

describe('classifyQuery', () => {
  it.each([
    ['history podcasts', { kind: 'search', term: 'history podcasts' }],
    ['https://feeds.example/show.xml', { kind: 'url', url: 'https://feeds.example/show.xml' }],
    ['feed://feeds.example/show.xml', { kind: 'url', url: 'https://feeds.example/show.xml' }],
    ['feeds.example/show.xml', { kind: 'url', url: 'https://feeds.example/show.xml' }],
    [
      'https://podcasts.apple.com/us/podcast/some-show/id1234567890?i=1',
      { kind: 'apple', id: '1234567890' },
    ],
  ])('%s', (input, expected) => {
    expect(classifyQuery(input)).toEqual(expected);
  });
});
