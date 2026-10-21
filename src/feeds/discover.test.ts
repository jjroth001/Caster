import { categoriesForYou } from './categories';
import { collectPicks, feedKey } from './recommendations';

describe('categoriesForYou', () => {
  it('puts the categories your shows are in first', () => {
    const order = categoriesForYou([
      ['Comedy'],
      ['Education', 'Language Learning'],
      ['Education', 'Language Learning'],
      ['Society & Culture', 'Comedy'],
      ['Comedy'],
    ]).map((c) => c.title);
    expect(order.slice(0, 3)).toEqual(['Comedy', 'Language Learning', 'Society & Culture']);
    // Language Learning shows don't also push Education up.
    expect(order.indexOf('Education')).toBeGreaterThan(order.indexOf('News'));
  });

  it('keeps the usual order with nothing followed', () => {
    expect(categoriesForYou([])[0].title).toBe('Comedy');
  });
});

describe('collectPicks', () => {
  const roll = (...items: { feedGuid?: string; feedUrl?: string }[]) =>
    JSON.stringify(
      items.map((i) => ({ feedGuid: i.feedGuid ?? null, feedUrl: i.feedUrl ?? null })),
    );

  it('lists each recommended show once, most recommended first, skipping ones you follow', () => {
    const picks = collectPicks([
      {
        title: 'Low Tide Radio',
        feed_url: 'https://lowtide.example/feed.xml',
        podroll_json: roll({ feedUrl: 'https://drift.example/rss' }, { feedGuid: 'g-1' }),
      },
      {
        title: 'Harbour Hours',
        feed_url: 'https://harbour.example/rss/',
        podroll_json: roll(
          { feedUrl: 'http://DRIFT.example/rss/' },
          { feedUrl: 'https://lowtide.example/feed.xml' },
        ),
      },
      { title: 'Quiet Show', feed_url: 'https://quiet.example/rss', podroll_json: null },
    ]);
    expect(picks.map((p) => [p.key, p.pickedBy])).toEqual([
      ['drift.example/rss', ['Low Tide Radio', 'Harbour Hours']],
      ['guid:g-1', ['Low Tide Radio']],
    ]);
  });

  it('ignores a damaged list', () => {
    expect(
      collectPicks([{ title: 'A', feed_url: 'https://a.example', podroll_json: '{not json' }]),
    ).toEqual([]);
  });

  it('compares feed addresses loosely', () => {
    expect(feedKey('HTTPS://Drift.example/rss/')).toBe('drift.example/rss');
  });
});
